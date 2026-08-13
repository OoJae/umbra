"""The CLAUDE.md guardrail as executable code.

The engine must never return or log decrypted order plaintext. These tests exercise the two
mechanisms that enforce it — repr=False on every value-bearing field, and the log allowlist —
without needing a live chain connection.
"""

from __future__ import annotations

import logging

import pytest

from app import logging_setup
from app.logging_setup import UnsafeLogField, log_event
from app.models import OrderIn

TRADER = "0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09"

SECRET_AMOUNT = 2_500_000
SECRET_LIMIT = 1_015_000
SECRET_NONCE = 987654321
SECRET_DEADLINE = 1_900_000_000
SECRET_SIG = "0x" + "ab" * 65


def _order() -> OrderIn:
    return OrderIn(
        trader=TRADER,
        side=0,
        amount_base=SECRET_AMOUNT,
        limit_price_1e6=SECRET_LIMIT,
        nonce=SECRET_NONCE,
        deadline=SECRET_DEADLINE,
        signature=SECRET_SIG,
    )


def test_order_repr_redacts_every_value_bearing_field():
    """The structural defence: an accidental logger.info(order) or f-string can only ever print
    the trader address, because Pydantic honours repr=False."""
    order = _order()
    for rendering in (repr(order), str(order), f"{order}"):
        assert TRADER in rendering  # the one field that is deliberately loggable
        for secret in (SECRET_AMOUNT, SECRET_LIMIT, SECRET_NONCE, SECRET_DEADLINE):
            assert str(secret) not in rendering
        assert SECRET_SIG not in rendering


def test_order_repr_inside_a_log_record(caplog):
    order = _order()
    logger = logging.getLogger("umbra.test")
    with caplog.at_level(logging.DEBUG):
        logger.info("accidental %s", order)
    text = caplog.text
    for secret in (SECRET_AMOUNT, SECRET_LIMIT, SECRET_NONCE, SECRET_DEADLINE):
        assert str(secret) not in text


def test_log_event_rejects_non_allowlisted_fields():
    logger = logging.getLogger("umbra.test")
    for field in ("amount_base", "limit_price_1e6", "side", "nonce", "deadline", "signature"):
        with pytest.raises(UnsafeLogField):
            log_event(logger, "order.accepted", **{field: 1})


def test_log_event_accepts_safe_fields(caplog):
    logger = logging.getLogger("umbra.test")
    with caplog.at_level(logging.INFO):
        log_event(logger, "order.accepted", order_id="abc", trader=TRADER, ciphertext_len=120)
    assert "order.accepted" in caplog.text


def test_allowlist_excludes_every_plaintext_field():
    """A field name only has to slip onto the allowlist once to defeat the whole mechanism."""
    forbidden = {"amount_base", "limit_price_1e6", "side", "nonce", "deadline", "signature",
                 "plaintext", "order", "ciphertext_b64"}
    assert forbidden.isdisjoint(logging_setup.SAFE_LOG_FIELDS)


def test_accepted_response_shape_is_closed():
    """POST /orders may return exactly two keys. extra='forbid' makes a future addition a test
    failure rather than a silent disclosure."""
    from app.models import OrderAccepted

    body = OrderAccepted(accepted=True, order_id="deadbeef").model_dump()
    assert set(body) == {"accepted", "order_id"}
