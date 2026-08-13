#!/usr/bin/env python3
"""The H14 gate: two sealed orders in, a real settleBatch on Coston2, balances moved.

Every assertion that matters is an equality against on-chain state read independently of the
engine's own report. The engine is never trusted about anything the chain can be asked directly.

Usage:
    python scripts/seed_demo.py [--engine-url URL] [--base-amount 3.0] [--no-withdraw]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from eth_account import Account
from web3 import Web3
from web3.logs import DISCARD

sys.path.insert(0, str(Path(__file__).resolve().parent))

from umbra_lib import (  # noqa: E402
    EXPLORER,
    Checks,
    die,
    erc20_abi,
    load_abi,
    load_env,
    make_w3,
    seal_order,
    send_tx,
    sign_order,
)

BUY, SELL = 0, 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine-url", default="http://127.0.0.1:8080")
    parser.add_argument("--base-amount", type=float, default=3.0)
    parser.add_argument("--no-withdraw", action="store_true")
    args = parser.parse_args()

    env = load_env()
    engine = args.engine_url.rstrip("/")
    w3 = make_w3(env["COSTON2_RPC_URL"])
    checks = Checks()

    vault = w3.eth.contract(address=Web3.to_checksum_address(env["VAULT_ADDRESS"]), abi=load_abi("UmbraVault"))
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(env["REGISTRY_ADDRESS"]), abi=load_abi("TeeRegistry")
    )
    fxrp = w3.eth.contract(address=Web3.to_checksum_address(env["FXRP_ADDRESS"]), abi=erc20_abi())
    usdt0 = w3.eth.contract(address=Web3.to_checksum_address(env["USDT0_ADDRESS"]), abi=erc20_abi())

    alice = Account.from_key(env["ALICE_PRIVATE_KEY"])
    bob = Account.from_key(env["BOB_PRIVATE_KEY"])

    # ─────────────────── step 0: preflight ───────────────────
    print("\n\033[1mSTEP 0 — preflight\033[0m")
    checks.equal("chain id is Coston2", w3.eth.chain_id, 114)
    checks.check("vault has code", len(w3.eth.get_code(vault.address)) > 0)
    checks.equal("vault.baseToken == FXRP", vault.functions.baseToken().call(), fxrp.address)
    checks.equal("vault.quoteToken == USDT0", vault.functions.quoteToken().call(), usdt0.address)
    checks.equal(
        "vault.baseDecimals matches the token", vault.functions.baseDecimals().call(),
        fxrp.functions.decimals().call(),
    )

    try:
        info = requests.get(f"{engine}/info", timeout=15).json()
        attestation = requests.get(f"{engine}/attestation", timeout=20).json()
    except Exception as exc:
        die(f"engine unreachable at {engine}: {exc}")

    print(f"  engine mode: \033[1m{info['mode']}\033[0m  attestation: {attestation['status']}")
    print(f"  image digest: {attestation['image_digest']}")
    checks.equal("engine chain id", info["chain_id"], 114)
    checks.equal("engine vault", Web3.to_checksum_address(info["vault"]), vault.address)

    tee = Web3.to_checksum_address(info["tee_eth_address"])
    on_chain_signer = registry.functions.teeSigner().call()
    if on_chain_signer != tee:
        die(
            f"enclave key {tee} is not the registered signer {on_chain_signer}.\n"
            "  Run ./scripts/register_tee.sh (the enclave mints a new key on every restart)."
        )
    checks.equal("registered TEE signer matches the live enclave", on_chain_signer, tee)
    checks.check("enclave holds gas", w3.eth.get_balance(tee) > 10**17)

    price, oracle_ts = vault.functions.peekPrice1e6().call()
    age = int(time.time()) - oracle_ts
    checks.check("FTSOv2 price is live", price > 0, f"price={price}")
    checks.check("oracle reading is fresh", age < vault.functions.maxOracleAge().call(), f"{age}s old")
    print(f"  XRP/USD = ${price / 1e6:.6f}  ({age}s old)")

    base_amount = int(args.base_amount * 10**6)
    quote_deposit = vault.functions.quoteFor(base_amount, price * 10300 // 10000).call()
    checks.check("Alice holds enough USDT0", usdt0.functions.balanceOf(alice.address).call() >= quote_deposit)
    checks.check("Bob holds enough FXRP", fxrp.functions.balanceOf(bob.address).call() >= base_amount)

    if checks.failed:
        return checks.report()

    # ─────────────────── step 1: deposits ───────────────────
    print("\n\033[1mSTEP 1 — deposits\033[0m")
    for account, token, amount, label in (
        (alice, usdt0, quote_deposit, "Alice USDT0"),
        (bob, fxrp, base_amount, "Bob FXRP"),
    ):
        before = vault.functions.balanceOf(account.address, token.address).call()
        if token.functions.allowance(account.address, vault.address).call() < amount:
            send_tx(w3, account, token.functions.approve(vault.address, amount).build_transaction(
                {"from": account.address}), f"{label} approve")
        send_tx(w3, account, vault.functions.deposit(token.address, amount).build_transaction(
            {"from": account.address}), f"{label} deposit")
        after = vault.functions.balanceOf(account.address, token.address).call()
        checks.equal(f"{label} deposit credited exactly", after - before, amount)

    snapshot = {
        "alice_base": vault.functions.balanceOf(alice.address, fxrp.address).call(),
        "alice_quote": vault.functions.balanceOf(alice.address, usdt0.address).call(),
        "bob_base": vault.functions.balanceOf(bob.address, fxrp.address).call(),
        "bob_quote": vault.functions.balanceOf(bob.address, usdt0.address).call(),
        "vault_fxrp": fxrp.functions.balanceOf(vault.address).call(),
        "vault_usdt0": usdt0.functions.balanceOf(vault.address).call(),
        "last_batch_id": vault.functions.lastBatchId().call(),
    }

    # ─────────────────── step 2: sealed orders ───────────────────
    print("\n\033[1mSTEP 2 — sealed orders\033[0m")
    domain = info["eip712_domain"]
    pubkey = info["order_encryption_pubkey_b64"]
    deadline = int(time.time()) + 3600
    base_nonce = int(time.time() * 1000)

    plan = [
        (alice, BUY, price * 10200 // 10000, "Alice BUY"),
        (bob, SELL, price * 9800 // 10000, "Bob SELL"),
    ]
    for index, (account, side, limit, label) in enumerate(plan):
        struct = {
            "trader": account.address,
            "side": side,
            "amountBase": base_amount,
            "limitPrice1e6": limit,
            "nonce": base_nonce + index,
            "deadline": deadline,
        }
        payload = {
            "trader": account.address,
            "side": side,
            "amount_base": base_amount,
            "limit_price_1e6": limit,
            "nonce": base_nonce + index,
            "deadline": deadline,
            "signature": sign_order(account, domain, struct),
        }
        ciphertext = seal_order(pubkey, payload)
        response = requests.post(f"{engine}/orders", json={"ciphertext_b64": ciphertext}, timeout=30)
        checks.equal(f"{label} accepted", response.status_code, 200)
        body = response.json()
        checks.equal(f"{label} response shape is exactly accepted+order_id",
                     set(body.keys()), {"accepted", "order_id"})
        # The response must not echo any plaintext value back.
        leaked = [
            str(v) for v in (base_amount, limit, base_nonce + index, deadline)
            if str(v) in response.text
        ] + ([payload["signature"]] if payload["signature"] in response.text else [])
        checks.check(f"{label} response leaks no plaintext", not leaked, f"leaked {leaked}")

    book = requests.get(f"{engine}/orderbook/public", timeout=15).json()
    checks.equal("dark book counts one buy", book["count_buys"], 1)
    checks.equal("dark book counts one sell", book["count_sells"], 1)
    checks.equal("dark book exposes two ciphertexts", len(book["ciphertext_previews"]), 2)
    checks.check(
        "dark book exposes no plaintext",
        str(base_amount) not in json.dumps(book),
    )

    # ─────────────────── step 3: batch ───────────────────
    print("\n\033[1mSTEP 3 — batch (operator gated)\033[0m")
    checks.equal("batch/run rejects a missing token",
                 requests.post(f"{engine}/batch/run", json={}, timeout=30).status_code, 401)
    checks.equal("batch/run rejects a wrong token",
                 requests.post(f"{engine}/batch/run", json={},
                               headers={"X-Umbra-Operator-Token": "wrong"}, timeout=30).status_code, 401)

    response = requests.post(
        f"{engine}/batch/run", json={},
        headers={"X-Umbra-Operator-Token": env["OPERATOR_TOKEN"]}, timeout=300,
    )
    if response.status_code != 200:
        die(f"batch/run failed: {response.status_code} {response.text[:400]}")
    batch = response.json()
    if batch["status"] != "settled":
        die(f"batch did not settle: {batch.get('status')} "
            f"{batch.get('error_code')} {batch.get('error_detail')}")

    checks.equal("batch settled", batch["status"], "settled")
    checks.equal("batch id follows the previous one", batch["batch_id"], snapshot["last_batch_id"] + 1)
    checks.equal("one fill", batch["fill_count"], 1)
    print(f"  tx {EXPLORER}/tx/{batch['tx_hash']}")

    # ─────────────────── step 4: on-chain assertions ───────────────────
    print("\n\033[1mSTEP 4 — on-chain verification (independent of the engine)\033[0m")
    receipt = w3.eth.get_transaction_receipt(batch["tx_hash"])
    checks.equal("receipt status is success", receipt["status"], 1)
    checks.equal("receipt target is the vault", receipt["to"], vault.address)

    settled_events = vault.events.BatchSettled().process_receipt(receipt, errors=DISCARD)
    fill_events = vault.events.FillSettled().process_receipt(receipt, errors=DISCARD)
    checks.equal("one BatchSettled event", len(settled_events), 1)
    checks.equal("one FillSettled event", len(fill_events), 1)

    settled = settled_events[0]["args"]
    fill = fill_events[0]["args"]
    checks.equal("event batchId", settled["batchId"], snapshot["last_batch_id"] + 1)
    checks.equal("event teeSigner is the registered enclave", settled["teeSigner"], tee)

    clearing = settled["clearingPrice1e6"]
    oracle = settled["oraclePrice1e6"]
    max_bps = vault.functions.maxDeviationBps().call()
    deviation = abs(clearing - oracle) * 10_000 // oracle
    checks.check("clearing price is inside the FTSOv2 band",
                 deviation <= max_bps, f"{deviation} bps > {max_bps}")
    print(f"  cleared ${clearing / 1e6:.6f} vs oracle ${oracle / 1e6:.6f}  ({deviation} bps of {max_bps})")

    checks.equal("fill buyer is Alice", fill["buyer"], alice.address)
    checks.equal("fill seller is Bob", fill["seller"], bob.address)
    checks.equal("fill amountBase", fill["amountBase"], base_amount)
    # The formula parity check, evaluated by deployed bytecode rather than by our Python.
    checks.equal("fill amountQuote equals vault.quoteFor",
                 fill["amountQuote"], vault.functions.quoteFor(base_amount, clearing).call())

    amount_quote = fill["amountQuote"]
    checks.equal("lastBatchId advanced", vault.functions.lastBatchId().call(), snapshot["last_batch_id"] + 1)
    checks.equal("Alice base +amountBase",
                 vault.functions.balanceOf(alice.address, fxrp.address).call(),
                 snapshot["alice_base"] + base_amount)
    checks.equal("Alice quote -amountQuote",
                 vault.functions.balanceOf(alice.address, usdt0.address).call(),
                 snapshot["alice_quote"] - amount_quote)
    checks.equal("Bob base -amountBase",
                 vault.functions.balanceOf(bob.address, fxrp.address).call(),
                 snapshot["bob_base"] - base_amount)
    checks.equal("Bob quote +amountQuote",
                 vault.functions.balanceOf(bob.address, usdt0.address).call(),
                 snapshot["bob_quote"] + amount_quote)

    # Settlement moves internal ledger entries only — no tokens leave or enter the vault.
    checks.equal("vault FXRP holdings unchanged",
                 fxrp.functions.balanceOf(vault.address).call(), snapshot["vault_fxrp"])
    checks.equal("vault USDT0 holdings unchanged",
                 usdt0.functions.balanceOf(vault.address).call(), snapshot["vault_usdt0"])

    detail = requests.get(f"{engine}/batches/{batch['batch_id']}", timeout=15).json()
    checks.check("settled batch exposes its fills", detail.get("fills") is not None)
    book_after = requests.get(f"{engine}/orderbook/public", timeout=15).json()
    checks.equal("book drained", (book_after["count_buys"], book_after["count_sells"]), (0, 0))

    # ─────────────────── step 5: withdrawal ───────────────────
    if not args.no_withdraw:
        print("\n\033[1mSTEP 5 — withdrawal is ungated\033[0m")
        wallet_before = fxrp.functions.balanceOf(alice.address).call()
        send_tx(w3, alice, vault.functions.withdraw(fxrp.address, base_amount).build_transaction(
            {"from": alice.address}), "Alice withdraw")
        checks.equal("Alice received her FXRP",
                     fxrp.functions.balanceOf(alice.address).call(), wallet_before + base_amount)

    print(f"\n\033[1mSETTLEMENT:\033[0m {EXPLORER}/tx/{batch['tx_hash']}")
    return checks.report()


if __name__ == "__main__":
    raise SystemExit(main())
