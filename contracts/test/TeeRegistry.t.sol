// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {TeeRegistry} from "../src/TeeRegistry.sol";

contract TeeRegistryTest is Test {
    TeeRegistry internal registry;

    address internal owner = address(0xA11CE);
    address internal attacker = address(0xBAD);
    address internal signerA = address(0x51611);
    address internal signerB = address(0x51612);

    event TeeRegistered(
        address indexed teeSigner,
        bytes32 indexed attestationHash,
        address previousSigner,
        string attestationURI,
        uint256 registrationCount,
        uint64 registeredAt
    );

    function setUp() public {
        registry = new TeeRegistry(owner);
    }

    function test_Constructor_SetsInitialOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_Constructor_RevertWhen_ZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new TeeRegistry(address(0));
    }

    function test_TeeSigner_IsZeroBeforeRegistration() public view {
        assertEq(registry.teeSigner(), address(0));
        assertEq(registry.registrationCount(), 0);
    }

    function test_RegisterTeeSigner_StoresAllFields() public {
        vm.prank(owner);
        registry.registerTeeSigner(signerA, keccak256("jwt-a"), "https://example.test/a");

        assertEq(registry.teeSigner(), signerA);
        assertEq(registry.attestationHash(), keccak256("jwt-a"));
        assertEq(registry.attestationURI(), "https://example.test/a");
        assertEq(registry.registrationCount(), 1);
        assertEq(registry.registeredAt(), uint64(block.timestamp));
    }

    function test_RegisterTeeSigner_EmitsTeeRegistered() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit TeeRegistered(
            signerA, keccak256("jwt-a"), address(0), "https://example.test/a", 1, uint64(block.timestamp)
        );

        vm.prank(owner);
        registry.registerTeeSigner(signerA, keccak256("jwt-a"), "https://example.test/a");
    }

    function test_RegisterTeeSigner_RevertWhen_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        registry.registerTeeSigner(signerA, bytes32(0), "");
    }

    function test_RegisterTeeSigner_RevertWhen_ZeroSigner() public {
        vm.prank(owner);
        vm.expectRevert(TeeRegistry.ZeroSigner.selector);
        registry.registerTeeSigner(address(0), bytes32(0), "");
    }

    /// Enclaves are ephemeral: every Confidential Space boot mints a fresh key, so overwriting an
    /// existing registration is required behaviour, not a bug.
    function test_RegisterTeeSigner_IsReRegistrable() public {
        vm.startPrank(owner);
        registry.registerTeeSigner(signerA, keccak256("jwt-a"), "uri-a");
        registry.registerTeeSigner(signerB, keccak256("jwt-b"), "uri-b");
        vm.stopPrank();

        assertEq(registry.teeSigner(), signerB);
        assertEq(registry.attestationHash(), keccak256("jwt-b"));
        assertEq(registry.attestationURI(), "uri-b");
        assertEq(registry.registrationCount(), 2);
    }

    function test_RegisterTeeSigner_RotationEmitsPreviousSigner() public {
        vm.prank(owner);
        registry.registerTeeSigner(signerA, keccak256("jwt-a"), "uri-a");

        vm.expectEmit(true, true, false, true, address(registry));
        emit TeeRegistered(signerB, keccak256("jwt-b"), signerA, "uri-b", 2, uint64(block.timestamp));

        vm.prank(owner);
        registry.registerTeeSigner(signerB, keccak256("jwt-b"), "uri-b");
    }

    /// Renouncing would freeze signer rotation forever and brick settlement on the next enclave
    /// restart, so it is deliberately disabled.
    function test_RenounceOwnership_AlwaysReverts() public {
        vm.prank(owner);
        vm.expectRevert(TeeRegistry.RenounceDisabled.selector);
        registry.renounceOwnership();

        assertEq(registry.owner(), owner);
    }

    function test_Attestation_ReturnsBundle() public {
        vm.prank(owner);
        registry.registerTeeSigner(signerA, keccak256("jwt-a"), "uri-a");

        (address s, bytes32 h, string memory uri, uint64 at, uint256 count) = registry.attestation();
        assertEq(s, signerA);
        assertEq(h, keccak256("jwt-a"));
        assertEq(uri, "uri-a");
        assertEq(at, uint64(block.timestamp));
        assertEq(count, 1);
    }

    function test_TransferOwnership_RevertWhen_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        registry.transferOwnership(attacker);
    }
}
