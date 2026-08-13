"""Escrow reservation — the multi-order double-spend the build guide never mentions."""

from __future__ import annotations

import pytest

from app.matching import BUY, SELL, quote_for_base, quote_scale
from app.models import OrderIn
from app.reservations import (
    BASE,
    QUOTE,
    EscrowLedger,
    InsufficientEscrow,
    Reservation,
    reservation_for,
)

ALICE = "0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09"
BOB = "0x016fb6f97db4e99611F789Ae172d9DCA9593BE0b"
NUM, DEN = quote_scale(6, 6)
MID = 1_010_002
SIG = "0x" + "cd" * 65


def order(side: int, amount: int, limit: int, trader: str = ALICE) -> OrderIn:
    return OrderIn(
        trader=trader,
        side=side,
        amount_base=amount,
        limit_price_1e6=limit,
        nonce=1,
        deadline=1_900_000_000,
        signature=SIG,
    )


def test_buyer_reserves_at_limit_not_at_mid():
    """The mid is unknown at accept time but bounded: an eligible BUY has mid <= limit, and
    amountQuote is monotonic in price, so the limit price is the only sound reservation basis.
    Reserving at the current mid would under-reserve the moment XRP ticks up."""
    limit = MID + 5_000
    token, amount = reservation_for(order(BUY, 3_000_000, limit), NUM, DEN)
    assert token == QUOTE
    assert amount == quote_for_base(3_000_000, limit, NUM, DEN)
    assert amount > quote_for_base(3_000_000, MID, NUM, DEN)


def test_seller_reserves_base_exactly():
    token, amount = reservation_for(order(SELL, 3_000_000, MID - 5_000), NUM, DEN)
    assert token == BASE
    assert amount == 3_000_000


def test_second_order_rejected_when_escrow_exhausted():
    """Each order is individually affordable; together they are not. Without this the batch
    reverts on-chain and takes every other fill down with it."""
    ledger = EscrowLedger()
    balance = 5_000_000
    ledger.try_reserve(Reservation("o1", ALICE, QUOTE, 3_000_000), balance)
    with pytest.raises(InsufficientEscrow) as excinfo:
        ledger.try_reserve(Reservation("o2", ALICE, QUOTE, 3_000_000), balance)
    assert excinfo.value.available == 2_000_000


def test_release_frees_the_reservation():
    ledger = EscrowLedger()
    ledger.try_reserve(Reservation("o1", ALICE, QUOTE, 3_000_000), 5_000_000)
    ledger.release("o1")
    assert ledger.committed(ALICE, QUOTE) == 0
    ledger.try_reserve(Reservation("o2", ALICE, QUOTE, 5_000_000), 5_000_000)


def test_reservations_are_per_trader_and_per_token():
    ledger = EscrowLedger()
    ledger.try_reserve(Reservation("o1", ALICE, QUOTE, 5_000_000), 5_000_000)
    ledger.try_reserve(Reservation("o2", BOB, QUOTE, 5_000_000), 5_000_000)
    ledger.try_reserve(Reservation("o3", ALICE, BASE, 5_000_000), 5_000_000)
    assert ledger.committed(ALICE, QUOTE) == 5_000_000
    assert ledger.committed(BOB, QUOTE) == 5_000_000
    assert ledger.committed(ALICE, BASE) == 5_000_000


def test_double_release_is_a_noop():
    ledger = EscrowLedger()
    ledger.try_reserve(Reservation("o1", ALICE, QUOTE, 1_000), 5_000)
    ledger.release("o1")
    ledger.release("o1")
    assert ledger.committed(ALICE, QUOTE) == 0


def test_snapshot_and_restore_round_trip():
    """A failed batch must put the book back exactly as it was — nothing moved on-chain."""
    ledger = EscrowLedger()
    ledger.try_reserve(Reservation("o1", ALICE, QUOTE, 1_000), 5_000)
    snapshot = ledger.snapshot()
    ledger.try_reserve(Reservation("o2", ALICE, QUOTE, 2_000), 5_000)
    assert ledger.committed(ALICE, QUOTE) == 3_000
    ledger.restore(snapshot)
    assert ledger.committed(ALICE, QUOTE) == 1_000
