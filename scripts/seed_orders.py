#!/usr/bin/env python3
"""Put two real sealed orders into the live Dark Book and stop.

Capture helper for the demo film. e2e_demo.py submits and settles in one go, which
never leaves the book populated long enough to film. This does the first half only:
tops up escrow if needed, submits one BUY and one SELL, and exits — so the Dark Book
can be filmed with orders resting, and the batch can then be triggered from the UI
itself (which is the flow worth showing, and also exercises the button).

Usage: python seed_orders.py [--engine-url URL] [--base-amount 2.0]
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests
from eth_account import Account
from web3 import Web3

sys.path.insert(0, str(Path(__file__).resolve().parent))

from umbra_lib import (  # noqa: E402
    erc20_abi,
    load_abi,
    load_env,
    make_w3,
    order_types,
    seal_order,
    send_tx,
    sign_order,
)

BUY, SELL = 0, 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine-url", default=None)
    ap.add_argument("--base-amount", type=float, default=2.0)
    # Each settled batch rotates the pair's inventory: the buyer ends up holding
    # base and the seller holding quote. Flipping sides on alternate runs keeps
    # both wallets solvent without going back to the faucet.
    ap.add_argument("--reverse", action="store_true")
    args = ap.parse_args()

    env = load_env()
    engine = (args.engine_url or env["ENGINE_URL"]).rstrip("/")
    w3 = make_w3(env["COSTON2_RPC_URL"])

    vault = w3.eth.contract(
        address=Web3.to_checksum_address(env["VAULT_ADDRESS"]), abi=load_abi("UmbraVault")
    )
    fxrp = w3.eth.contract(
        address=Web3.to_checksum_address(env["FXRP_ADDRESS"]), abi=erc20_abi()
    )
    usdt0 = w3.eth.contract(
        address=Web3.to_checksum_address(env["USDT0_ADDRESS"]), abi=erc20_abi()
    )

    alice = Account.from_key(env["ALICE_PRIVATE_KEY"])
    bob = Account.from_key(env["BOB_PRIVATE_KEY"])
    buyer, seller = (bob, alice) if args.reverse else (alice, bob)

    info = requests.get(f"{engine}/info", timeout=20).json()
    domain = info["eip712_domain"]
    pubkey = info["order_encryption_pubkey_b64"]
    print(f"engine   : {engine}")
    print(f"mode     : {info['mode']}  signer {info['tee_eth_address']}")

    price, _ = vault.functions.peekPrice1e6().call()
    print(f"FTSOv2   : ${price / 1e6:.6f}")

    base_amount = int(args.base_amount * 10**6)
    quote_needed = vault.functions.quoteFor(base_amount, price * 10300 // 10000).call()

    # Top up only the shortfall — settlement leaves proceeds in the vault, so a
    # trader often already holds enough from a previous run.
    for account, tok, need, label in (
        (buyer, usdt0, quote_needed, "buyer USDT0"),
        (seller, fxrp, base_amount, "seller FXRP"),
    ):
        held = vault.functions.balanceOf(account.address, tok.address).call()
        short = max(0, need - held)
        if short == 0:
            print(f"escrow   : {label} already covered ({held / 1e6:.6f})")
            continue
        wallet = tok.functions.balanceOf(account.address).call()
        if wallet < short:
            print(f"FAIL     : {label} needs {short / 1e6:.6f}, wallet holds {wallet / 1e6:.6f}")
            return 1
        if tok.functions.allowance(account.address, vault.address).call() < short:
            send_tx(w3, account, tok.functions.approve(vault.address, short).build_transaction(
                {"from": account.address}), f"{label} approve")
        send_tx(w3, account, vault.functions.deposit(tok.address, short).build_transaction(
            {"from": account.address}), f"{label} deposit")
        print(f"escrow   : {label} topped up {short / 1e6:.6f}")

    deadline = int(time.time()) + 3600
    nonce0 = int(time.time() * 1000)
    order_ids = []

    for i, (account, side, limit, label) in enumerate([
        (buyer, BUY, price * 10200 // 10000, "BUY"),
        (seller, SELL, price * 9800 // 10000, "SELL"),
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
        r = requests.post(
            f"{engine}/orders",
            json={"ciphertext_b64": seal_order(pubkey, wire)},
            timeout=30,
        )
        if r.status_code != 200:
            print(f"FAIL     : {label} rejected {r.status_code} {r.text[:200]}")
            return 1
        oid = r.json()["order_id"]
        order_ids.append(oid)
        print(f"submitted: {label:<4} {args.base_amount} FXRP @ ${limit / 1e6:.6f}  order_id {oid}")

    book = requests.get(f"{engine}/orderbook/public", timeout=20).json()
    print(f"dark book: {book['count_buys']} buy · {book['count_sells']} sell")

    # The status endpoint added after the audit — a trader can look their order up,
    # and gets status only, never contents.
    for oid in order_ids:
        s = requests.get(f"{engine}/orders/{oid}", timeout=20).json()
        print(f"status   : {oid[:8]}… -> {s['status']}  (keys: {sorted(s)})")

    print("\nBook is loaded. Trigger the batch from /settlement to film it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
