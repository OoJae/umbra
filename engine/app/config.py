"""Engine configuration, loaded from the environment and validated at import time.

Deliberately a plain frozen dataclass rather than pydantic-settings: the Dockerfile runs
`uv sync --frozen`, so a new dependency means regenerating uv.lock, which changes the image
digest, which invalidates the attestation hash anchored in TeeRegistry. Forty lines of parsing
is cheaper than that ceremony. `python-dotenv` is already available transitively via
uvicorn[standard], so .env loading costs nothing either.

Chain-derived values (token decimals, quote scale, band, oracle age) are deliberately NOT env
vars — they are read from the deployed vault at boot. A second source of truth for those can
drift silently from the bytecode and only reveal itself as a revert during settlement.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from eth_utils import to_checksum_address


class ConfigError(RuntimeError):
    """Raised during startup. The process must not serve traffic."""


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is required and unset")
    return value


def _address(name: str) -> str:
    try:
        return to_checksum_address(_require(name))
    except ConfigError:
        raise
    except Exception as exc:
        raise ConfigError(f"{name} is not a valid address") from exc


def _optional_address(name: str) -> str | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        return to_checksum_address(raw)
    except Exception as exc:
        raise ConfigError(f"{name} is not a valid address") from exc


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


@dataclass(frozen=True, slots=True)
class Settings:
    rpc_url: str
    chain_id: int
    vault_address: str
    registry_address: str | None
    operator_token_sha256: str
    tee_mode: str
    image_digest: str
    engine_public_url: str
    attestation_audience: str
    attestation_required: bool
    oracle_safety_margin_s: int
    min_gas_balance_wei: int
    tx_timeout_s: int
    tx_fee_multiplier: int
    batch_retry_limit: int
    max_book_size: int
    log_level: str

    @classmethod
    def from_env(cls) -> "Settings":
        # Search upward so `pytest` from engine/ and `uvicorn` from the repo root both find it.
        # In the container there is no .env and load_dotenv is a silent no-op.
        here = Path.cwd()
        for candidate in (here / ".env", here.parent / ".env", here.parent.parent / ".env"):
            if candidate.is_file():
                load_dotenv(candidate, override=False)
                break

        # The settlement key is generated inside the enclave at boot. Accepting one from the
        # environment would silently destroy the entire trust story, so refuse to start.
        for banned in ("TEE_PRIVATE_KEY", "ENGINE_PRIVATE_KEY", "SETTLEMENT_PRIVATE_KEY"):
            if os.environ.get(banned):
                raise ConfigError(
                    f"{banned} is set. The TEE settlement key is generated inside the enclave "
                    "and may never be supplied from the environment."
                )

        mode = os.environ.get("TEE_MODE", "simulated").strip()
        if mode not in ("simulated", "confidential_space"):
            raise ConfigError(f"TEE_MODE must be simulated|confidential_space, got {mode!r}")

        # Prefer the hash. Under Confidential Space a tee-env value lands in VM metadata and in
        # the attestation token's env_override claim — the same JWT we publish and hash on-chain.
        # Publishing a SHA-256 of the token leaks nothing.
        token_sha = os.environ.get("OPERATOR_TOKEN_SHA256", "").strip().lower()
        if token_sha:
            if len(token_sha) != 64 or any(c not in "0123456789abcdef" for c in token_sha):
                raise ConfigError("OPERATOR_TOKEN_SHA256 must be 64 hex characters")
        else:
            token = _require("OPERATOR_TOKEN")
            if len(token) < 16:
                raise ConfigError("OPERATOR_TOKEN must be at least 16 chars (openssl rand -hex 16)")
            token_sha = hashlib.sha256(token.encode("utf-8")).hexdigest()

        vault = _address("VAULT_ADDRESS")
        return cls(
            rpc_url=_require("COSTON2_RPC_URL"),
            chain_id=_int("CHAIN_ID", 114),
            vault_address=vault,
            registry_address=_optional_address("REGISTRY_ADDRESS"),
            operator_token_sha256=token_sha,
            tee_mode=mode,
            image_digest=os.environ.get("IMAGE_DIGEST", "").strip(),
            engine_public_url=os.environ.get("ENGINE_PUBLIC_URL", "http://localhost:8080").strip(),
            attestation_audience=os.environ.get(
                "ATTESTATION_AUDIENCE", f"https://umbra.dark-pool/coston2/{vault}"
            ).strip(),
            attestation_required=_bool("ATTESTATION_REQUIRED", False),
            oracle_safety_margin_s=_int("ORACLE_SAFETY_MARGIN_S", 120),
            min_gas_balance_wei=_int("MIN_GAS_BALANCE_WEI", 10**18),
            tx_timeout_s=_int("TX_TIMEOUT_S", 180),
            tx_fee_multiplier=_int("TX_FEE_MULTIPLIER", 3),
            batch_retry_limit=_int("BATCH_RETRY_LIMIT", 2),
            max_book_size=_int("MAX_BOOK_SIZE", 512),
            log_level=os.environ.get("LOG_LEVEL", "INFO").strip().upper(),
        )
