// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/AppStorage.sol";
import "../libraries/LibTokenSwap.sol";

/// @notice Minimal harness to exercise LibTokenSwap in tests.
/// @dev Stores AppStorage at slot 0 via Modifiers.s, matching LibTokenSwap.appStorage().
contract TokenSwapHarness is Modifiers {
    function setGHST(address ghst) external {
        s.GHST = ghst;
    }

    function swapForGHST(address tokenIn, uint256 swapAmount, uint256 minGhstOut, uint256 deadline, address recipient) external payable returns (uint256) {
        return LibTokenSwap.swapForGHST(tokenIn, swapAmount, minGhstOut, deadline, recipient);
    }
}

