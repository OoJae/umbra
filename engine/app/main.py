"""Umbra TEE matching engine.

Hard rule from CLAUDE.md, restated here because it constrains every handler below: no endpoint
may ever return or log decrypted order plaintext. Settled fills are the one exception, and only
after the receipt confirms — at that point FillSettled has made every byte public on-chain, so
echoing it is a convenience rather than a disclosure. Unmatched orders' contents never leave the
enclave under any circumstances.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from app import attestation as attestation_mod
from app import crypto, logging_setup, models, security
from app.chain import Chain, PreflightRefusal, SettlementFailed
from app.config import Settings
from app.logging_setup import log_event
from app.matching import BUY, SELL, MatchOrder, match_batch
from app.models import OrderIn, OrderSignatureError, SealedOrderIn
from app.reservations import EscrowLedger, InsufficientEscrow, Reservation, reservation_for

log = logging.getLogger("umbra.engine")

VERSION = "0.2.0"

# Upper bound on retained per-order outcomes. Well above max_book_size so a trader can still look
# up an order several batches after it resolved.
MAX_OUTCOMES = 10_000


# ─────────────────────────── in-memory state ───────────────────────────


@dataclass
class OrderRecord:
    order_id: str
    order: OrderIn
    ciphertext_b64: str
    received_at: int
    seq: int


@dataclass
class BatchRecord:
    batch_id: int | None
    status: str
    order_count: int = 0
    fill_count: int = 0
    unmatched_count: int = 0
    clearing_price_1e6: int | None = None
    oracle_price_1e6: int | None = None
    oracle_ts: int | None = None
    tx_hash: str | None = None
    block_number: int | None = None
    gas_used: int | None = None
    batch_digest: str | None = None
    tee_signer: str | None = None
    error_code: str | None = None
    error_detail: str | None = None
    created_at: int = field(default_factory=lambda: int(time.time()))
    settled_at: int | None = None
    fills: list[dict[str, Any]] = field(default_factory=list)
    settled: bool = False
    # Never serialized. These exist only so run_batch can resolve each drained order's outcome
    # after _execute_batch returns, since only the matcher knows which ids were eligible.
    matched_order_ids: set[str] = field(default_factory=set)
    excluded_traders: set[str] = field(default_factory=set)


@dataclass
class OrderOutcome:
    """Terminal fate of one order, kept after the book has been drained.

    Deliberately carries no amount, price, side or trader. Order IDs are public — the Dark Book
    lists them — so this record is served to anyone who asks and must disclose nothing that the
    Dark Book and the settled batch do not already make public.
    """

    status: str
    batch_id: int | None = None
    resolved_at: int = field(default_factory=lambda: int(time.time()))


class EngineState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.book: dict[str, OrderRecord] = {}
        self.ledger = EscrowLedger()
        self.used_nonces: set[tuple[str, int]] = set()
        self.batches: dict[int, BatchRecord] = {}
        self.last_batch: BatchRecord | None = None
        # order_id -> OrderOutcome, for orders that have left the book. Insertion-ordered and
        # trimmed from the front so a long-running enclave cannot grow this without bound.
        self.outcomes: dict[str, OrderOutcome] = {}
        self.seq = 0
        self.batch_running = False
        self.ready = False
        self.attestation: attestation_mod.AttestationBundle | None = None

    def record_outcome(self, order_id: str, status: str, batch_id: int | None = None) -> None:
        """Caller must hold self.lock."""
        self.outcomes[order_id] = OrderOutcome(status=status, batch_id=batch_id)
        while len(self.outcomes) > MAX_OUTCOMES:
            self.outcomes.pop(next(iter(self.outcomes)))


state = EngineState()
settings: Settings | None = None
chain: Chain | None = None


# ─────────────────────────── response models ───────────────────────────


class HealthResponse(BaseModel):
    status: str
    mode: str
    version: str
    ready: bool
    tee_registered: bool
    attestation_status: str | None = None


class InfoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tee_eth_address: str
    order_encryption_pubkey_b64: str
    mode: str
    image_digest: str
    vault: str
    chain_id: int
    registry: str | None = None
    base_token: str | None = None
    quote_token: str | None = None
    base_decimals: int | None = None
    quote_decimals: int | None = None
    eip712_domain: dict | None = None


class CiphertextPreview(BaseModel):
    order_id: str
    preview_b64: str
    length: int
    sha256: str


class PublicOrderbookResponse(BaseModel):
    """Counts and opaque blobs only. Never a decrypted field, never a per-blob side annotation."""

    model_config = ConfigDict(extra="forbid")
    count_buys: int
    count_sells: int
    ciphertext_previews: list[CiphertextPreview]


class FillOut(BaseModel):
    buyer: str
    seller: str
    amount_base: int
    amount_quote: int


class BatchResponse(BaseModel):
    batch_id: int | None
    status: str
    order_count: int
    fill_count: int
    unmatched_count: int
    clearing_price_1e6: int | None = None
    oracle_price_1e6: int | None = None
    oracle_ts: int | None = None
    tx_hash: str | None = None
    explorer_url: str | None = None
    block_number: int | None = None
    gas_used: int | None = None
    batch_digest: str | None = None
    tee_signer: str | None = None
    error_code: str | None = None
    error_detail: str | None = None
    created_at: int | None = None
    settled_at: int | None = None
    fills: list[FillOut] | None = None


class OrderStatusResponse(BaseModel):
    """Status only. No amount, price, side or trader — see OrderOutcome."""

    model_config = ConfigDict(extra="forbid")
    order_id: str
    status: Literal["pending", "matched", "unmatched", "dropped_underfunded"]
    batch_id: int | None = None
    # Present only for a settled batch, so the caller can fetch /batches/{id} for the public fills
    # and compute their own execution quality client-side.
    settlement_tx: str | None = None
    resolved_at: int | None = None


class BatchRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dry_run: bool = False


def _batch_response(record: BatchRecord) -> BatchResponse:
    """Fills are serialized only once the batch has settled and the receipt confirmed."""
    fills = (
        [FillOut(**f) for f in record.fills]
        if record.settled and record.status == "settled"
        else None
    )
    return BatchResponse(
        batch_id=record.batch_id,
        status=record.status,
        order_count=record.order_count,
        fill_count=record.fill_count,
        unmatched_count=record.unmatched_count,
        clearing_price_1e6=record.clearing_price_1e6,
        oracle_price_1e6=record.oracle_price_1e6,
        oracle_ts=record.oracle_ts,
        tx_hash=record.tx_hash,
        explorer_url=(
            f"https://coston2-explorer.flare.network/tx/{record.tx_hash}" if record.tx_hash else None
        ),
        block_number=record.block_number,
        gas_used=record.gas_used,
        batch_digest=record.batch_digest,
        tee_signer=record.tee_signer,
        error_code=record.error_code,
        error_detail=record.error_detail,
        created_at=record.created_at,
        settled_at=record.settled_at,
        fills=fills,
    )


# ─────────────────────────── lifespan ───────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global settings, chain
    settings = Settings.from_env()
    logging_setup.configure(settings.log_level)
    security.bind_settings(settings)

    chain = Chain(settings)
    constants = chain.connect_and_verify()

    nonce = crypto.attestation_nonce(settings.vault_address)
    state.attestation = attestation_mod.build_attestation(
        tee_address=crypto.tee_address(),
        vault_address=settings.vault_address,
        nonce_hex=nonce,
        mode=settings.tee_mode,
        audience=settings.attestation_audience,
        image_digest=crypto.image_digest(settings.tee_mode, settings.image_digest),
    )
    if settings.attestation_required and state.attestation.status != "ok":
        raise RuntimeError(f"attestation required but unavailable: {state.attestation.error_code}")

    state.ready = True
    log_event(
        log,
        "engine.started",
        mode=settings.tee_mode,
        tee_eth_address=crypto.tee_address(),
        image_digest=state.attestation.image_digest,
        status=state.attestation.status,
    )

    registered = chain.registered_tee_signer()
    if int(registered, 16) == 0:
        log_event(log, "engine.tee_signer_unregistered", level=logging.WARNING,
                  reason="run scripts/register_tee.sh before any batch can settle")
    elif registered != crypto.tee_address():
        log_event(log, "engine.tee_signer_mismatch", level=logging.WARNING, trader=registered)
    if chain.tee_gas_balance() < settings.min_gas_balance_wei:
        log_event(log, "engine.tee_underfunded", level=logging.WARNING,
                  tee_eth_address=crypto.tee_address())
    _ = constants
    yield


app = FastAPI(title="Umbra TEE Engine", version=VERSION, lifespan=lifespan)


# ─────────────────────────── endpoints ───────────────────────────


@app.get("/healthz", response_model=HealthResponse)
def healthz() -> HealthResponse:
    registered = False
    if chain is not None and state.ready:
        try:
            registered = int(chain.registered_tee_signer(), 16) == int(crypto.tee_address(), 16)
        except Exception:
            registered = False
    return HealthResponse(
        status="ok",
        mode=settings.tee_mode if settings else "simulated",
        version=VERSION,
        ready=state.ready,
        tee_registered=registered,
        attestation_status=state.attestation.status if state.attestation else None,
    )


@app.get("/info", response_model=InfoResponse)
def info() -> InfoResponse:
    payload = crypto.info_payload(settings)
    constants = chain.constants if chain else None
    return InfoResponse(
        **payload,
        registry=constants.registry if constants else None,
        base_token=constants.base_token if constants else None,
        quote_token=constants.quote_token if constants else None,
        base_decimals=constants.base_decimals if constants else None,
        quote_decimals=constants.quote_decimals if constants else None,
        eip712_domain=models.domain(settings.chain_id, settings.vault_address),
    )


@app.get("/attestation")
def get_attestation() -> dict[str, Any]:
    if state.attestation is None:
        raise HTTPException(status_code=503, detail={"code": "attestation_unavailable"})
    bundle = state.attestation
    body: dict[str, Any] = {
        "mode": bundle.mode,
        "status": bundle.status,
        "raw": bundle.raw,
        "decoded": bundle.decoded,
        "keccak256": bundle.keccak256,
        "audience": bundle.audience,
        "nonce": {
            "hex": bundle.nonce_hex,
            "derivation": "keccak256(bytes20(tee_eth_address) || bytes20(vault_address))",
            "tee_eth_address": crypto.tee_address(),
            "vault_address": settings.vault_address,
        },
        "image_digest": bundle.image_digest,
        "fetched_at": bundle.fetched_at,
        "error_code": bundle.error_code,
    }
    try:
        anchored_hash = chain.registry.functions.attestationHash().call()
        anchored_signer = chain.registry.functions.teeSigner().call()
        anchored_hex = anchored_hash.hex()
        if not anchored_hex.startswith("0x"):
            anchored_hex = "0x" + anchored_hex
        body["onchain"] = {
            "registry": chain.constants.registry,
            "anchored_hash": anchored_hex,
            "hash_matches": anchored_hex.lower() == bundle.keccak256.lower(),
            "anchored_signer": anchored_signer,
            "signer_matches": anchored_signer == crypto.tee_address(),
        }
    except Exception as exc:  # pragma: no cover - network dependent
        body["onchain"] = {"error": str(exc)}
    return body


@app.post("/orders", response_model=models.OrderAccepted)
def submit_order(body: SealedOrderIn) -> models.OrderAccepted:
    if not state.ready:
        raise HTTPException(status_code=503, detail={"code": "engine_not_ready"})

    ciphertext_sha = hashlib.sha256(body.ciphertext_b64.encode()).hexdigest()

    try:
        plaintext = crypto.unseal(body.ciphertext_b64)
    except crypto.SealError:
        log_event(log, "order.rejected", code="bad_ciphertext",
                  ciphertext_len=len(body.ciphertext_b64), ciphertext_sha256=ciphertext_sha)
        raise HTTPException(status_code=400, detail={"code": "bad_ciphertext"})

    try:
        order = OrderIn.model_validate_json(plaintext)
    except Exception:
        log_event(log, "order.rejected", code="bad_envelope",
                  ciphertext_len=len(body.ciphertext_b64), ciphertext_sha256=ciphertext_sha)
        raise HTTPException(status_code=400, detail={"code": "bad_envelope"})
    finally:
        del plaintext

    try:
        models.verify_order_signature(order, settings.chain_id, settings.vault_address)
    except OrderSignatureError:
        # No trader field here: on a signature failure the claimed trader is unauthenticated.
        log_event(log, "order.rejected", code="bad_signature",
                  ciphertext_len=len(body.ciphertext_b64), ciphertext_sha256=ciphertext_sha)
        raise HTTPException(status_code=400, detail={"code": "bad_signature"})

    now = int(time.time())
    if order.deadline <= now + 30:
        raise HTTPException(status_code=400, detail={"code": "deadline_expired"})

    constants = chain.constants
    with state.lock:
        if (order.trader, order.nonce) in state.used_nonces:
            raise HTTPException(status_code=409, detail={"code": "nonce_used"})
        if len(state.book) >= settings.max_book_size:
            raise HTTPException(status_code=409, detail={"code": "book_full"})

        token, amount = reservation_for(order, constants.quote_scale_num, constants.quote_scale_den)
        base_bal, quote_bal = chain.balances_of(order.trader)
        on_chain = quote_bal if token == "quote" else base_bal

        order_id = uuid.uuid4().hex
        try:
            state.ledger.try_reserve(Reservation(order_id, order.trader, token, amount), on_chain)
        except InsufficientEscrow:
            # The rejection code carries no amounts: the caller already knows what they sent, and
            # anyone else must learn nothing.
            raise HTTPException(status_code=409, detail={"code": "insufficient_escrow"})

        state.seq += 1
        state.used_nonces.add((order.trader, order.nonce))
        state.book[order_id] = OrderRecord(
            order_id=order_id,
            order=order,
            ciphertext_b64=body.ciphertext_b64,
            received_at=now,
            seq=state.seq,
        )

    log_event(log, "order.accepted", order_id=order_id, trader=order.trader,
              ciphertext_len=len(body.ciphertext_b64), ciphertext_sha256=ciphertext_sha)
    return models.OrderAccepted(accepted=True, order_id=order_id)


@app.get("/orders/{order_id}", response_model=OrderStatusResponse)
def get_order_status(order_id: str) -> OrderStatusResponse:
    """Look up what happened to one order.

    Order IDs are already public (the Dark Book lists every resting one), so this is deliberately
    unauthenticated and deliberately thin: it discloses whether the order is still resting, and if
    it has resolved, which batch resolved it. It never discloses the order's contents, and it never
    maps an order to a trader — that link would be a real leak even though the ID itself is public.

    To see what an order actually got, fetch /batches/{batch_id}: those fills are already public
    on-chain in FillSettled, so execution quality can be computed by the caller without the enclave
    revealing anything further.
    """
    with state.lock:
        if order_id in state.book:
            return OrderStatusResponse(order_id=order_id, status="pending")
        outcome = state.outcomes.get(order_id)
        if outcome is None:
            raise HTTPException(status_code=404, detail={"code": "order_not_found"})
        tx_hash = None
        if outcome.batch_id is not None:
            batch = state.batches.get(outcome.batch_id)
            if batch is not None and batch.settled:
                tx_hash = batch.tx_hash
    return OrderStatusResponse(
        order_id=order_id,
        status=outcome.status,
        batch_id=outcome.batch_id,
        settlement_tx=tx_hash,
        resolved_at=outcome.resolved_at,
    )


@app.get("/orderbook/public", response_model=PublicOrderbookResponse)
def public_orderbook() -> PublicOrderbookResponse:
    """The Dark Book. Counts and ciphertext blobs only.

    Previews are returned in submission order with no side annotation, so the counts cannot be
    aligned to individual blobs. The aggregate counts are themselves plaintext-derived and with a
    single order in the book they disclose that order's side — the build guide mandates this
    shape, and the limitation is stated in the README rather than hidden.
    """
    with state.lock:
        records = sorted(state.book.values(), key=lambda r: r.seq)
        buys = sum(1 for r in records if r.order.side == BUY)
        sells = sum(1 for r in records if r.order.side == SELL)
        previews = [
            CiphertextPreview(
                order_id=r.order_id,
                preview_b64=r.ciphertext_b64[:88],
                length=len(r.ciphertext_b64),
                sha256="0x" + hashlib.sha256(r.ciphertext_b64.encode()).hexdigest(),
            )
            for r in records
        ]
    return PublicOrderbookResponse(count_buys=buys, count_sells=sells, ciphertext_previews=previews)


@app.get("/batches/{batch_id}", response_model=BatchResponse)
def get_batch(batch_id: int) -> BatchResponse:
    with state.lock:
        record = state.batches.get(batch_id)
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "batch_not_found"})
    return _batch_response(record)


@app.post("/batch/run", response_model=BatchResponse, dependencies=[Depends(security.require_operator)])
def run_batch(body: BatchRunRequest | None = None) -> BatchResponse:
    if not state.ready:
        raise HTTPException(status_code=503, detail={"code": "engine_not_ready"})
    request = body or BatchRunRequest()

    # Single-flight. The lock is held only to drain the book, never across the chain round-trip,
    # so POST /orders is never blocked for the duration of a settlement.
    with state.lock:
        if state.batch_running:
            raise HTTPException(status_code=409, detail={"code": "batch_in_progress"})
        if not state.book:
            return _batch_response(BatchRecord(batch_id=None, status="no_orders"))
        state.batch_running = True
        drained = sorted(state.book.values(), key=lambda r: r.seq)
        ledger_snapshot = state.ledger.snapshot()
        state.book.clear()

    record = BatchRecord(batch_id=None, status="pending", order_count=len(drained))
    try:
        record = _execute_batch(drained, request, record)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator, then re-raised as 500
        record.status = "failed"
        record.error_code = record.error_code or "internal_error"
        record.error_detail = record.error_detail or str(exc)
        with state.lock:
            state.ledger.restore(ledger_snapshot)
            for rec in drained:
                state.book[rec.order_id] = rec
        log_event(log, "batch.failed", level=logging.ERROR, code=record.error_code,
                  reason=record.error_detail[:200])
    finally:
        with state.lock:
            state.batch_running = False
            if record.status == "settled":
                for rec in drained:
                    state.ledger.release(rec.order_id)
                    # A settled batch is terminal for every order it drained: matched orders
                    # filled, and the rest are discarded rather than returned to the book. That is
                    # the behaviour a trader most needs to be able to see.
                    if rec.order_id in record.matched_order_ids:
                        outcome = "matched"
                    elif rec.order.trader in record.excluded_traders:
                        outcome = "dropped_underfunded"
                    else:
                        outcome = "unmatched"
                    state.record_outcome(rec.order_id, outcome, record.batch_id)
            elif record.status in ("no_match", "matched_dry_run"):
                # Nothing moved on-chain; put the book back so orders survive to the next attempt.
                state.ledger.restore(ledger_snapshot)
                for rec in drained:
                    state.book[rec.order_id] = rec
            if record.batch_id is not None:
                state.batches[record.batch_id] = record
            state.last_batch = record

    return _batch_response(record)


def _execute_batch(drained: list[OrderRecord], request: BatchRunRequest, record: BatchRecord) -> BatchRecord:
    constants = chain.constants
    block_number = chain.w3.eth.block_number
    block_ts = chain.w3.eth.get_block(block_number)["timestamp"]
    price, oracle_ts = chain.peek_price(block_number)
    record.clearing_price_1e6 = price
    record.oracle_price_1e6 = price
    record.oracle_ts = oracle_ts

    chain.check_oracle_freshness(oracle_ts, block_ts)

    excluded: set[str] = set()
    result = None
    for attempt in range(settings.batch_retry_limit + 1):
        candidates = [
            MatchOrder(
                order_id=r.order_id,
                trader=r.order.trader,
                side=r.order.side,
                amount_base=r.order.amount_base,
                limit_price_1e6=r.order.limit_price_1e6,
                seq=r.seq,
            )
            for r in drained
            if r.order.trader not in excluded
        ]
        result = match_batch(
            candidates, price, constants.quote_scale_num, constants.quote_scale_den, constants.max_fills
        )
        if not result.fills:
            record.status = "no_match"
            record.unmatched_count = len(drained)
            return record

        short = chain.find_underfunded_traders(list(result.fills), block_number)
        if not short:
            break
        # Dropping a trader changes the pro-rata denominators, so the batch must be rebuilt from
        # scratch rather than having the offending fills deleted in place.
        log_event(log, "batch.dropping_underfunded", level=logging.WARNING,
                  attempt=attempt, dropped_traders=len(short))
        excluded.update(short)
    else:
        record.status = "failed"
        record.error_code = "insufficient_escrow"
        record.error_detail = "could not assemble a solvent batch"
        return record

    matched_ids = set(result.eligible_buy_ids) | set(result.eligible_sell_ids)
    record.fill_count = len(result.fills)
    record.unmatched_count = len(drained) - len(matched_ids)
    record.matched_order_ids = matched_ids
    record.excluded_traders = set(excluded)

    batch_id = chain.next_batch_id(block_number)
    record.batch_id = batch_id
    fills = list(result.fills)

    chain.preflight_before_signing(batch_id, price, fills, block_number)

    if request.dry_run:
        record.status = "matched_dry_run"
        return record

    _, signature = chain.sign_batch(batch_id, price, oracle_ts, fills)
    batch_tuple = chain.batch_tuple(batch_id, price, oracle_ts, fills)
    chain.simulate_settle(batch_tuple, signature)

    try:
        outcome = chain.send_settle_batch(batch_tuple, signature)
    except SettlementFailed as exc:
        record.status = "failed"
        record.error_code = "tx_reverted"
        record.error_detail = str(exc)
        return record

    record.status = "settled"
    record.settled = True
    record.tx_hash = outcome["tx_hash"]
    record.block_number = outcome["block_number"]
    record.gas_used = outcome["gas_used"]
    record.settled_at = int(time.time())
    record.tee_signer = crypto.tee_address()
    event = outcome.get("batch_event") or {}
    if event:
        record.oracle_price_1e6 = event.get("oraclePrice1e6", record.oracle_price_1e6)
        digest = event.get("batchDigest")
        record.batch_digest = digest.hex() if hasattr(digest, "hex") else digest
        if record.batch_digest and not record.batch_digest.startswith("0x"):
            record.batch_digest = "0x" + record.batch_digest
    record.fills = [
        {
            "buyer": f.buyer,
            "seller": f.seller,
            "amount_base": f.amount_base,
            "amount_quote": f.amount_quote,
        }
        for f in fills
    ]

    log_event(log, "batch.settled", batch_id=batch_id, fill_count=len(fills),
              clearing_price_1e6=price, oracle_price_1e6=record.oracle_price_1e6,
              tx_hash=record.tx_hash, block_number=record.block_number, gas_used=record.gas_used)
    return record
