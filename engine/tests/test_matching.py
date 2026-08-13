"""Matcher and settlement-formula tests. Entirely offline and pure."""

from __future__ import annotations

import random

import pytest

from app.matching import (
    BUY,
    SELL,
    Fill,
    MatchInvariantError,
    MatchOrder,
    match_batch,
    min_fillable_base,
    quote_for_base,
    quote_scale,
)

ALICE = "0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09"
BOB = "0x016fb6f97db4e99611F789Ae172d9DCA9593BE0b"
CAROL = "0x70a3D24068C064195a17D921712FdC747F2465f9"
DAVE = "0xD8CB8187D855Dc81066A3D655815047968F21500"

MID = 1_010_002  # the live Coston2 XRP/USD reading
NUM, DEN = quote_scale(6, 6)


def order(oid, trader, side, amount, limit, seq=0):
    return MatchOrder(oid, trader, side, amount, limit, seq)


# ─────────────────────────── the settlement formula ───────────────────────────


def test_quote_scale_matches_constructor_branches():
    assert quote_scale(6, 6) == (1, 1_000_000)
    assert quote_scale(18, 6) == (1, 10**18)
    assert quote_scale(6, 18) == (10**6, 1)


def test_fixture_quotes(fx):
    """The same amounts the Solidity suite and the signed fixture agree on."""
    price = fx["batch"]["message"]["clearingPrice1e6"]
    for fill in fx["batch"]["message"]["fills"]:
        assert quote_for_base(fill["amountBase"], price, NUM, DEN) == fill["amountQuote"]


@pytest.mark.parametrize("base_dec,quote_dec", [(6, 6), (18, 6), (6, 18), (8, 6), (0, 18)])
def test_matches_muldiv_definition(base_dec, quote_dec):
    num, den = quote_scale(base_dec, quote_dec)
    for amount in (1, 7, 10**base_dec, 3 * 10**base_dec + 1, 2**64):
        for price in (1, 999_999, 1_000_000, MID, 10**12):
            expected = (amount * price * (10**quote_dec)) // ((10**base_dec) * 10**6)
            assert quote_for_base(amount, price, num, den) == expected


def test_result_is_always_int():
    value = quote_for_base(3_333_333, 999_999, NUM, DEN)
    assert isinstance(value, int) and not isinstance(value, bool)


def test_floor_direction():
    # 1 base unit at $0.999999 floors to zero quote at 6/6.
    assert quote_for_base(1, 999_999, NUM, DEN) == 0


def test_min_fillable_base():
    assert min_fillable_base(MID, NUM, DEN) == 1  # never binds at 6/6
    num18, den18 = quote_scale(18, 6)
    threshold = min_fillable_base(MID, num18, den18)
    assert quote_for_base(threshold, MID, num18, den18) >= 1
    assert quote_for_base(threshold - 1, MID, num18, den18) == 0


# ─────────────────────────── matching ───────────────────────────


def test_simple_cross():
    orders = [
        order("b1", ALICE, BUY, 2_000_000, MID + 5_000),
        order("s1", BOB, SELL, 2_000_000, MID - 5_000),
    ]
    result = match_batch(orders, MID, NUM, DEN)
    assert len(result.fills) == 1
    fill = result.fills[0]
    assert fill == Fill(ALICE, BOB, 2_000_000, quote_for_base(2_000_000, MID, NUM, DEN))


def test_ineligible_orders_excluded():
    orders = [
        order("b1", ALICE, BUY, 1_000_000, MID - 1),  # bid below the mid
        order("s1", BOB, SELL, 1_000_000, MID + 1),  # ask above the mid
    ]
    assert match_batch(orders, MID, NUM, DEN).fills == ()


def test_limit_equal_to_mid_is_eligible_on_both_sides():
    orders = [
        order("b1", ALICE, BUY, 1_000_000, MID),
        order("s1", BOB, SELL, 1_000_000, MID),
    ]
    assert len(match_batch(orders, MID, NUM, DEN).fills) == 1


def test_buy_heavy_pro_rata():
    """Three buys totalling 600 against one sell of 100. Each buyer gets a floored share."""
    orders = [
        order("b1", ALICE, BUY, 300, MID + 1, seq=0),
        order("b2", CAROL, BUY, 200, MID + 1, seq=1),
        order("b3", DAVE, BUY, 100, MID + 1, seq=2),
        order("s1", BOB, SELL, 100, MID - 1, seq=3),
    ]
    result = match_batch(orders, MID, NUM, DEN)
    # allocations floor to 50 / 33 / 16 = 99; one unit of dust stays unfilled
    assert result.total_base == 99
    per_buyer = {}
    for fill in result.fills:
        per_buyer[fill.buyer] = per_buyer.get(fill.buyer, 0) + fill.amount_base
    assert per_buyer == {ALICE: 50, CAROL: 33, DAVE: 16}


def test_sell_heavy_pro_rata():
    orders = [
        order("s1", ALICE, SELL, 300, MID - 1, seq=0),
        order("s2", CAROL, SELL, 200, MID - 1, seq=1),
        order("s3", DAVE, SELL, 100, MID - 1, seq=2),
        order("b1", BOB, BUY, 100, MID + 1, seq=3),
    ]
    result = match_batch(orders, MID, NUM, DEN)
    assert result.total_base == 99
    per_seller = {}
    for fill in result.fills:
        per_seller[fill.seller] = per_seller.get(fill.seller, 0) + fill.amount_base
    assert per_seller == {ALICE: 50, CAROL: 33, DAVE: 16}


def test_balanced_book_fills_completely():
    orders = [
        order("b1", ALICE, BUY, 5_000_000, MID + 1),
        order("s1", BOB, SELL, 5_000_000, MID - 1),
    ]
    assert match_batch(orders, MID, NUM, DEN).total_base == 5_000_000


def test_self_trade_excluded_single_trader():
    """A trader on both sides of the book must produce no fills at all."""
    orders = [
        order("b1", ALICE, BUY, 1_000_000, MID + 1),
        order("s1", ALICE, SELL, 1_000_000, MID - 1),
    ]
    assert match_batch(orders, MID, NUM, DEN).fills == ()


def test_self_trade_with_third_party_still_trades():
    orders = [
        order("b1", ALICE, BUY, 1_000_000, MID + 1, seq=0),
        order("s1", ALICE, SELL, 1_000_000, MID - 1, seq=1),
        order("s2", BOB, SELL, 1_000_000, MID - 1, seq=2),
    ]
    result = match_batch(orders, MID, NUM, DEN)
    assert all(f.buyer != f.seller for f in result.fills)
    assert any(f.buyer == ALICE and f.seller == BOB for f in result.fills)


def test_multi_pair_book():
    orders = [
        order("b1", ALICE, BUY, 2_000_000, MID + 1, seq=0),
        order("b2", CAROL, BUY, 1_000_000, MID + 1, seq=1),
        order("s1", BOB, SELL, 2_000_000, MID - 1, seq=2),
        order("s2", DAVE, SELL, 1_000_000, MID - 1, seq=3),
    ]
    result = match_batch(orders, MID, NUM, DEN)
    assert result.total_base == 3_000_000


def test_determinism_under_shuffle():
    orders = [
        order("b1", ALICE, BUY, 300, MID + 3, seq=0),
        order("b2", CAROL, BUY, 200, MID + 2, seq=1),
        order("s1", BOB, SELL, 250, MID - 1, seq=2),
        order("s2", DAVE, SELL, 150, MID - 2, seq=3),
    ]
    baseline = match_batch(orders, MID, NUM, DEN)
    rng = random.Random(1337)
    for _ in range(20):
        shuffled = orders[:]
        rng.shuffle(shuffled)
        assert match_batch(shuffled, MID, NUM, DEN) == baseline


def test_fill_cap_respected():
    orders = [order(f"b{i}", f"0x{i:040x}", BUY, 1_000, MID + 1, seq=i) for i in range(300)]
    orders += [
        order(f"s{i}", f"0x{i + 1000:040x}", SELL, 1_000, MID - 1, seq=1000 + i) for i in range(300)
    ]
    result = match_batch(orders, MID, NUM, DEN, max_fills=256)
    assert len(result.fills) <= 256


def test_empty_and_single_sided_books():
    assert match_batch([], MID, NUM, DEN).fills == ()
    assert match_batch([order("b1", ALICE, BUY, 100, MID + 1)], MID, NUM, DEN).fills == ()


def test_invalid_clearing_price_rejected():
    with pytest.raises(MatchInvariantError):
        match_batch([], 0, NUM, DEN)
    with pytest.raises(MatchInvariantError):
        match_batch([], 10**18 + 1, NUM, DEN)


@pytest.mark.parametrize("base_dec,quote_dec", [(6, 6), (18, 6), (6, 18)])
def test_randomized_conservation(base_dec, quote_dec):
    """The invariant sweep. This is where real bugs surface."""
    num, den = quote_scale(base_dec, quote_dec)
    rng = random.Random(20260814)
    traders = [ALICE, BOB, CAROL, DAVE]
    unit = 10**base_dec

    for _ in range(200):
        mid = rng.randrange(900_000, 1_100_000)
        orders = []
        for i in range(rng.randrange(1, 7)):
            orders.append(
                order(
                    f"b{i}",
                    rng.choice(traders),
                    BUY,
                    rng.randrange(unit // 100 + 1, 5 * unit),
                    mid + rng.randrange(0, 50_000),
                    seq=i,
                )
            )
        for i in range(rng.randrange(1, 7)):
            orders.append(
                order(
                    f"s{i}",
                    rng.choice(traders),
                    SELL,
                    rng.randrange(unit // 100 + 1, 5 * unit),
                    mid - rng.randrange(0, 50_000),
                    seq=100 + i,
                )
            )

        result = match_batch(orders, mid, num, den)

        eligible_buy = sum(o.amount_base for o in orders if o.side == BUY and o.limit_price_1e6 >= mid)
        eligible_sell = sum(
            o.amount_base for o in orders if o.side == SELL and o.limit_price_1e6 <= mid
        )
        assert result.total_base <= min(eligible_buy, eligible_sell)

        for fill in result.fills:
            assert fill.buyer != fill.seller
            assert fill.amount_base > 0 and fill.amount_quote > 0
            assert fill.amount_quote == quote_for_base(fill.amount_base, mid, num, den)

        # no trader receives or sells more than they asked for
        bought, sold = {}, {}
        for fill in result.fills:
            bought[fill.buyer] = bought.get(fill.buyer, 0) + fill.amount_base
            sold[fill.seller] = sold.get(fill.seller, 0) + fill.amount_base
        for trader, amount in bought.items():
            cap = sum(
                o.amount_base
                for o in orders
                if o.side == BUY and o.trader == trader and o.limit_price_1e6 >= mid
            )
            assert amount <= cap
        for trader, amount in sold.items():
            cap = sum(
                o.amount_base
                for o in orders
                if o.side == SELL and o.trader == trader and o.limit_price_1e6 <= mid
            )
            assert amount <= cap
