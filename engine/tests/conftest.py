import json
from pathlib import Path

import pytest
from eth_utils import keccak


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def spec_json(repo_root):
    return json.loads((repo_root / "docs" / "eip712.json").read_text())


@pytest.fixture(scope="session")
def fx(repo_root):
    return json.loads((repo_root / "docs" / "eip712-fixture.json").read_text())


@pytest.fixture(scope="session")
def fixture_key(fx) -> bytes:
    """PUBLIC test vector, holds no funds on any network. Matches the Solidity derivation
    uint256(keccak256(bytes('umbra.eip712.fixture.v1')))."""
    return keccak(text=fx["signer"]["derivation"])
