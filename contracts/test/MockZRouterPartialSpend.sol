// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

/// @notice zRouter mock that intentionally spends less than `swapAmount` to simulate routers that
///         don't consume the full approved allowance.
contract MockZRouterPartialSpend {
    function swapAero(
        address to,
        bool /* stable */,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 /* deadline */
    ) external payable returns (uint256 amountIn, uint256 amountOut) {
        return _swapPartial(to, tokenIn, tokenOut, swapAmount, amountLimit);
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
        return _swapPartial(to, tokenIn, tokenOut, swapAmount, amountLimit);
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
        return _swapPartial(to, tokenIn, tokenOut, swapAmount, amountLimit);
    }

    function _swapPartial(address to, address tokenIn, address tokenOut, uint256 swapAmount, uint256 amountOut) private returns (uint256, uint256) {
        uint256 spent = swapAmount / 2;
        if (spent == 0) spent = 1;

        if (tokenIn == address(0)) {
            require(msg.value == swapAmount, "MockZRouterPartial: bad msg.value");
        } else {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), spent);
        }

        IERC20(tokenOut).transfer(to, amountOut);
        return (spent, amountOut);
    }
}

