// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TeeRegistry — on-chain anchor for the attested Umbra TEE signer.
/// @notice Confidential Space enclaves are ephemeral: every boot mints a fresh secp256k1 key, so
///         registration is intentionally re-registrable by the owner. Immutability is not the
///         guarantee here — public detectability is. Every rotation emits TeeRegistered, so a
///         signer swap is permanently visible on-chain to anyone auditing the vault.
contract TeeRegistry is Ownable {
    /// @notice secp256k1 address of the key generated inside the enclave.
    address public teeSigner;
    /// @notice keccak256 of the attestation JWT that vouches for `teeSigner`.
    bytes32 public attestationHash;
    /// @notice Where the raw attestation JWT can be fetched and decoded.
    string public attestationURI;
    /// @notice block.timestamp of the current registration.
    uint64 public registeredAt;
    /// @notice How many times a signer has been registered. Surfaced on the Verify page.
    uint256 public registrationCount;

    error ZeroSigner();
    error RenounceDisabled();

    event TeeRegistered(
        address indexed teeSigner,
        bytes32 indexed attestationHash,
        address previousSigner,
        string attestationURI,
        uint256 registrationCount,
        uint64 registeredAt
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerTeeSigner(address signer_, bytes32 attestationHash_, string calldata attestationURI_)
        external
        onlyOwner
    {
        if (signer_ == address(0)) revert ZeroSigner();

        address previous = teeSigner;
        teeSigner = signer_;
        attestationHash = attestationHash_;
        attestationURI = attestationURI_;
        registeredAt = uint64(block.timestamp);
        unchecked {
            registrationCount += 1;
        }

        emit TeeRegistered(signer_, attestationHash_, previous, attestationURI_, registrationCount, registeredAt);
    }

    /// @notice Everything the Verify page needs, in one call.
    function attestation()
        external
        view
        returns (address signer_, bytes32 hash_, string memory uri_, uint64 at_, uint256 count_)
    {
        return (teeSigner, attestationHash, attestationURI, registeredAt, registrationCount);
    }

    /// @notice Permanently disabled. Renouncing would freeze signer rotation forever, bricking
    ///         settlement the moment the enclave restarts — and it would buy no real
    ///         trustlessness, since on-chain JWT verification is not implemented.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
