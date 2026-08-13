"""Structured logging with an allowlist, so decrypted order plaintext cannot reach a log line.

CLAUDE.md states the rule three times: the engine must never return or log decrypted order
plaintext through any endpoint. This module is the second of two defences. The first is
structural — every value-bearing field on OrderIn is repr=False, so even an accidental
`log.info("%s", order)` can only print the trader address.

Redaction by regex is deliberately NOT used: it fails silently and invisibly the first time a
value takes a shape the pattern did not anticipate.
"""

from __future__ import annotations

import json
import logging
import sys
import time

SAFE_LOG_FIELDS = frozenset(
    {
        "order_id",
        "trader",
        "ciphertext_len",
        "ciphertext_sha256",
        "count_buys",
        "count_sells",
        "batch_id",
        "fill_count",
        "order_count",
        "unmatched_count",
        "clearing_price_1e6",
        "oracle_price_1e6",
        "oracle_ts",
        "tx_hash",
        "block_number",
        "gas_used",
        "status",
        "code",
        "mode",
        "image_digest",
        "tee_eth_address",
        "duration_ms",
        "http_status",
        "path",
        "reason",
        "attempt",
        "dropped_traders",
    }
)


class UnsafeLogField(ValueError):
    """A caller tried to log a field that is not on the allowlist."""


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": int(record.created),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        extra = getattr(record, "umbra_fields", None)
        if extra:
            payload.update(extra)
        return json.dumps(payload, separators=(",", ":"), default=str)


def configure(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(getattr(logging, level, logging.INFO))


def log_event(logger: logging.Logger, event: str, level: int = logging.INFO, **fields) -> None:
    unsafe = set(fields) - SAFE_LOG_FIELDS
    if unsafe:
        raise UnsafeLogField(
            f"refusing to log non-allowlisted field(s): {sorted(unsafe)}. "
            "Order plaintext must never reach a log line."
        )
    logger.log(level, event, extra={"umbra_fields": fields})


def now_ms() -> int:
    return int(time.time() * 1000)
