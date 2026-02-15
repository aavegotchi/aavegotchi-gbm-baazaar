// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

/// @notice Minimal zRouter mock used for LibTokenSwap/GBM swap tests.
/// @dev Treats `amountLimit` as the output amount to send to `to`.
contract MockZRouter {
    function swapAero(
        address to,
        bool /* stable */,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 /* deadline */
    ) external payable returns (uint256 amountIn, uint256 amountOut) {
        return _swap(to, tokenIn, tokenOut, swapAmount, amountLimit);
    }

    function swapAeroCL(
        address to,
        bool /* exactOut */,
        int24 /* tickSpacing */,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 /* deadline */
    ) external payable returns (uint256 amountIn, uint256 amountOut) {
        return _swap(to, tokenIn, tokenOut, swapAmount, amountLimit);
    }

    function swapV2(
        address to,
        bool /* exactOut */,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 /* deadline */
    ) external payable returns (uint256 amountIn, uint256 amountOut) {
        return _swap(to, tokenIn, tokenOut, swapAmount, amountLimit);
    }

    function _swap(address to, address tokenIn, address tokenOut, uint256 swapAmount, uint256 amountOut) private returns (uint256, uint256) {
        if (tokenIn == address(0)) {
            require(msg.value == swapAmount, "MockZRouter: bad msg.value");
        } else {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), swapAmount);
        }

        IERC20(tokenOut).transfer(to, amountOut);
        return (swapAmount, amountOut);
    }
}
