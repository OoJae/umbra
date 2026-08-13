"""Shared helpers for the Umbra demo scripts.

Kept separate so the Phase-4 rehearsal (scripts/e2e_demo.py) can reuse this rather than
copy-pasting the Phase-2 gate script.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path
from typing import Any

from eth_account import Account
from eth_account.messages import encode_typed_data
from nacl.public import PublicKey, SealedBox
from web3 import Web3

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPLORER = "https://coston2-explorer.flare.network"


def load_env() -> dict[str, str]:
    """Parse the repo-root .env without adding a dependency to the scripts."""
    env: dict[str, str] = {}
    path = REPO_ROOT / ".env"
    if path.is_file():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    env.update({k: v for k, v in os.environ.items() if k in env or k.endswith("_ADDRESS")})
    return env


def make_w3(rpc_url: str) -> Web3:
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 60}))
    if not w3.is_connected():
        raise SystemExit(f"cannot reach RPC {rpc_url}")
    return w3


def load_abi(name: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "contracts" / "out" / f"{name}.sol" / f"{name}.json"
    return json.loads(path.read_text())["abi"]


def erc20_abi() -> list[dict[str, Any]]:
    return json.loads((REPO_ROOT / "engine" / "app" / "abi" / "ERC20.json").read_text())


def eip712_spec() -> dict[str, Any]:
    return json.loads((REPO_ROOT / "docs" / "eip712.json").read_text())


def order_types() -> dict[str, Any]:
    """Filtered to Order only — the spec has two unreferenced root types, so the full dict makes
    eth_account's primary-type inference ambiguous."""
    return {"Order": eip712_spec()["types"]["Order"]}


def send_tx(w3: Web3, account, tx: dict[str, Any], label: str) -> dict[str, Any]:
    """Sign, send, and wait. EIP-1559; Coston2 supports type-2 transactions."""
    latest = w3.eth.get_block("latest")
    base_fee = latest.get("baseFeePerGas", 0)
    try:
        tip = w3.eth.max_priority_fee
    except Exception:
        tip = Web3.to_wei(1, "gwei")
    tx.setdefault("chainId", w3.eth.chain_id)
    tx.setdefault("nonce", w3.eth.get_transaction_count(account.address, "pending"))
    tx.setdefault("maxPriorityFeePerGas", tip)
    tx.setdefault("maxFeePerGas", base_fee * 3 + tip)
    tx.setdefault("type", 2)
    if "gas" not in tx:
        tx["gas"] = int(w3.eth.estimate_gas({**tx, "from": account.address}) * 1.3)
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180, poll_latency=2)
    if receipt["status"] != 1:
        raise SystemExit(f"{label} reverted: {tx_hash.to_0x_hex()}")
    return receipt


def sign_order(account, domain: dict[str, Any], order: dict[str, Any]) -> str:
    signable = encode_typed_data(domain, order_types(), order)
    return Account.sign_message(signable, account.key).signature.to_0x_hex()


def seal_order(pubkey_b64: str, payload: dict[str, Any]) -> str:
    """libsodium crypto_box_seal to the enclave's X25519 key.

    The pubkey is STANDARD base64 with padding; the browser side must decode it with
    sodium.base64_variants.ORIGINAL rather than the library default.
    """
    box = SealedBox(PublicKey(base64.b64decode(pubkey_b64)))
    ciphertext = box.encrypt(json.dumps(payload).encode())
    return base64.b64encode(ciphertext).decode()


class Checks:
    """Accumulates assertions so a single run surfaces every failure, not just the first."""

    def __init__(self) -> None:
        self.passed = 0
        self.failed: list[str] = []

    def check(self, label: str, condition: bool, detail: str = "") -> bool:
        if condition:
            self.passed += 1
            print(f"  \033[32m✓\033[0m {label}")
        else:
            self.failed.append(label)
            print(f"  \033[31m✗\033[0m {label}" + (f"  — {detail}" if detail else ""))
        return condition

    def equal(self, label: str, got: Any, want: Any) -> bool:
        return self.check(label, got == want, f"got {got}, want {want}")

    def report(self) -> int:
        print()
        if self.failed:
            print(f"\033[31m{len(self.failed)} check(s) FAILED\033[0m, {self.passed} passed")
            for name in self.failed:
                print(f"    - {name}")
            return 1
        print(f"\033[32mall {self.passed} checks passed\033[0m")
        return 0


def die(message: str) -> None:
    print(f"\033[31mFATAL:\033[0m {message}", file=sys.stderr)
    raise SystemExit(1)
