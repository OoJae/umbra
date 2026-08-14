#!/usr/bin/env python3
"""The end-to-end rehearsal: the exact flow the demo video shows, asserted at every step.

Built on scripts/umbra_lib.py, which was split out in Phase 2 precisely so this script could
reuse it rather than fork the gate script.

Governing principle, inherited from seed_demo.py: every assertion that matters is an equality
against on-chain state read independently of the engine's own report. The engine is never
trusted about anything the chain can be asked directly.

Two things here go beyond the Phase-2 gate script:
  * a /healthz preflight that reports which TEE_MODE is actually live, and
  * a replay-protection assertion — the identical signed batch is re-submitted via eth_call and
    must revert with BadBatchId. It costs no gas and it is the only place the suite demonstrates
    on-chain replay defence.

Usage:
    python scripts/e2e_demo.py                      # against the local/default engine
    python scripts/e2e_demo.py --engine-url <URL>   # e.g. the deployed Vercel proxy
    python scripts/e2e_demo.py --reverse            # flip who buys, so it can run repeatedly
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
    parser.add_argument(
        "--engine-url",
        default=None,
        help="defaults to ENGINE_URL from .env, so the script follows wherever the enclave lives",
    )
    parser.add_argument("--base-amount", type=float, default=2.0)
    parser.add_argument("--reverse", action="store_true", help="Bob buys, Alice sells")
    parser.add_argument("--no-withdraw", action="store_true")
    args = parser.parse_args()

    env = load_env()
    engine = (args.engine_url or env.get("ENGINE_URL") or "http://127.0.0.1:8080").rstrip("/")
    w3 = make_w3(env["COSTON2_RPC_URL"])
    checks = Checks()

    vault = w3.eth.contract(
        address=Web3.to_checksum_address(env["VAULT_ADDRESS"]), abi=load_abi("UmbraVault")
    )
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(env["REGISTRY_ADDRESS"]), abi=load_abi("TeeRegistry")
    )
    fxrp = w3.eth.contract(address=Web3.to_checksum_address(env["FXRP_ADDRESS"]), abi=erc20_abi())
    usdt0 = w3.eth.contract(address=Web3.to_checksum_address(env["USDT0_ADDRESS"]), abi=erc20_abi())

    a, b = Account.from_key(env["ALICE_PRIVATE_KEY"]), Account.from_key(env["BOB_PRIVATE_KEY"])
    buyer, seller = (b, a) if args.reverse else (a, b)
    buyer_name, seller_name = ("Bob", "Alice") if args.reverse else ("Alice", "Bob")

    # ───────────────────── 1. preflight ─────────────────────
    print("\n\033[1m1 — PREFLIGHT\033[0m")
    checks.equal("chain is Coston2", w3.eth.chain_id, 114)
    checks.check("vault is deployed", len(w3.eth.get_code(vault.address)) > 0)

    try:
        health = requests.get(f"{engine}/healthz", timeout=15).json()
        info = requests.get(f"{engine}/info", timeout=15).json()
        att = requests.get(f"{engine}/attestation", timeout=25).json()
    except Exception as exc:
        die(f"engine unreachable at {engine}: {exc}")

    mode = info["mode"]
    payload = att.get("decoded", {}).get("payload", {})
    real_tee = (
        att.get("decoded", {}).get("header", {}).get("alg") == "RS256"
        and payload.get("hwmodel") == "GCP_INTEL_TDX"
        and payload.get("secboot") is True
    )
    banner = "REAL TEE (Intel TDX)" if real_tee else f"{mode.upper()}"
    print(f"  enclave mode: \033[1m{banner}\033[0m   attestation: {att['status']}")
    print(f"  hwmodel={payload.get('hwmodel')}  secboot={payload.get('secboot')}  "
          f"dbgstat={payload.get('dbgstat')}")
    print(f"  image: {att['image_digest']}")

    checks.check("engine reports healthy", health.get("status") == "ok")
    checks.check("engine reports ready", health.get("ready") is True)
    checks.equal("engine is on our chain", info["chain_id"], 114)
    checks.equal("engine points at our vault", Web3.to_checksum_address(info["vault"]), vault.address)

    tee = Web3.to_checksum_address(info["tee_eth_address"])
    on_chain_signer = registry.functions.teeSigner().call()
    if on_chain_signer != tee:
        die(
            f"the live enclave key {tee} is not the registered signer {on_chain_signer}.\n"
            "  The enclave mints a new key on every boot — run ./scripts/register_tee.sh."
        )
    checks.equal("enclave key is the registered signer", on_chain_signer, tee)
    checks.check("enclave holds gas for settlement", w3.eth.get_balance(tee) > 10**17)

    # The attestation hash must be what is actually anchored, recomputed rather than trusted.
    computed = Web3.keccak(text=att["raw"]).hex()
    computed = computed if computed.startswith("0x") else "0x" + computed
    anchored = registry.functions.attestationHash().call().hex()
    anchored = anchored if anchored.startswith("0x") else "0x" + anchored
    checks.equal("attestation hash matches the on-chain anchor", computed, anchored)

    price, oracle_ts = vault.functions.peekPrice1e6().call()
    checks.check("FTSOv2 XRP/USD is live", price > 0)
    checks.check(
        "oracle reading is fresh",
        int(time.time()) - oracle_ts < vault.functions.maxOracleAge().call(),
    )
    print(f"  FTSOv2 XRP/USD = ${price / 1e6:.6f}  ({int(time.time()) - oracle_ts}s old)")

    base_amount = int(args.base_amount * 10**6)
    # Escrow is reserved at the buyer's limit, so size the requirement there with headroom.
    quote_needed = vault.functions.quoteFor(base_amount, price * 10300 // 10000).call()

    # Only top up the shortfall: a trader may already hold escrow from a previous run, and
    # settlement leaves the proceeds in the vault rather than the wallet.
    buyer_escrow = vault.functions.balanceOf(buyer.address, usdt0.address).call()
    seller_escrow = vault.functions.balanceOf(seller.address, fxrp.address).call()
    quote_deposit = max(0, quote_needed - buyer_escrow)
    base_deposit = max(0, base_amount - seller_escrow)

    checks.check(
        f"{buyer_name} can cover {quote_needed / 1e6:.6f} USDT0",
        usdt0.functions.balanceOf(buyer.address).call() >= quote_deposit,
        f"vault has {buyer_escrow / 1e6:.6f}, wallet must supply {quote_deposit / 1e6:.6f}",
    )
    checks.check(
        f"{seller_name} can cover {base_amount / 1e6:.6f} FXRP",
        fxrp.functions.balanceOf(seller.address).call() >= base_deposit,
        f"vault has {seller_escrow / 1e6:.6f}, wallet must supply {base_deposit / 1e6:.6f}",
    )
    if checks.failed:
        return checks.report()

    # ───────────────────── 2. deposits ─────────────────────
    print("\n\033[1m2 — DEPOSITS\033[0m")
    for account, tok, amount, label in (
        (buyer, usdt0, quote_deposit, f"{buyer_name} USDT0"),
        (seller, fxrp, base_deposit, f"{seller_name} FXRP"),
    ):
        if amount == 0:
            print(f"  \033[32m✓\033[0m {label} already escrowed — nothing to deposit")
            continue
        before = vault.functions.balanceOf(account.address, tok.address).call()
        if tok.functions.allowance(account.address, vault.address).call() < amount:
            send_tx(w3, account, tok.functions.approve(vault.address, amount).build_transaction(
                {"from": account.address}), f"{label} approve")
        send_tx(w3, account, vault.functions.deposit(tok.address, amount).build_transaction(
            {"from": account.address}), f"{label} deposit")
        after = vault.functions.balanceOf(account.address, tok.address).call()
        checks.equal(f"{label} credited exactly", after - before, amount)

    snap = {
        "buyer_base": vault.functions.balanceOf(buyer.address, fxrp.address).call(),
        "buyer_quote": vault.functions.balanceOf(buyer.address, usdt0.address).call(),
        "seller_base": vault.functions.balanceOf(seller.address, fxrp.address).call(),
        "seller_quote": vault.functions.balanceOf(seller.address, usdt0.address).call(),
        "vault_fxrp": fxrp.functions.balanceOf(vault.address).call(),
        "vault_usdt0": usdt0.functions.balanceOf(vault.address).call(),
        "last_batch": vault.functions.lastBatchId().call(),
    }

    # ───────────────────── 3. sealed orders ─────────────────────
    print("\n\033[1m3 — SEALED ORDERS\033[0m")
    domain = info["eip712_domain"]
    pubkey = info["order_encryption_pubkey_b64"]
    deadline = int(time.time()) + 3600
    nonce0 = int(time.time() * 1000)

    for i, (account, side, limit, label) in enumerate([
        (buyer, BUY, price * 10200 // 10000, f"{buyer_name} BUY"),
        (seller, SELL, price * 9800 // 10000, f"{seller_name} SELL"),
    ]):
        struct = {
            "trader": account.address, "side": side, "amountBase": base_amount,
            "limitPrice1e6": limit, "nonce": nonce0 + i, "deadline": deadline,
        }
        wire = {
            "trader": account.address, "side": side, "amount_base": base_amount,
            "limit_price_1e6": limit, "nonce": nonce0 + i, "deadline": deadline,
            "signature": sign_order(account, domain, struct),
        }
        resp = requests.post(
            f"{engine}/orders",
            json={"ciphertext_b64": seal_order(pubkey, wire)},
            timeout=30,
        )
        checks.equal(f"{label} accepted", resp.status_code, 200)
        checks.equal(f"{label} returns only accepted+order_id", set(resp.json()), {"accepted", "order_id"})
        leaked = [str(v) for v in (base_amount, limit, nonce0 + i, deadline) if str(v) in resp.text]
        checks.check(f"{label} response leaks no plaintext", not leaked, f"leaked {leaked}")

    book = requests.get(f"{engine}/orderbook/public", timeout=15).json()
    checks.equal("dark book holds one buy and one sell",
                 (book["count_buys"], book["count_sells"]), (1, 1))
    checks.check("dark book exposes no plaintext", str(base_amount) not in json.dumps(book))

    # ───────────────────── 4. batch ─────────────────────
    print("\n\033[1m4 — BATCH\033[0m")
    resp = requests.post(
        f"{engine}/batch/run", json={},
        headers={"X-Umbra-Operator-Token": env["OPERATOR_TOKEN"]}, timeout=300,
    )
    if resp.status_code != 200:
        die(f"batch/run failed: {resp.status_code} {resp.text[:300]}")
    batch = resp.json()
    if batch["status"] != "settled":
        die(f"batch did not settle: {batch.get('status')} {batch.get('error_detail')}")
    checks.equal("batch settled", batch["status"], "settled")
    checks.equal("batch id incremented", batch["batch_id"], snap["last_batch"] + 1)
    print(f"  {EXPLORER}/tx/{batch['tx_hash']}")

    # ───────────────────── 5. on-chain assertions ─────────────────────
    print("\n\033[1m5 — ON-CHAIN VERIFICATION\033[0m")
    receipt = w3.eth.get_transaction_receipt(batch["tx_hash"])
    checks.equal("transaction succeeded", receipt["status"], 1)
    settled = vault.events.BatchSettled().process_receipt(receipt, errors=DISCARD)
    fills = vault.events.FillSettled().process_receipt(receipt, errors=DISCARD)
    checks.equal("one BatchSettled event", len(settled), 1)
    checks.equal("one FillSettled event", len(fills), 1)

    ev, fill = settled[0]["args"], fills[0]["args"]
    checks.equal("event signer is the attested enclave", ev["teeSigner"], tee)
    clearing, oracle = ev["clearingPrice1e6"], ev["oraclePrice1e6"]
    band = vault.functions.maxDeviationBps().call()
    dev = abs(clearing - oracle) * 10_000 // oracle
    checks.check("clearing price inside the FTSOv2 band", dev <= band, f"{dev} bps > {band}")
    print(f"  cleared ${clearing / 1e6:.6f} vs oracle ${oracle / 1e6:.6f}  ({dev} bps of {band})")

    checks.equal("fill buyer", fill["buyer"], buyer.address)
    checks.equal("fill seller", fill["seller"], seller.address)
    checks.equal("fill amount", fill["amountBase"], base_amount)
    # Formula parity, evaluated by deployed bytecode rather than reimplemented here.
    checks.equal("amountQuote equals vault.quoteFor",
                 fill["amountQuote"], vault.functions.quoteFor(base_amount, clearing).call())
    q = fill["amountQuote"]

    checks.equal("lastBatchId advanced", vault.functions.lastBatchId().call(), snap["last_batch"] + 1)
    checks.equal(f"{buyer_name} base +{base_amount}",
                 vault.functions.balanceOf(buyer.address, fxrp.address).call(), snap["buyer_base"] + base_amount)
    checks.equal(f"{buyer_name} quote -{q}",
                 vault.functions.balanceOf(buyer.address, usdt0.address).call(), snap["buyer_quote"] - q)
    checks.equal(f"{seller_name} base -{base_amount}",
                 vault.functions.balanceOf(seller.address, fxrp.address).call(), snap["seller_base"] - base_amount)
    checks.equal(f"{seller_name} quote +{q}",
                 vault.functions.balanceOf(seller.address, usdt0.address).call(), snap["seller_quote"] + q)
    # Settlement moves the internal ledger only; no tokens enter or leave the vault.
    checks.equal("vault FXRP holdings unchanged",
                 fxrp.functions.balanceOf(vault.address).call(), snap["vault_fxrp"])
    checks.equal("vault USDT0 holdings unchanged",
                 usdt0.functions.balanceOf(vault.address).call(), snap["vault_usdt0"])

    # ───────────────────── 6. replay protection ─────────────────────
    print("\n\033[1m6 — REPLAY PROTECTION\033[0m")
    detail = requests.get(f"{engine}/batches/{batch['batch_id']}", timeout=15).json()
    if detail.get("fills"):
        rebuilt = (
            detail["batch_id"],
            detail["clearing_price_1e6"],
            detail["oracle_ts"],
            [(Web3.to_checksum_address(f["buyer"]), Web3.to_checksum_address(f["seller"]),
              f["amount_base"], f["amount_quote"]) for f in detail["fills"]],
        )
        try:
            # eth_call, so this costs nothing and changes nothing.
            vault.functions.settleBatch(rebuilt, b"\x00" * 65).call({"from": tee})
            checks.check("re-submitting a settled batch reverts", False, "it did not revert")
        except Exception as exc:
            text = str(exc)
            # BadBatchId is checked before the signature, so a dummy signature still proves it.
            checks.check(
                "re-submitting a settled batch reverts with BadBatchId",
                "0xd870007a" in text or "BadBatchId" in text,
                text[:120],
            )
    else:
        checks.check("batch detail exposes fills once settled", False, "fills were null")

    # ───────────────────── 7. withdrawal ─────────────────────
    if not args.no_withdraw:
        print("\n\033[1m7 — WITHDRAWAL IS UNGATED\033[0m")
        before = fxrp.functions.balanceOf(buyer.address).call()
        send_tx(w3, buyer, vault.functions.withdraw(fxrp.address, base_amount).build_transaction(
            {"from": buyer.address}), f"{buyer_name} withdraw")
        checks.equal(f"{buyer_name} received the FXRP",
                     fxrp.functions.balanceOf(buyer.address).call(), before + base_amount)

    print(f"\n\033[1mSETTLEMENT:\033[0m {EXPLORER}/tx/{batch['tx_hash']}")
    print(f"\033[1mENCLAVE:\033[0m {banner} · {tee}")
    return checks.report()


if __name__ == "__main__":
    raise SystemExit(main())
