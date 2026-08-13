"""Enclave key material and the sealed-order decryption boundary.

The design rule: private key material never leaves this module. `chain.py` does not receive the
signing key — it calls `sign_typed_data()` and gets 65 bytes back. `__all__` deliberately
excludes the key objects so `from app.crypto import *` cannot reach them.
"""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from typing import Any, Final

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_account.signers.local import LocalAccount
from eth_utils import keccak, to_canonical_address
from hexbytes import HexBytes
from nacl.exceptions import CryptoError
from nacl.public import PrivateKey, SealedBox

__all__ = [
    "SealError",
    "attestation_nonce",
    "image_digest",
    "info_payload",
    "order_encryption_pubkey_b64",
    "sign_transaction",
    "sign_typed_data",
    "tee_address",
]


class SealError(Exception):
    """Unsealing failed. Deliberately carries neither ciphertext nor plaintext, because its
    message is returned to the caller over HTTP."""


# Key material generated at import, i.e. at enclave boot. Never exported, never logged.
_X25519_SK: Final[PrivateKey] = PrivateKey.generate()
_SEALED_BOX: Final[SealedBox] = SealedBox(_X25519_SK)
_ACCOUNT: Final[LocalAccount] = Account.create()


def tee_address() -> str:
    """The secp256k1 address that signs batches. Public — this is what gets anchored on-chain."""
    return _ACCOUNT.address


def order_encryption_pubkey_b64() -> str:
    """32 raw X25519 bytes in STANDARD base64 with padding (44 chars).

    The browser must decode this with sodium.base64_variants.ORIGINAL — libsodium-wrappers
    defaults to URLSAFE_NO_PADDING and would silently mis-decode the '+' and '/' characters.
    """
    return base64.b64encode(bytes(_X25519_SK.public_key)).decode("ascii")


def unseal(ciphertext_b64: str) -> bytes:
    """libsodium crypto_box_seal -> plaintext. Logs neither side, ever."""
    try:
        ciphertext = base64.b64decode(ciphertext_b64, validate=True)
    except Exception as exc:
        raise SealError("ciphertext is not valid base64") from exc
    if len(ciphertext) <= 48:  # 32-byte ephemeral public key + 16-byte MAC
        raise SealError("ciphertext too short to be a sealed box")
    try:
        return _SEALED_BOX.decrypt(ciphertext)
    except CryptoError as exc:
        raise SealError("sealed box decryption failed") from exc


def sign_typed_data(
    domain: dict[str, Any], types: dict[str, Any], message: dict[str, Any]
) -> HexBytes:
    """Sign EIP-712 with the enclave key.

    `types` MUST already be filtered to the primary type's transitive closure (see
    models.types_for) or eth_account raises "Unable to determine primary type", because
    docs/eip712.json contains two unreferenced root types.

    Low-s is structural rather than hoped for: coincurve is absent, so eth_keys uses its native
    backend, whose ecdsa_raw_sign normalizes s to the lower half of the curve order. OpenZeppelin
    rejects high-s signatures, so we can never produce one it would refuse.
    """
    signable = encode_typed_data(domain, types, message)
    return Account.sign_message(signable, _ACCOUNT.key).signature


def sign_transaction(tx: dict[str, Any]):
    """Sign a transaction with the enclave key. Returns eth_account's SignedTransaction, whose
    raw bytes are `.raw_transaction` (renamed from `.rawTransaction` in eth-account 0.13)."""
    return Account.sign_transaction(tx, _ACCOUNT.key)


def attestation_nonce(vault_address: str) -> str:
    """keccak256(bytes20(teeAddress) || bytes20(vaultAddress)), as 0x + 64 hex.

    Raw 20-byte addresses concatenated, NOT hex strings: this makes the derivation independent of
    EIP-55 checksum casing and reproducible in one line from Solidity
    (keccak256(abi.encodePacked(a, b))) or viem (keccak256(concat([a, b]))).

    The code image digest is deliberately not in the preimage. The Confidential Space launcher
    already asserts it authoritatively as submods.container.image_digest; a digest the workload
    stuffs into its own nonce would be self-asserted and therefore worthless.
    """
    tee = to_canonical_address(tee_address())
    vault = to_canonical_address(vault_address)
    assert len(tee) == 20 and len(vault) == 20
    return "0x" + keccak(tee + vault).hex()


def image_digest(mode: str, env_digest: str) -> str:
    """Under Confidential Space the launcher supplies the authoritative digest. Locally we hash
    our own source so the Verify page has something real and deterministic to show, clearly
    labelled as simulated rather than dressed up as a container digest."""
    if mode == "confidential_space" and env_digest:
        return env_digest
    if env_digest:
        return env_digest
    digest = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return f"simulated:sha256:{digest.hexdigest()}"


def info_payload(settings) -> dict[str, Any]:
    return {
        "tee_eth_address": tee_address(),
        "order_encryption_pubkey_b64": order_encryption_pubkey_b64(),
        "mode": settings.tee_mode,
        "image_digest": image_digest(settings.tee_mode, settings.image_digest),
        "vault": settings.vault_address,
        "chain_id": settings.chain_id,
    }
