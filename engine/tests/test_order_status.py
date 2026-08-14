"""GET /orders/{order_id} — the lookup a trader needs, and the disclosure it must not make.

Order IDs are public: /orderbook/public lists one for every resting order. So this endpoint is
served to anyone who asks, and the security property under test is that knowing an ID buys you
nothing beyond what the Dark Book and the settled batch already publish. In particular it must
never map an order to a trader, and never carry an amount, price or side.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.main import MAX_OUTCOMES, EngineState, OrderStatusResponse


def test_response_shape_is_closed_and_carries_no_order_contents():
    body = OrderStatusResponse(order_id="abc", status="matched", batch_id=7).model_dump()
    assert set(body) == {"order_id", "status", "batch_id", "settlement_tx", "resolved_at"}

    forbidden = {"trader", "amount_base", "limit_price_1e6", "side", "nonce", "deadline",
                 "signature", "amount_quote", "ciphertext_b64"}
    assert forbidden.isdisjoint(body)


@pytest.mark.parametrize("field", ["trader", "amount_base", "limit_price_1e6", "side"])
def test_response_rejects_added_plaintext_fields(field):
    """extra='forbid' turns a future well-meaning addition into a test failure rather than a
    silent disclosure."""
    with pytest.raises(ValidationError):
        OrderStatusResponse(order_id="abc", status="matched", **{field: 1})


def test_only_terminal_statuses_are_representable():
    for status in ("pending", "matched", "unmatched", "dropped_underfunded"):
        assert OrderStatusResponse(order_id="a", status=status).status == status
    with pytest.raises(ValidationError):
        OrderStatusResponse(order_id="a", status="insufficient_escrow_for_2500000")


def test_record_outcome_round_trips():
    state = EngineState()
    with state.lock:
        state.record_outcome("order-1", "matched", 7)
        state.record_outcome("order-2", "unmatched", 7)
    assert state.outcomes["order-1"].status == "matched"
    assert state.outcomes["order-1"].batch_id == 7
    assert state.outcomes["order-2"].status == "unmatched"


def test_outcomes_are_bounded_and_evict_oldest_first():
    """A long-running enclave must not accumulate one record per order forever."""
    state = EngineState()
    with state.lock:
        for i in range(MAX_OUTCOMES + 50):
            state.record_outcome(f"order-{i}", "matched", 1)
    assert len(state.outcomes) == MAX_OUTCOMES
    assert "order-0" not in state.outcomes
    assert f"order-{MAX_OUTCOMES + 49}" in state.outcomes
