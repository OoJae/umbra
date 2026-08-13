"""Per-trader escrow reservation.

The build guide never mentions this, but without it one trader can submit several orders against
the same escrow, and a shortfall in any single fill reverts the ENTIRE batch on-chain.

Buyers reserve quote at their LIMIT price, not at the mid. The mid is unknown at accept time, but
it is bounded: a BUY with limit L is only eligible when mid <= L, and amountQuote is monotonically
non-decreasing in price, so quote_for_base(amount, L) is a tight upper bound on everything that
order can ever owe. Reserving at the current mid would under-reserve the moment XRP ticks up
before the batch runs.

Sellers reserve amountBase exactly — it is price-independent.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.matching import BUY, quote_for_base

BASE = "base"
QUOTE = "quote"


class InsufficientEscrow(Exception):
    def __init__(self, token: str, requested: int, available: int) -> None:
        super().__init__(f"insufficient {token} escrow")
        self.token = token
        self.requested = requested
        self.available = available


@dataclass(frozen=True, slots=True)
class Reservation:
    order_id: str
    trader: str
    token: str  # BASE | QUOTE
    amount: int


def reservation_for(order, num: int, den: int) -> tuple[str, int]:
    """The token and amount an order must reserve."""
    if order.side == BUY:
        return (QUOTE, quote_for_base(order.amount_base, order.limit_price_1e6, num, den))
    return (BASE, order.amount_base)


class EscrowLedger:
    """In-memory, single process. Callers hold the book lock around these operations."""

    def __init__(self) -> None:
        self._committed: dict[tuple[str, str], int] = {}
        self._by_order: dict[str, Reservation] = {}

    def committed(self, trader: str, token: str) -> int:
        return self._committed.get((trader, token), 0)

    def try_reserve(self, reservation: Reservation, on_chain_balance: int) -> None:
        available = on_chain_balance - self.committed(reservation.trader, reservation.token)
        if reservation.amount > available:
            raise InsufficientEscrow(reservation.token, reservation.amount, max(available, 0))
        key = (reservation.trader, reservation.token)
        self._committed[key] = self._committed.get(key, 0) + reservation.amount
        self._by_order[reservation.order_id] = reservation

    def release(self, order_id: str) -> None:
        reservation = self._by_order.pop(order_id, None)
        if reservation is None:
            return
        key = (reservation.trader, reservation.token)
        remaining = max(0, self._committed.get(key, 0) - reservation.amount)
        if remaining:
            self._committed[key] = remaining
        else:
            self._committed.pop(key, None)

    def snapshot(self) -> tuple[dict, dict]:
        return (dict(self._committed), dict(self._by_order))

    def restore(self, snapshot: tuple[dict, dict]) -> None:
        self._committed, self._by_order = snapshot
