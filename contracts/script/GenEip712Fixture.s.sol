// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {UmbraVault} from "../src/UmbraVault.sol";
import {Eip712Lib} from "../test/helpers/Eip712Lib.sol";

/// @notice Prints the cross-language EIP-712 test vector that docs/eip712-fixture.json records.
/// @dev The signing key is a PUBLIC test vector derived from a committed string, never a secret and
///      never funded: privateKey = keccak256(utf8("umbra.eip712.fixture.v1")). Python and viem
///      derive the identical key the same way, and because all three stacks use RFC 6979
///      deterministic nonces they must produce byte-identical signatures — which upgrades the
///      parity check from "same address recovered" to "same 65 bytes".
///      verifyingContract is a sentinel, deliberately not the live vault, so redeploying does not
///      stale the fixture.
contract GenEip712Fixture is Script {
    address internal constant SENTINEL_VAULT = 0x000000000000000000000000000000000000c0DE;
    uint256 internal constant CHAIN_ID = 114;

    address internal constant ALICE = 0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09;
    address internal constant BOB = 0x016fb6f97db4e99611F789Ae172d9DCA9593BE0b;

    function run() external pure {
        uint256 pk = uint256(keccak256(bytes("umbra.eip712.fixture.v1")));
        address signer = vm.addr(pk);

        // Two fills at $1.010002, amounts chosen so amountQuote is exact at 6/6 decimals.
        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](2);
        fills[0] = UmbraVault.Fill({buyer: ALICE, seller: BOB, amountBase: 2_500_000, amountQuote: 2_525_005});
        fills[1] = UmbraVault.Fill({buyer: ALICE, seller: BOB, amountBase: 1_000_000, amountQuote: 1_010_002});

        UmbraVault.Batch memory b =
            UmbraVault.Batch({batchId: 1, clearingPrice1e6: 1_010_002, oracleTs: 1_756_000_000, fills: fills});

        bytes32 ds = Eip712Lib.domainSeparator(CHAIN_ID, SENTINEL_VAULT);
        bytes32 f0 = Eip712Lib.hashFill(fills[0]);
        bytes32 f1 = Eip712Lib.hashFill(fills[1]);
        bytes32 fillsHash = Eip712Lib.hashFills(fills);
        bytes32 structHash = Eip712Lib.hashBatchStruct(b);
        bytes32 digest = Eip712Lib.batchDigest(CHAIN_ID, SENTINEL_VAULT, b);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        console2.log("signerAddress   %s", signer);
        console2.log("domainSeparator %s", vm.toString(ds));
        console2.log("fillStructHash0 %s", vm.toString(f0));
        console2.log("fillStructHash1 %s", vm.toString(f1));
        console2.log("fillsArrayHash  %s", vm.toString(fillsHash));
        console2.log("batchStructHash %s", vm.toString(structHash));
        console2.log("batchDigest     %s", vm.toString(digest));
        console2.log("signature       %s", vm.toString(abi.encodePacked(r, s, v)));
        console2.log("v               %s", vm.toString(uint256(v)));
        console2.log("r               %s", vm.toString(r));
        console2.log("s               %s", vm.toString(s));

        _printOrderVector(pk);
    }

    /// @dev Split out purely to keep the stack shallow.
    function _printOrderVector(uint256 pk) internal pure {
        // The Order vector, used by the engine and the browser but never on-chain.
        UmbraVault.Order memory o = UmbraVault.Order({
            trader: ALICE, side: 0, amountBase: 2_500_000, limitPrice1e6: 1_015_000, nonce: 1, deadline: 1_756_003_600
        });
        bytes32 orderStructHash = Eip712Lib.hashOrderStruct(o);
        bytes32 orderDigest = Eip712Lib.orderDigest(CHAIN_ID, SENTINEL_VAULT, o);
        (uint8 ov, bytes32 or_, bytes32 os) = vm.sign(pk, orderDigest);

        console2.log("orderStructHash %s", vm.toString(orderStructHash));
        console2.log("orderDigest     %s", vm.toString(orderDigest));
        console2.log("orderSignature  %s", vm.toString(abi.encodePacked(or_, os, ov)));
    }
}
