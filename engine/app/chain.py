"""Everything that touches Coston2: reads, batch signing, preflight, and settlement.

Two rules shape this module.

First, reuse the contract's own views rather than reimplementing its arithmetic. `peekPrice1e6()`
runs the same `_toPrice1e6` normalization `settleBatch` runs (feed decimals genuinely differ —
XRP/USD reports 6, FLR/USD reports 8), `previewBand()` applies the contract's own band maths, and
`quoteFor()` evaluates the frozen settlement formula in deployed bytecode. A second Python
implementation of any of those is a second thing that can disagree.

Second, refuse rather than revert. A burned transaction costs a demo slot; a refusal costs a
retry. Every deterministic revert path is checked before signing, and the exact call is simulated
before broadcasting.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from eth_utils.abi import function_abi_to_4byte_selector
from web3 import Web3
from web3.exceptions import ContractLogicError
from web3.logs import DISCARD

from app import crypto, models
from app.matching import Fill, quote_scale

log = logging.getLogger(__name__)

_ABI_DIR = Path(__file__).parent / "abi"

_PANIC_CODES = {
    0x01: "assert(false)",
    0x11: "arithmetic overflow or underflow",
    0x12: "division by zero",
    0x32: "array index out of bounds",
}


class PreflightRefusal(Exception):
    """The batch would revert. Do not sign, or do not broadcast."""


class SettlementFailed(Exception):
    """The transaction was mined but reverted."""


@dataclass(frozen=True, slots=True)
class ChainConstants:
    base_token: str
    quote_token: str
    base_decimals: int
    quote_decimals: int
    quote_scale_num: int
    quote_scale_den: int
    max_deviation_bps: int
    max_oracle_age: int
    max_fills: int
    registry: str


def _load_abi(name: str) -> list[dict[str, Any]]:
    return json.loads((_ABI_DIR / f"{name}.json").read_text())


class Chain:
    def __init__(self, settings) -> None:
        self.settings = settings
        self.w3 = Web3(Web3.HTTPProvider(settings.rpc_url, request_kwargs={"timeout": 30}))
        self.vault_abi = _load_abi("UmbraVault")
        self.vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(settings.vault_address), abi=self.vault_abi
        )
        self.registry_abi = _load_abi("TeeRegistry")
        self.erc20_abi = _load_abi("ERC20")
        self._errors_by_selector = {
            function_abi_to_4byte_selector(entry): entry
            for entry in self.vault_abi
            if entry.get("type") == "error"
        }
        self.constants: ChainConstants | None = None
        self.registry = None

    # ─────────────────────────── boot ───────────────────────────

    def connect_and_verify(self) -> ChainConstants:
        """Fail fast at boot rather than mid-demo.

        The two assertions that matter most are the domain separator and the quote formula: they
        convert the two likeliest hackathon failures — EIP-712 domain drift and a rounding
        mismatch — from a live revert into a refusal to start.
        """
        if not self.w3.is_connected():
            raise RuntimeError(f"cannot reach RPC {self.settings.rpc_url}")
        chain_id = self.w3.eth.chain_id
        if chain_id != self.settings.chain_id:
            raise RuntimeError(f"chain id mismatch: node says {chain_id}, config says {self.settings.chain_id}")
        if len(self.w3.eth.get_code(self.vault.address)) == 0:
            raise RuntimeError(f"no contract deployed at VAULT_ADDRESS {self.vault.address}")

        registry_addr = self.vault.functions.teeRegistry().call()
        self.registry = self.w3.eth.contract(address=registry_addr, abi=self.registry_abi)

        base_token = self.vault.functions.baseToken().call()
        quote_token = self.vault.functions.quoteToken().call()
        base_dec = self.vault.functions.baseDecimals().call()
        quote_dec = self.vault.functions.quoteDecimals().call()
        num = self.vault.functions.quoteScaleNum().call()
        den = self.vault.functions.quoteScaleDen().call()

        local_num, local_den = quote_scale(base_dec, quote_dec)
        if (local_num, local_den) != (num, den):
            raise RuntimeError(
                f"quote scale mismatch: chain says ({num}, {den}), local says ({local_num}, {local_den})"
            )

        from eth_account.messages import hash_domain

        local_domain = models.domain(self.settings.chain_id, self.settings.vault_address)
        local_separator = "0x" + hash_domain(local_domain).hex()
        chain_separator = self.vault.functions.domainSeparator().call().hex()
        if not chain_separator.startswith("0x"):
            chain_separator = "0x" + chain_separator
        if local_separator.lower() != chain_separator.lower():
            raise RuntimeError(
                f"EIP-712 domain mismatch: chain {chain_separator}, local {local_separator}. "
                "docs/eip712.json verifyingContract probably does not match VAULT_ADDRESS."
            )

        probe_amount = 10**base_dec
        chain_quote = self.vault.functions.quoteFor(probe_amount, 1_010_002).call()
        from app.matching import quote_for_base

        local_quote = quote_for_base(probe_amount, 1_010_002, num, den)
        if chain_quote != local_quote:
            raise RuntimeError(
                f"settlement formula mismatch: chain {chain_quote}, local {local_quote}"
            )

        self.constants = ChainConstants(
            base_token=base_token,
            quote_token=quote_token,
            base_decimals=base_dec,
            quote_decimals=quote_dec,
            quote_scale_num=num,
            quote_scale_den=den,
            max_deviation_bps=self.vault.functions.maxDeviationBps().call(),
            max_oracle_age=self.vault.functions.maxOracleAge().call(),
            max_fills=self.vault.functions.MAX_FILLS().call(),
            registry=registry_addr,
        )
        return self.constants

    # ─────────────────────────── reads ───────────────────────────

    def registered_tee_signer(self) -> str:
        return self.registry.functions.teeSigner().call()

    def peek_price(self, block_identifier="latest") -> tuple[int, int]:
        return tuple(self.vault.functions.peekPrice1e6().call(block_identifier=block_identifier))

    def next_batch_id(self, block_identifier="latest") -> int:
        return self.vault.functions.nextBatchId().call(block_identifier=block_identifier)

    def balances_of(self, trader: str, block_identifier="latest") -> tuple[int, int]:
        return tuple(
            self.vault.functions.balancesOf(Web3.to_checksum_address(trader)).call(
                block_identifier=block_identifier
            )
        )

    def quote_for(self, amount_base: int, price: int, block_identifier="latest") -> int:
        return self.vault.functions.quoteFor(amount_base, price).call(
            block_identifier=block_identifier
        )

    def tee_gas_balance(self) -> int:
        return self.w3.eth.get_balance(crypto.tee_address())

    # ─────────────────────────── preflight ───────────────────────────

    def check_oracle_freshness(self, oracle_ts: int, block_ts: int) -> None:
        """Mirror the contract's staleness rules, with margin.

        The contract checks freshness at INCLUSION time, not read time, so we subtract a safety
        margin to allow for the transaction sitting in the mempool.
        """
        age_limit = self.constants.max_oracle_age
        if oracle_ts == 0:
            raise PreflightRefusal("oracle timestamp is zero")
        if oracle_ts > block_ts + 60:
            raise PreflightRefusal("oracle timestamp is more than 60s in the future")
        if age_limit and block_ts - oracle_ts > age_limit - self.settings.oracle_safety_margin_s:
            raise PreflightRefusal(
                f"oracle reading is {block_ts - oracle_ts}s old; too close to the {age_limit}s limit"
            )

    def preflight_before_signing(
        self, batch_id: int, price: int, fills: list[Fill], block_identifier="latest"
    ) -> None:
        """Every deterministic revert path, checked before a signature exists."""
        on_chain_next = self.next_batch_id(block_identifier)
        if batch_id != on_chain_next:
            raise PreflightRefusal(f"BadBatchId: chain expects {on_chain_next}, batch says {batch_id}")
        if not fills:
            raise PreflightRefusal("EmptyBatch: nothing crossed")
        if len(fills) > self.constants.max_fills:
            raise PreflightRefusal(f"TooManyFills: {len(fills)} > {self.constants.max_fills}")
        if not 0 < price <= 10**18:
            raise PreflightRefusal(f"InvalidClearingPrice: {price}")

        signer = self.registered_tee_signer()
        if int(signer, 16) == 0:
            raise PreflightRefusal(
                "TeeSignerNotSet: run scripts/register_tee.sh to anchor this enclave's key"
            )
        if signer != crypto.tee_address():
            raise PreflightRefusal(
                f"InvalidTeeSignature: chain expects signer {signer}, this enclave is {crypto.tee_address()}"
            )

        ok, oracle_price, deviation_bps = self.vault.functions.previewBand(price).call(
            block_identifier=block_identifier
        )
        if not ok:
            raise PreflightRefusal(
                f"PriceOutOfBand: {deviation_bps} bps from oracle {oracle_price}, "
                f"limit {self.constants.max_deviation_bps}"
            )

        for index, fill in enumerate(fills):
            if fill.amount_base == 0:
                raise PreflightRefusal(f"fill {index}: ZeroFillAmount")
            if fill.buyer == fill.seller:
                raise PreflightRefusal(f"fill {index}: SelfTrade")
            expected = self.quote_for(fill.amount_base, price, block_identifier)
            if expected == 0:
                raise PreflightRefusal(f"fill {index}: ZeroFillAmount (quote floors to zero)")
            if expected != fill.amount_quote:
                raise PreflightRefusal(
                    f"fill {index}: QuoteMismatch, chain says {expected}, batch says {fill.amount_quote}"
                )

    def find_underfunded_traders(self, fills: list[Fill], block_identifier="latest") -> list[str]:
        """Traders whose live escrow cannot cover their legs.

        Deliberately conservative: it requires the STARTING balance to cover the SUM of a
        trader's debits, ignoring credits they receive earlier in the same batch. That is
        strictly stronger than what settleBatch requires, so it can never approve a batch the
        contract would reject.
        """
        need_quote: dict[str, int] = {}
        need_base: dict[str, int] = {}
        for fill in fills:
            need_quote[fill.buyer] = need_quote.get(fill.buyer, 0) + fill.amount_quote
            need_base[fill.seller] = need_base.get(fill.seller, 0) + fill.amount_base

        short: list[str] = []
        for trader in set(need_quote) | set(need_base):
            base_bal, quote_bal = self.balances_of(trader, block_identifier)
            if need_quote.get(trader, 0) > quote_bal or need_base.get(trader, 0) > base_bal:
                short.append(trader)
        return short

    # ─────────────────────────── sign & settle ───────────────────────────

    def sign_batch(self, batch_id: int, price: int, oracle_ts: int, fills: list[Fill]) -> tuple[dict, bytes]:
        message = models.batch_message(batch_id, price, oracle_ts, fills)
        domain = models.domain(self.settings.chain_id, self.settings.vault_address)
        signature = crypto.sign_typed_data(domain, models.BATCH_TYPES, message)
        return message, bytes(signature)

    @staticmethod
    def batch_tuple(batch_id: int, price: int, oracle_ts: int, fills: list[Fill]) -> tuple:
        return (
            batch_id,
            price,
            oracle_ts,
            [(f.buyer, f.seller, f.amount_base, f.amount_quote) for f in fills],
        )

    def simulate_settle(self, batch: tuple, signature: bytes) -> None:
        """The definitive check: eth_call the exact transaction before spending gas."""
        try:
            self.vault.functions.settleBatch(batch, signature).call({"from": crypto.tee_address()})
        except ContractLogicError as exc:
            raise PreflightRefusal(f"settleBatch simulation reverted: {self.decode_revert(exc)}") from exc

    def send_settle_batch(self, batch: tuple, signature: bytes) -> dict[str, Any]:
        sender = crypto.tee_address()
        fn = self.vault.functions.settleBatch(batch, signature)
        latest = self.w3.eth.get_block("latest")
        base_fee = latest.get("baseFeePerGas", 0)
        try:
            tip = self.w3.eth.max_priority_fee
        except Exception:
            tip = Web3.to_wei(1, "gwei")

        gas_estimate = fn.estimate_gas({"from": sender})
        tx = fn.build_transaction(
            {
                "from": sender,
                "chainId": self.settings.chain_id,
                "nonce": self.w3.eth.get_transaction_count(sender, "pending"),
                "gas": gas_estimate * 5 // 4,
                "maxPriorityFeePerGas": tip,
                "maxFeePerGas": base_fee * self.settings.tx_fee_multiplier + tip,
                "type": 2,
            }
        )
        signed = crypto.sign_transaction(tx)
        # eth-account 0.13 renamed rawTransaction -> raw_transaction.
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(
            tx_hash, timeout=self.settings.tx_timeout_s, poll_latency=2
        )

        if receipt["status"] != 1:
            reason = "unknown"
            try:
                self.vault.functions.settleBatch(batch, signature).call(
                    {"from": sender}, block_identifier=receipt["blockNumber"] - 1
                )
            except ContractLogicError as exc:
                reason = self.decode_revert(exc)
            raise SettlementFailed(f"tx {tx_hash.to_0x_hex()} reverted: {reason}")

        settled = self.vault.events.BatchSettled().process_receipt(receipt, errors=DISCARD)
        fills_logged = self.vault.events.FillSettled().process_receipt(receipt, errors=DISCARD)
        return {
            "tx_hash": tx_hash.to_0x_hex(),
            "block_number": receipt["blockNumber"],
            "gas_used": receipt["gasUsed"],
            "batch_event": dict(settled[0]["args"]) if settled else None,
            "fill_events": [dict(e["args"]) for e in fills_logged],
        }

    # ─────────────────────────── error decoding ───────────────────────────

    def decode_revert(self, exc: Exception) -> str:
        """Turn opaque revert data into e.g. BadBatchId(expected=1, provided=99).

        Coston2 places the revert payload in both `data` and `message`, so try both.
        """
        raw_hex = None
        for candidate in (getattr(exc, "data", None), getattr(exc, "message", None), str(exc)):
            if isinstance(candidate, dict):
                candidate = candidate.get("data")
            if isinstance(candidate, str) and candidate.startswith("0x") and len(candidate) >= 10:
                raw_hex = candidate
                break
        if raw_hex is None:
            return str(exc)

        raw = bytes.fromhex(raw_hex[2:])
        selector, payload = raw[:4], raw[4:]

        if selector == bytes.fromhex("08c379a0"):
            return f'Error("{self.w3.codec.decode(["string"], payload)[0]}")'
        if selector == bytes.fromhex("4e487b71"):
            code = self.w3.codec.decode(["uint256"], payload)[0]
            return f"Panic(0x{code:02x}: {_PANIC_CODES.get(code, 'unknown')})"

        entry = self._errors_by_selector.get(selector)
        if entry is None:
            return f"unknown custom error {selector.hex()} data={raw_hex}"
        types = [i["type"] for i in entry["inputs"]]
        names = [i["name"] for i in entry["inputs"]]
        try:
            args = self.w3.codec.decode(types, payload)
        except Exception:
            return f"{entry['name']}(<undecodable> {payload.hex()})"
        return f"{entry['name']}(" + ", ".join(f"{n}={v}" for n, v in zip(names, args)) + ")"


def now() -> int:
    return int(time.time())
