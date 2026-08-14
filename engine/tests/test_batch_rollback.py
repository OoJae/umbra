"""A failed batch must put the book and the escrow ledger back exactly as they were.

Regression test for a real bug: `_execute_batch` signals its two hard failures by *returning* a
record with status="failed" rather than raising — `insufficient_escrow` once the retry limit is
exhausted, and `tx_reverted` when a batch that simulated cleanly still reverts on-chain. The
rollback in `run_batch` used to enumerate ("no_match", "matched_dry_run"), which matched neither of
them, so both paths fell through every branch: the drained book was never restored and the escrow
reservations were never released.

Nothing caught it because every existing test drove either the settled path or an exception. These
tests drive the two *returned* failures specifically.
"""

from __future__ import annotations

import pytest

from app import main as main_mod
from app.main import BatchRecord, BatchRunRequest, EngineState, OrderRecord
from app.matching import BUY
from app.models import OrderIn
from app.reservations import QUOTE, Reservation

TRADER = "0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09"
RESERVED = 4_000_000


def _order() -> OrderIn:
    return OrderIn(
        trader=TRADER,
        side=BUY,
        amount_base=3_000_000,
        limit_price_1e6=1_100_000,
        nonce=1,
        deadline=1_900_000_000,
        signature="0x" + "ab" * 65,
    )


@pytest.fixture
def loaded_state(monkeypatch):
    """One resting order with its escrow reserved, exactly as POST /orders would leave things."""
    state = EngineState()
    state.ready = True
    record = OrderRecord(order_id="order-1", order=_order(), ciphertext_b64="AAAA", received_at=0, seq=1)
    state.book["order-1"] = record
    state.ledger.try_reserve(Reservation("order-1", TRADER, QUOTE, RESERVED), on_chain_balance=10_000_000)
    monkeypatch.setattr(main_mod, "state", state)
    return state


@pytest.mark.parametrize("error_code", ["tx_reverted", "insufficient_escrow"])
def test_returned_failure_restores_book_and_ledger(loaded_state, monkeypatch, error_code):
    """The bug: these two paths return rather than raise, so the rollback was skipped."""
    def failed(drained, request, record):
        record.status = "failed"
        record.error_code = error_code
        record.error_detail = "simulated"
        return record

    monkeypatch.setattr(main_mod, "_execute_batch", failed)
    resp = main_mod.run_batch(BatchRunRequest())

    assert resp.status == "failed"
    assert resp.error_code == error_code
    # The order must still be resting, and still be the same order.
    assert "order-1" in loaded_state.book, "drained order was destroyed by a failed batch"
    assert loaded_state.book["order-1"].order.nonce == 1
    # Its escrow must still be reserved — not leaked, and not double-counted.
    assert loaded_state.ledger.committed(TRADER, QUOTE) == RESERVED
    # And the engine must be able to run another batch.
    assert loaded_state.batch_running is False


def test_raised_failure_also_restores(loaded_state, monkeypatch):
    """The exception path was already correct; it must stay correct now that the restore moved
    into the finally block, and must not roll back twice."""
    def boom(drained, request, record):
        raise RuntimeError("engine exploded")

    monkeypatch.setattr(main_mod, "_execute_batch", boom)
    resp = main_mod.run_batch(BatchRunRequest())

    assert resp.status == "failed"
    assert "order-1" in loaded_state.book
    assert loaded_state.ledger.committed(TRADER, QUOTE) == RESERVED
    assert loaded_state.batch_running is False


def test_no_match_still_restores(loaded_state, monkeypatch):
    def no_match(drained, request, record):
        record.status = "no_match"
        return record

    monkeypatch.setattr(main_mod, "_execute_batch", no_match)
    main_mod.run_batch(BatchRunRequest())
    assert "order-1" in loaded_state.book
    assert loaded_state.ledger.committed(TRADER, QUOTE) == RESERVED


def test_settled_releases_escrow_and_clears_the_book(loaded_state, monkeypatch):
    """The settled path must behave the opposite way: escrow released, order gone from the book,
    and a terminal outcome recorded so the trader can look it up."""
    def settled(drained, request, record):
        record.status = "settled"
        record.settled = True
        record.batch_id = 42
        record.matched_order_ids = {"order-1"}
        return record

    monkeypatch.setattr(main_mod, "_execute_batch", settled)
    main_mod.run_batch(BatchRunRequest())

    assert "order-1" not in loaded_state.book
    assert loaded_state.ledger.committed(TRADER, QUOTE) == 0
    assert loaded_state.outcomes["order-1"].status == "matched"
    assert loaded_state.outcomes["order-1"].batch_id == 42
