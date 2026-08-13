"""Attestation: a real Confidential Space vTPM token, or a clearly-labelled simulated one.

The token is fetched once at boot and then frozen for the process lifetime. That is deliberate:
TeeRegistry.attestationHash anchors keccak256 of this exact string, so re-fetching would mint a
new token (fresh iat/exp) and the on-chain anchor would stop matching, making the Verify page show
a permanent false mismatch. The token attests a boot-time event; freezing it is correct.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import socket
import time
from dataclasses import dataclass, field
from http.client import HTTPConnection
from typing import Any

from eth_utils import keccak

log = logging.getLogger(__name__)

# Documented Confidential Space launcher socket and endpoint.
CS_SOCKET_PATH = os.environ.get("CS_ATTESTATION_SOCKET", "/run/container_launcher/teeserver.sock")
CS_TOKEN_PATH = "/v1/token"


class AttestationError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class AttestationBundle:
    mode: str
    status: str  # ok | fallback
    raw: str
    audience: str
    nonce_hex: str
    image_digest: str
    keccak256: str
    fetched_at: int
    error_code: str | None = None
    decoded: dict[str, Any] = field(default_factory=dict)


class _UnixHTTPConnection(HTTPConnection):
    """HTTP over an AF_UNIX socket, using only the standard library.

    Deliberately not requests-unixsocket: adding a dependency would force a uv.lock regeneration,
    which changes the image digest, which invalidates the attestation anchored on-chain.
    """

    def __init__(self, socket_path: str, timeout: float = 10.0) -> None:
        super().__init__("localhost", timeout=timeout)
        self._socket_path = socket_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self._socket_path)
        self.sock = sock


def _request_cs_token(audience: str, nonces: list[str], token_type: str = "OIDC") -> str:
    if not os.path.exists(CS_SOCKET_PATH):
        raise AttestationError("socket_missing", f"{CS_SOCKET_PATH} does not exist")
    body = json.dumps({"audience": audience, "token_type": token_type, "nonces": nonces})
    conn = _UnixHTTPConnection(CS_SOCKET_PATH)
    try:
        conn.request("POST", CS_TOKEN_PATH, body=body, headers={"Content-Type": "application/json"})
        response = conn.getresponse()
        data = response.read()
        if response.status != 200:
            raise AttestationError("http_error", f"status={response.status} body[:80]={data[:80]!r}")
        token = data.decode("utf-8").strip()
        # Guard rather than assume the framing: if the launcher ever wraps the token in JSON, this
        # fails loudly with the first bytes visible instead of anchoring a garbage hash.
        if token.count(".") != 2:
            raise AttestationError("bad_response", f"not a compact JWS; first 80 bytes: {data[:80]!r}")
        return token
    except AttestationError:
        raise
    except (OSError, socket.timeout) as exc:
        raise AttestationError("socket_error", str(exc)) from exc
    finally:
        conn.close()


def _b64url_decode(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_jwt_unverified(token: str) -> dict[str, Any]:
    """Split and decode a compact JWS WITHOUT verifying its signature.

    Real verification needs Google's JWKS and RS256, which is the flare-vtpm-attestation stretch
    goal, not this build. `signature_verified` is always False and always present so nothing —
    frontend or judge — can mistake decoding for verification.
    """
    parts = token.split(".")
    if len(parts) not in (2, 3):
        raise ValueError("not a compact JWS")
    payload = json.loads(_b64url_decode(parts[1]))
    expiry = payload.get("exp")
    return {
        "header": json.loads(_b64url_decode(parts[0])),
        "payload": payload,
        "signature_b64url": parts[2] if len(parts) == 3 else "",
        "signature_verified": False,
        "expired": bool(expiry and int(expiry) < int(time.time())),
    }


def _simulated_token(
    audience: str, nonce_hex: str, tee_address: str, image_digest: str, extra: dict[str, Any]
) -> str:
    """A valid unsecured JWS (RFC 7519 §6): alg "none", empty signature, trailing dot.

    The claim names mirror the real Confidential Space token so the Verify page needs exactly one
    decoder for both modes. Simulation is unmistakable at three independent points: alg "none",
    simulated: true, and hwmodel SIMULATED.
    """
    issued = int(time.time())
    header = {"alg": "none", "typ": "JWT", "kid": "umbra-simulated"}
    payload = {
        "simulated": True,
        "iss": "https://umbra.local/simulated-attestation",
        "aud": audience,
        "sub": "umbra-simulated-enclave",
        "iat": issued,
        "nbf": issued,
        "exp": issued + 3600,
        "eat_nonce": [nonce_hex],
        "nonce": nonce_hex,
        "eth_address": tee_address,
        "image_digest": image_digest,
        "hwmodel": "SIMULATED",
        "swname": "UMBRA_SIMULATED",
        "swversion": ["0.1.0"],
        "secboot": False,
        "dbgstat": "simulated",
        "submods": {"container": {"image_digest": image_digest}},
        **extra,
    }
    return (
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
        + "."
    )


def build_attestation(
    tee_address: str, vault_address: str, nonce_hex: str, mode: str, audience: str, image_digest: str
) -> AttestationBundle:
    """Fetch (or simulate) the attestation token.

    A Confidential Space socket failure does NOT crash the engine. A real TDX VM whose token
    fetch fails still matches and settles; it reports its own degradation honestly through
    /attestation and /healthz rather than pretending to be attested.
    """
    status = "ok"
    error_code = None
    raw = ""

    if mode == "confidential_space":
        try:
            raw = _request_cs_token(audience, [nonce_hex])
        except AttestationError as exc:
            log.warning("confidential space attestation unavailable: %s (%s)", exc.code, exc.detail)
            status = "fallback"
            error_code = exc.code
            raw = _simulated_token(
                audience,
                nonce_hex,
                tee_address,
                image_digest,
                {"fallback_from": "confidential_space", "attestation_error": exc.code},
            )
    else:
        raw = _simulated_token(audience, nonce_hex, tee_address, image_digest, {})

    try:
        decoded = decode_jwt_unverified(raw)
    except Exception as exc:  # pragma: no cover - defensive
        decoded = {"error": f"could not decode token: {exc}"}

    real_digest = image_digest
    payload = decoded.get("payload", {})
    container = payload.get("submods", {}).get("container", {}) if isinstance(payload, dict) else {}
    if isinstance(container, dict) and container.get("image_digest"):
        real_digest = container["image_digest"]

    return AttestationBundle(
        mode=mode,
        status=status,
        raw=raw,
        audience=audience,
        nonce_hex=nonce_hex,
        image_digest=real_digest,
        keccak256="0x" + keccak(text=raw).hex(),
        fetched_at=int(time.time()),
        error_code=error_code,
        decoded=decoded,
    )
