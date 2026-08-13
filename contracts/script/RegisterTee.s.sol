// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {TeeRegistry} from "../src/TeeRegistry.sol";
import {UmbraVault} from "../src/UmbraVault.sol";

/// @notice Anchors a freshly booted enclave's signer address and attestation hash on-chain.
/// @dev Re-runnable by design: enclaves are ephemeral and mint a new key on every boot, so
///      TeeRegistry.registerTeeSigner is deliberately owner-re-registrable. Reads everything from
///      the environment and never prints the deployer key.
contract RegisterTee is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddress = vm.envAddress("REGISTRY_ADDRESS");
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        address teeSigner = vm.envAddress("TEE_SIGNER_ADDRESS");
        bytes32 attestationHash = vm.envBytes32("TEE_ATTESTATION_HASH");
        string memory attestationURI = vm.envString("TEE_ATTESTATION_URI");

        require(block.chainid == 114, "RegisterTee: not Coston2");
        require(teeSigner != address(0), "RegisterTee: TEE_SIGNER_ADDRESS unset");
        require(attestationHash != bytes32(0), "RegisterTee: TEE_ATTESTATION_HASH unset");
        require(bytes(attestationURI).length > 0, "RegisterTee: TEE_ATTESTATION_URI unset");

        TeeRegistry registry = TeeRegistry(registryAddress);
        require(registry.owner() == vm.addr(pk), "RegisterTee: deployer does not own the registry");
        require(
            address(UmbraVault(vaultAddress).teeRegistry()) == registryAddress,
            "RegisterTee: vault is wired to a different registry"
        );

        address previous = registry.teeSigner();

        vm.startBroadcast(pk);
        registry.registerTeeSigner(teeSigner, attestationHash, attestationURI);
        vm.stopBroadcast();

        require(registry.teeSigner() == teeSigner, "RegisterTee: signer not stored");
        require(registry.attestationHash() == attestationHash, "RegisterTee: hash not stored");

        console2.log("previous signer   ", previous);
        console2.log("TEE_SIGNER_ADDRESS", teeSigner);
        console2.log("registrationCount ", registry.registrationCount());
    }
}
