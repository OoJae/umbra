"""The cross-language lock.

Every assertion reads docs/eip712-fixture.json — the same file contracts/test/Eip712Parity.t.sol
asserts against. The tests are ordered by encoding layer (domain -> per-fill -> array -> struct ->
digest -> signature) so that when parity breaks, the first failure names the layer that diverged
instead of leaving you to bisect an opaque hash mismatch.

Agreement is checked on the exact 65 signature bytes, not merely on the recovered address: all
three stacks use RFC 6979 deterministic nonces, so a byte difference is a real difference.
"""

from __future__ import annotations

import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data, hash_domain, hash_eip712_message
from eth_utils import keccak

from app import models

SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141


def _signable(fx, primary, message, types):
    return encode_typed_data(fx["domain"], types, message)


def test_fixture_key_derives_signer(fx, fixture_key):
    assert Account.from_key(fixture_key).address == fx["signer"]["address"]


def test_domain_separator(fx):
    assert "0x" + hash_domain(fx["domain"]).hex() == fx["batch"]["expected"]["domainSeparator"]


def test_fill_struct_hashes(fx):
    expected = fx["batch"]["expected"]["fillStructHashes"]
    for fill, want in zip(fx["batch"]["message"]["fills"], expected, strict=True):
        assert "0x" + hash_eip712_message(models.FILL_TYPES, fill).hex() == want


def test_fills_array_hash(fx):
    """Proves the bare-concatenation encoding. abi.encode would prepend an offset and a length
    and silently break parity with Solidity's keccak256(abi.encodePacked(bytes32[]))."""
    hashes = [
        hash_eip712_message(models.FILL_TYPES, f) for f in fx["batch"]["message"]["fills"]
    ]
    assert "0x" + keccak(b"".join(hashes)).hex() == fx["batch"]["expected"]["fillsArrayHash"]


def test_batch_struct_hash(fx):
    got = hash_eip712_message(models.BATCH_TYPES, fx["batch"]["message"])
    assert "0x" + got.hex() == fx["batch"]["expected"]["batchStructHash"]


def test_batch_digest(fx):
    """keccak(0x19 || 0x01 || domainSeparator || structHash). Omitting the 0x19 prefix yields a
    plausible-looking but wrong digest."""
    digest = keccak(
        b"\x19\x01"
        + hash_domain(fx["domain"])
        + hash_eip712_message(models.BATCH_TYPES, fx["batch"]["message"])
    )
    assert "0x" + digest.hex() == fx["batch"]["expected"]["digest"]


def test_batch_digest_via_signable(fx):
    """A second, independent path to the same digest."""
    signable = _signable(fx, "Batch", fx["batch"]["message"], models.BATCH_TYPES)
    signed = Account.sign_message(signable, private_key=keccak(text=fx["signer"]["derivation"]))
    assert signed.message_hash.to_0x_hex() == fx["batch"]["expected"]["digest"]


def test_batch_signature_byte_identical(fx, fixture_key):
    signable = _signable(fx, "Batch", fx["batch"]["message"], models.BATCH_TYPES)
    signed = Account.sign_message(signable, private_key=fixture_key)
    assert signed.signature.to_0x_hex() == fx["batch"]["expected"]["signature"]


def test_batch_signature_v_and_low_s(fx, fixture_key):
    signable = _signable(fx, "Batch", fx["batch"]["message"], models.BATCH_TYPES)
    signed = Account.sign_message(signable, private_key=fixture_key)
    assert signed.v == fx["batch"]["expected"]["v"]
    # OpenZeppelin's ECDSA rejects high-s signatures outright.
    assert signed.s < SECP256K1_N // 2


def test_recover_batch_signer(fx):
    signable = _signable(fx, "Batch", fx["batch"]["message"], models.BATCH_TYPES)
    recovered = Account.recover_message(
        signable, signature=bytes.fromhex(fx["batch"]["expected"]["signature"][2:])
    )
    assert recovered == fx["signer"]["address"]


def test_order_struct_hash_and_digest(fx):
    order = fx["order"]["message"]
    expected = fx["order"]["expected"]
    assert (
        "0x" + hash_eip712_message(models.ORDER_TYPES, order).hex()
        == expected["orderStructHash"]
    )
    digest = keccak(
        b"\x19\x01" + hash_domain(fx["domain"]) + hash_eip712_message(models.ORDER_TYPES, order)
    )
    assert "0x" + digest.hex() == expected["digest"]


def test_order_signature_byte_identical(fx, fixture_key):
    signable = _signable(fx, "Order", fx["order"]["message"], models.ORDER_TYPES)
    signed = Account.sign_message(signable, private_key=fixture_key)
    assert signed.signature.to_0x_hex() == fx["order"]["expected"]["signature"]


def test_unfiltered_types_raise(fx):
    """Locks the trap: docs/eip712.json has two unreferenced root types (Order and Batch), so
    passing the whole types dict makes eth_account's primary-type inference ambiguous."""
    with pytest.raises(ValueError, match="primary type"):
        encode_typed_data(fx["domain"], models.all_types(), fx["batch"]["message"])


def test_types_for_computes_transitive_closure():
    assert set(models.types_for("Batch")) == {"Batch", "Fill"}
    assert set(models.types_for("Order")) == {"Order"}
    assert set(models.types_for("Fill")) == {"Fill"}


def test_vendored_spec_matches_docs(repo_root):
    """The engine ships its own copy because the Docker build context is engine/. This test is
    the enforcement mechanism that keeps the copy honest."""
    docs = repo_root / "docs" / "eip712.json"
    vendored = repo_root / "engine" / "app" / "eip712.json"
    if not docs.is_file():
        pytest.skip("running outside the repo")
    assert vendored.read_bytes() == docs.read_bytes()
