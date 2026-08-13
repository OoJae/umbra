// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {UmbraVault} from "../../src/UmbraVault.sol";

/// @notice An independent re-implementation of the Umbra EIP-712 digest.
/// @dev Every type string here is retyped by hand from docs/eip712.json rather than imported from
///      UmbraVault. That is the whole point: if these constants were shared with the contract, the
///      digest tests would be tautologies that pass even when both sides are wrong together.
library Eip712Lib {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant FILL_TYPEHASH =
        keccak256("Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)");

    /// @dev encodeType: primary type first, then referenced types sorted alphabetically by name.
    bytes32 internal constant BATCH_TYPEHASH = keccak256(
        "Batch(uint256 batchId,uint256 clearingPrice1e6,uint64 oracleTs,Fill[] fills)"
        "Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)"
    );

    bytes32 internal constant ORDER_TYPEHASH = keccak256(
        "Order(address trader,uint8 side,uint256 amountBase,uint256 limitPrice1e6,uint256 nonce,uint256 deadline)"
    );

    function domainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("Umbra")), keccak256(bytes("1")), chainId, verifyingContract)
        );
    }

    function hashFill(UmbraVault.Fill memory f) internal pure returns (bytes32) {
        return keccak256(abi.encode(FILL_TYPEHASH, f.buyer, f.seller, f.amountBase, f.amountQuote));
    }

    /// @dev EIP-712 array encoding is keccak of the bare concatenation of the members' struct
    ///      hashes — no offset, no length prefix. encodePacked over bytes32[] is exactly that.
    function hashFills(UmbraVault.Fill[] memory fills) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](fills.length);
        for (uint256 i = 0; i < fills.length; ++i) {
            hashes[i] = hashFill(fills[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hashBatchStruct(UmbraVault.Batch memory b) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(BATCH_TYPEHASH, b.batchId, b.clearingPrice1e6, uint256(b.oracleTs), hashFills(b.fills))
            );
    }

    function hashOrderStruct(UmbraVault.Order memory o) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(ORDER_TYPEHASH, o.trader, uint256(o.side), o.amountBase, o.limitPrice1e6, o.nonce, o.deadline)
        );
    }

    function batchDigest(uint256 chainId, address verifyingContract, UmbraVault.Batch memory b)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparator(chainId, verifyingContract), hashBatchStruct(b));
    }

    function orderDigest(uint256 chainId, address verifyingContract, UmbraVault.Order memory o)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparator(chainId, verifyingContract), hashOrderStruct(o));
    }
}
