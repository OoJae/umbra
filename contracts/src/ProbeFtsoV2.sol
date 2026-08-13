// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";

/// @notice Phase-0 connectivity probe. Proves the periphery import paths compile and documents
/// the two FTSOv2 read flavours the vault must choose between. Not deployed beyond Phase 0.
contract ProbeFtsoV2 {
    bytes21 public constant XRP_USD = bytes21(0x015852502f55534400000000000000000000000000);
    bytes21 public constant FLR_USD = bytes21(0x01464c522f55534400000000000000000000000000);
    bytes21 public constant USDT_USD = bytes21(0x01555344542f555344000000000000000000000000);

    /// Production interface: `getFeedById` is payable and non-view, so it can only be called from
    /// a state-changing context. This is the flavour `UmbraVault.settleBatch` will use — a fee may
    /// apply to some feeds, but block-latency feeds are free, so it is called with zero value.
    function readProduction() external returns (uint256 value, int8 decimals, uint64 timestamp) {
        FtsoV2Interface ftsoV2 = ContractRegistry.getFtsoV2();
        return ftsoV2.getFeedById(XRP_USD);
    }

    /// Testnet interface: same data, declared `view`, so it is callable from off-chain `eth_call`
    /// and from view helpers. Useful for the frontend's live-price panel.
    function readTestView() external view returns (uint256 value, int8 decimals, uint64 timestamp) {
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        return ftsoV2.getFeedById(XRP_USD);
    }
}
