"""Wire models, the frozen EIP-712 spec loader, and order-signature verification.

Two naming conventions meet in exactly one place — `OrderIn.to_eip712()`. The wire is snake_case
(the build guide's shape); the EIP-712 struct is camelCase (docs/eip712.json). Keeping the
conversion in a single method is what stops them drifting.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import to_checksum_address
from hexbytes import HexBytes
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

_SPEC_PATH = Path(__file__).with_name("eip712.json")


class OrderSignatureError(Exception):
    """The order's EIP-712 signature is absent, malformed, or from the wrong key."""


@lru_cache(maxsize=1)
def spec() -> dict[str, Any]:
    """The frozen typed-data spec, vendored byte-for-byte from docs/eip712.json.

    It is vendored rather than read from docs/ because the Docker build context is engine/ and
    COPY cannot reach outside it. A pytest drift guard asserts the two files stay identical.
    """
    return json.loads(_SPEC_PATH.read_text())


def all_types() -> dict[str, list[dict[str, str]]]:
    return spec()["types"]


def _core_type(solidity_type: str) -> str:
    """'Fill[]' -> 'Fill'; 'uint256[2][]' -> 'uint256'."""
    return solidity_type[: solidity_type.index("[")] if "[" in solidity_type else solidity_type


def types_for(primary: str) -> dict[str, list[dict[str, str]]]:
    """The transitive closure of `primary` only.

    eth_account infers the primary type as the unique type nothing else references. Our spec
    holds Order, Fill and Batch; Fill is referenced by Batch, but Order and Batch are BOTH
    unreferenced, so the inference is ambiguous and raises. Every call site must filter.
    """
    types = all_types()
    out: dict[str, list[dict[str, str]]] = {}
    stack = [primary]
    while stack:
        name = stack.pop()
        if name in out:
            continue
        out[name] = types[name]
        stack.extend(
            _core_type(field["type"]) for field in types[name] if _core_type(field["type"]) in types
        )
    return out


BATCH_TYPES = types_for("Batch")  # {'Batch', 'Fill'}
ORDER_TYPES = types_for("Order")  # {'Order'}
FILL_TYPES = types_for("Fill")  # {'Fill'}


def domain(chain_id: int, vault: str) -> dict[str, Any]:
    """Domain from the frozen spec, with chainId/verifyingContract taken from settings so a
    redeploy is one env change rather than a spec edit."""
    d = dict(spec()["domain"])
    d["chainId"] = chain_id
    d["verifyingContract"] = to_checksum_address(vault)
    return d


def _to_uint(value: Any) -> int:
    """Accept int or decimal/hex string. The browser SHOULD send strings: uint256 amounts exceed
    JS Number.MAX_SAFE_INTEGER and JSON.stringify throws on bigint, so viem code naturally
    produces strings."""
    if isinstance(value, bool):
        raise ValueError("bool is not a valid uint256")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        text = value.strip()
        return int(text, 16) if text.startswith("0x") else int(text, 10)
    raise ValueError(f"cannot coerce {type(value).__name__} to uint256")


Uint256 = Annotated[int, BeforeValidator(_to_uint), Field(ge=0, lt=2**256)]
Address = Annotated[str, BeforeValidator(lambda v: to_checksum_address(v))]
HexSig = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{130}$")]


class OrderIn(BaseModel):
    """The decrypted order plaintext.

    Every value-bearing field is repr=False so that an accidental logger call or f-string can
    only ever print the trader address. That is a structural guarantee, not a convention.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    trader: Address
    side: Literal[0, 1] = Field(repr=False)
    amount_base: Uint256 = Field(gt=0, repr=False)
    limit_price_1e6: Uint256 = Field(gt=0, le=10**18, repr=False)
    nonce: Uint256 = Field(repr=False)
    deadline: Uint256 = Field(gt=0, repr=False)
    signature: HexSig = Field(repr=False)

    def to_eip712(self) -> dict[str, Any]:
        """snake_case wire -> the camelCase struct in docs/eip712.json. The only place the two
        conventions meet."""
        return {
            "trader": self.trader,
            "side": self.side,
            "amountBase": self.amount_base,
            "limitPrice1e6": self.limit_price_1e6,
            "nonce": self.nonce,
            "deadline": self.deadline,
        }


class SealedOrderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ciphertext_b64: str = Field(min_length=64, max_length=8192)


class OrderAccepted(BaseModel):
    """The only success shape POST /orders may return. Bound via response_model so FastAPI
    structurally strips anything a future edit accidentally adds."""

    model_config = ConfigDict(extra="forbid")
    accepted: Literal[True] = True
    order_id: str


def fill_to_eip712(buyer: str, seller: str, amount_base: int, amount_quote: int) -> dict[str, Any]:
    return {
        "buyer": buyer,
        "seller": seller,
        "amountBase": amount_base,
        "amountQuote": amount_quote,
    }


def batch_message(batch_id: int, clearing_price_1e6: int, oracle_ts: int, fills) -> dict[str, Any]:
    """The Batch struct, camelCase, matching docs/eip712.json exactly.

    Solidity's _hashBatch widens oracleTs to uint256 in abi.encode; eth_account encodes a uint64
    field into the same 32-byte word, so pass a plain int and do not pre-widen.
    """
    return {
        "batchId": batch_id,
        "clearingPrice1e6": clearing_price_1e6,
        "oracleTs": oracle_ts,
        "fills": [fill_to_eip712(f.buyer, f.seller, f.amount_base, f.amount_quote) for f in fills],
    }


def recover_order_signer(order: OrderIn, chain_id: int, vault: str) -> str:
    signature = HexBytes(order.signature)
    if len(signature) != 65:
        raise OrderSignatureError("signature must be 65 bytes")
    if signature[64] not in (0, 1, 27, 28):
        raise OrderSignatureError("invalid recovery id")
    signable = encode_typed_data(domain(chain_id, vault), ORDER_TYPES, order.to_eip712())
    try:
        return Account.recover_message(signable, signature=signature)
    except Exception as exc:
        raise OrderSignatureError("signature does not recover") from exc


def verify_order_signature(order: OrderIn, chain_id: int, vault: str) -> None:
    """The TEE, not the API, is the authentication boundary. Without this anyone could submit
    orders that drain another trader's escrow."""
    recovered = recover_order_signer(order, chain_id, vault)
    if recovered != order.trader:
        raise OrderSignatureError("signature does not match order.trader")
