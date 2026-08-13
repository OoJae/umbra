"""Uniform-price sealed-bid batch auction. Pure functions, integers only.

Every constraint UmbraVault.settleBatch enforces is enforced here first, so a disagreement
becomes a refusal to sign rather than a reverted settlement on stage.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

BUY = 0
SELL = 1

MAX_PRICE_1E6 = 10**18  # mirrors UmbraVault.MAX_PRICE_1E6


class MatchInvariantError(Exception):
    """A post-condition failed. Refuse to sign — never ship this batch."""


def quote_scale(base_dec: int, quote_dec: int) -> tuple[int, int]:
    """Mirror of the UmbraVault constructor: d = quoteDec - baseDec - 6.

    Exactly one of (num, den) is always 1. At the live 6/6 pairing this is (1, 1_000_000).
    """
    d = quote_dec - base_dec - 6
    return (10**d, 1) if d >= 0 else (1, 10 ** (-d))


def quote_for_base(amount_base: int, clearing_price_1e6: int, num: int, den: int) -> int:
    """THE settlement formula. Mirrors UmbraVault._quoteForBase byte-for-byte:

        Math.mulDiv(amountBase, clearingPrice1e6 * quoteScaleNum, quoteScaleDen)

    Python ints are arbitrary precision, so `//` reproduces mulDiv's full 512-bit intermediate
    for free, and floors for non-negative operands exactly as Solidity's `/` does.

    NEVER float — it diverges past ~15 significant digits. NEVER Decimal — its default 28-digit
    context silently rounds a uint256 product. Either one produces a one-wei disagreement that
    reverts the entire batch.
    """
    return (amount_base * clearing_price_1e6 * num) // den


def min_fillable_base(clearing_price_1e6: int, num: int, den: int) -> int:
    """Smallest amountBase whose quote is at least 1.

    The contract reverts ZeroFillAmount when a computed quote floors to zero, so any allocation
    below this is unfillable dust and must never become a Fill. At 6/6 with a ~$1 mid this is 1
    and never binds; with an 18-decimal base it binds hard.
    """
    numerator = clearing_price_1e6 * num
    if numerator >= den:
        return 1
    return -(-den // numerator)  # ceil division


@dataclass(frozen=True, slots=True)
class MatchOrder:
    order_id: str
    trader: str  # checksummed
    side: int
    amount_base: int
    limit_price_1e6: int
    seq: int  # arrival sequence — the deterministic tiebreaker


@dataclass(frozen=True, slots=True)
class Fill:
    buyer: str
    seller: str
    amount_base: int
    amount_quote: int


@dataclass(frozen=True, slots=True)
class MatchResult:
    fills: tuple[Fill, ...]
    clearing_price_1e6: int
    total_base: int
    total_quote: int
    eligible_buy_ids: tuple[str, ...]
    eligible_sell_ids: tuple[str, ...]
    matched_trader_count: int


def match_batch(
    orders: Sequence[MatchOrder],
    clearing_price_1e6: int,
    quote_num: int,
    quote_den: int,
    max_fills: int = 256,
) -> MatchResult:
    """Clear every crossing order at a single uniform price, pro-rata on the heavy side.

    Pure: no I/O, no clock, no randomness. The sort key is total, so a shuffled input produces a
    byte-identical result — required, because the batch is signed.
    """
    mid = clearing_price_1e6
    if not 0 < mid <= MAX_PRICE_1E6:
        raise MatchInvariantError(f"clearing price out of range: {mid}")

    buys = sorted(
        (o for o in orders if o.side == BUY and o.limit_price_1e6 >= mid and o.amount_base > 0),
        key=lambda o: (-o.limit_price_1e6, o.seq, o.order_id),
    )
    sells = sorted(
        (o for o in orders if o.side == SELL and o.limit_price_1e6 <= mid and o.amount_base > 0),
        key=lambda o: (o.limit_price_1e6, o.seq, o.order_id),
    )
    buy_ids = tuple(o.order_id for o in buys)
    sell_ids = tuple(o.order_id for o in sells)

    if not buys or not sells:
        return MatchResult((), mid, 0, 0, buy_ids, sell_ids, 0)

    total_buy = sum(o.amount_base for o in buys)
    total_sell = sum(o.amount_base for o in sells)
    fillable = min(total_buy, total_sell)
    if fillable == 0:
        return MatchResult((), mid, 0, 0, buy_ids, sell_ids, 0)

    # One allocation formula for BOTH sides: alloc = amount * fillable // side_total.
    # On the light side side_total == fillable, so alloc == amount (a full fill) with no branch.
    # On the heavy side it is a true pro-rata share. Because fillable <= side_total, alloc can
    # never exceed the trader's own order on either side.
    #
    # Floor rounding leaves a deficit strictly smaller than the number of orders on that side.
    # That deficit stays UNFILLED as dust and is never redistributed: redistribution would be an
    # extra rule the Solidity side knows nothing about, and it is exactly where a QuoteMismatch
    # would hide.
    min_base = min_fillable_base(mid, quote_num, quote_den)
    buy_rem = [
        alloc if (alloc := o.amount_base * fillable // total_buy) >= min_base else 0 for o in buys
    ]
    sell_rem = [
        alloc if (alloc := o.amount_base * fillable // total_sell) >= min_base else 0 for o in sells
    ]

    fills: list[Fill] = []
    i = 0
    low_water = 0
    while i < len(buys) and len(fills) < max_fills:
        if buy_rem[i] == 0:
            i += 1
            continue
        while low_water < len(sells) and sell_rem[low_water] == 0:
            low_water += 1
        if low_water >= len(sells):
            break

        # A self-trade reverts the whole batch, so scan forward for the first live sell from a
        # different trader. Skipped sells stay available to later buys, so no liquidity is lost.
        j = low_water
        while j < len(sells) and (sell_rem[j] == 0 or sells[j].trader == buys[i].trader):
            j += 1
        if j >= len(sells):
            buy_rem[i] = 0  # unmatchable against the entire remaining book
            i += 1
            continue

        take = min(buy_rem[i], sell_rem[j])
        q = quote_for_base(take, mid, quote_num, quote_den)
        if q == 0:
            # Defensive: min_base should already prevent this. The quote is monotonic in `take`
            # and `take` is already this pair's maximum, so no larger trade exists here. Retire
            # the smaller side so the loop still terminates.
            if buy_rem[i] <= sell_rem[j]:
                buy_rem[i] = 0
            else:
                sell_rem[j] = 0
            continue

        fills.append(Fill(buys[i].trader, sells[j].trader, take, q))
        buy_rem[i] -= take
        sell_rem[j] -= take
        if 0 < buy_rem[i] < min_base:
            buy_rem[i] = 0
        if 0 < sell_rem[j] < min_base:
            sell_rem[j] = 0

    traders = {f.buyer for f in fills} | {f.seller for f in fills}
    result = MatchResult(
        fills=tuple(fills),
        clearing_price_1e6=mid,
        total_base=sum(f.amount_base for f in fills),
        total_quote=sum(f.amount_quote for f in fills),
        eligible_buy_ids=buy_ids,
        eligible_sell_ids=sell_ids,
        matched_trader_count=len(traders),
    )
    assert_invariants(result, buys, sells, fillable, quote_num, quote_den, max_fills)
    return result


def assert_invariants(
    result: MatchResult,
    buys: Sequence[MatchOrder],
    sells: Sequence[MatchOrder],
    fillable: int,
    num: int,
    den: int,
    max_fills: int,
) -> None:
    """Re-check every settleBatch revert path locally. Cheap, and always on."""
    if len(result.fills) > max_fills:
        raise MatchInvariantError(f"{len(result.fills)} fills exceeds max {max_fills}")
    if result.total_base > fillable:
        raise MatchInvariantError("traded volume exceeds min(sum buys, sum sells)")

    bought: dict[str, int] = {}
    sold: dict[str, int] = {}
    for index, fill in enumerate(result.fills):
        if fill.amount_base == 0 or fill.amount_quote == 0:
            raise MatchInvariantError(f"fill {index} has a zero leg")
        if fill.buyer == fill.seller:
            raise MatchInvariantError(f"fill {index} is a self-trade")
        expected = quote_for_base(fill.amount_base, result.clearing_price_1e6, num, den)
        if fill.amount_quote != expected:
            raise MatchInvariantError(
                f"fill {index} violates the quote formula: {fill.amount_quote} != {expected}"
            )
        bought[fill.buyer] = bought.get(fill.buyer, 0) + fill.amount_base
        sold[fill.seller] = sold.get(fill.seller, 0) + fill.amount_base

    buy_cap: dict[str, int] = {}
    for order in buys:
        buy_cap[order.trader] = buy_cap.get(order.trader, 0) + order.amount_base
    sell_cap: dict[str, int] = {}
    for order in sells:
        sell_cap[order.trader] = sell_cap.get(order.trader, 0) + order.amount_base

    for trader, amount in bought.items():
        if amount > buy_cap.get(trader, 0):
            raise MatchInvariantError(f"buyer {trader} over-allocated")
    for trader, amount in sold.items():
        if amount > sell_cap.get(trader, 0):
            raise MatchInvariantError(f"seller {trader} over-allocated")
