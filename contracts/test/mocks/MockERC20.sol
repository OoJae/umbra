// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 with configurable decimals. The real tokens are both 6-decimal, so the 18/6 and
///         6/18 pairings in the decimals matrix are only reachable through this mock.
/// @dev Deliberately extends OpenZeppelin's ERC20 rather than hand-rolling one, so failure paths
///      produce the real IERC6093 errors (ERC20InsufficientAllowance / ERC20InsufficientBalance)
///      that a production token would.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
