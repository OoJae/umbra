// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {UmbraVault} from "../../src/UmbraVault.sol";

/// @notice Test harness that replaces the live FTSOv2 read with a settable one.
/// @dev ContractRegistry is a library whose `internal view` accessors inline a hardcoded address,
///      so vm.mockCall cannot intercept it — overriding `_readFeed` is the only clean seam.
///      The override stays non-view to mirror the production signature exactly; Solidity permits
///      an override to tighten mutability but not to loosen it, so the base MUST be non-view for
///      the production `payable` getFeedById to be callable.
contract UmbraVaultHarness is UmbraVault {
    uint256 public feedValue;
    int8 public feedDecimals;
    uint64 public feedTimestamp;
    bool public feedReverts;

    error MockOracleDown();

    constructor(address baseToken_, address quoteToken_, address teeRegistry_, address initialOwner)
        UmbraVault(baseToken_, quoteToken_, teeRegistry_, initialOwner)
    {
        feedValue = 1_000_000; // $1.000000
        feedDecimals = 6;
        feedTimestamp = uint64(block.timestamp);
    }

    function setFeed(uint256 value, int8 decimals_, uint64 timestamp) external {
        feedValue = value;
        feedDecimals = decimals_;
        feedTimestamp = timestamp;
    }

    function setFeedReverts(bool shouldRevert) external {
        feedReverts = shouldRevert;
    }

    function _readFeed() internal view override returns (uint256, int8, uint64) {
        if (feedReverts) revert MockOracleDown();
        return (feedValue, feedDecimals, feedTimestamp);
    }

    // ── expose internals for direct unit tests ──

    function exposedToPrice1e6(uint256 value, int8 decimals_) external pure returns (uint256) {
        return _toPrice1e6(value, decimals_);
    }

    function exposedHashBatch(Batch calldata b) external view returns (bytes32) {
        return _hashTypedDataV4(_hashBatch(b));
    }
}
