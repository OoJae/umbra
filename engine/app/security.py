"""Operator-token gate for POST /batch/run."""

from __future__ import annotations

import hashlib
import hmac

from fastapi import Header, HTTPException

OPERATOR_HEADER = "X-Umbra-Operator-Token"

_settings = None


def bind_settings(settings) -> None:
    global _settings
    _settings = settings


def require_operator(token: str | None = Header(default=None, alias=OPERATOR_HEADER)) -> None:
    """Fails closed when no token is configured.

    The comparison is over fixed-width SHA-256 digests rather than the raw strings: hmac's
    constant-time compare is constant-time only for equal-length inputs, so hashing first removes
    the residual length oracle.
    """
    if _settings is None or not _settings.operator_token_sha256:
        raise HTTPException(status_code=503, detail={"code": "operator_token_unset"})
    if not token:
        raise HTTPException(status_code=401, detail={"code": "missing_operator_token"})
    supplied = hashlib.sha256(token.encode("utf-8")).digest()
    expected = bytes.fromhex(_settings.operator_token_sha256)
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail={"code": "invalid_operator_token"})
