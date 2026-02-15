// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AppStorage} from "./AppStorage.sol";
import {IERC20} from "../interfaces/IERC20.sol";

// zRouter interface for multi-AMM routing on Base
interface IZRouter {
    function swapAero(
        address to,
        bool stable,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function swapAeroCL(
        address to,
        bool exactOut,
        int24 tickSpacing,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);

    function swapV2(
        address to,
        bool exactOut,
        address tokenIn,
        address tokenOut,
        uint256 swapAmount,
        uint256 amountLimit,
        uint256 deadline
    ) external payable returns (uint256 amountIn, uint256 amountOut);
}

library LibTokenSwap {
    // zRouter multi-AMM aggregator on Base network
    address public constant ROUTER = address(0x0000000000404FECAf36E6184245475eE1254835);

    // WETH address on Base (from zRouter contract)
    address public constant WETH = address(0x4200000000000000000000000000000000000006);

    // USDC address on Base mainnet
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    event TokenSwapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed recipient);

    /**
     * @notice Swap tokens for GHST using zRouter with fallback strategy
     * @dev Try Aerodrome first, fallback to V2 if needed
     * @param tokenIn Address of input token (address(0) for ETH, token address for ERC20)
     * @param swapAmount Amount of tokenIn to swap
     * @param minGhstOut Minimum GHST to receive (slippage protection)
     * @param deadline Deadline for the swap
     * @param recipient Address to receive the GHST
     * @return amountOut Amount of GHST received
     */
    function swapForGHST(
        address tokenIn,
        uint256 swapAmount,
        uint256 minGhstOut,
        uint256 deadline,
        address recipient
    ) internal returns (uint256 amountOut) {
        require(swapAmount > 0, "LibTokenSwap: swapAmount must be > 0");
        require(deadline >= block.timestamp, "LibTokenSwap: deadline expired");
        require(ROUTER != address(0), "LibTokenSwap: Router address is zero");

        AppStorage storage s = appStorage();

        // Handle token transfers in separate scope to reduce stack depth
        _handleTokenTransfer(tokenIn, swapAmount);

        // Execute swap with fallback

        //CL swap for USDC
        if (tokenIn == USDC) {
            amountOut = _executeSwapCL(tokenIn, swapAmount, minGhstOut, deadline, recipient, s.GHST);
        }
        //normal swap for everything else
        else {
            amountOut = _executeSwap(tokenIn, swapAmount, minGhstOut, deadline, recipient, s.GHST);
        }

        // Clear any leftover allowance to reduce risk if the router doesn't spend the full approved amount.
        _resetRouterAllowance(tokenIn);

        emit TokenSwapped(tokenIn, s.GHST, swapAmount, amountOut, recipient);
    }

    function _handleTokenTransfer(address tokenIn, uint256 swapAmount) private {
        if (tokenIn != address(0)) {
            // For ERC20, transfer tokens from sender to this contract first
            IERC20 erc20 = IERC20(tokenIn);
            uint256 balBefore = erc20.balanceOf(address(this));
            _safeTransferFrom(erc20, msg.sender, address(this), swapAmount);
            uint256 balAfter = erc20.balanceOf(address(this));
            // Verify we received *exactly* swapAmount, preventing draining any pre-existing contract balance.
            require(balAfter >= balBefore, "LibTokenSwap: Token transfer failed");
            require(balAfter - balBefore == swapAmount, "LibTokenSwap: Token transfer failed");
            // Approve zRouter to spend our tokens; some tokens require setting to 0 before updating
            uint256 currentAllowance = erc20.allowance(address(this), ROUTER);
            if (currentAllowance < swapAmount) {
                if (currentAllowance > 0) {
                    _safeApprove(erc20, ROUTER, 0);
                }
                _safeApprove(erc20, ROUTER, swapAmount);
            }
        }
    }

    function _resetRouterAllowance(address tokenIn) private {
        if (tokenIn == address(0)) return;
        IERC20 erc20 = IERC20(tokenIn);
        uint256 allowance_ = erc20.allowance(address(this), ROUTER);
        if (allowance_ > 0) {
            _safeApprove(erc20, ROUTER, 0);
        }
    }

    function _executeSwap(
        address tokenIn,
        uint256 swapAmount,
        uint256 calculatedMinOut,
        uint256 deadline,
        address recipient,
        address ghstContract
    ) private returns (uint256 amountOut) {
        IZRouter router = IZRouter(ROUTER);

        try
            router.swapAero{value: tokenIn == address(0) ? swapAmount : 0}(
                recipient,
                false, // volatile pair
                tokenIn,
                ghstContract,
                swapAmount,
                calculatedMinOut,
                deadline
            )
        returns (uint256, uint256 amountOut_) {
            require(amountOut_ >= calculatedMinOut, "LibTokenSwap: Insufficient output amount");
            return amountOut_;
        } catch {
            // Fallback to V2 if Aerodrome fails
            (, amountOut) = router.swapV2{value: tokenIn == address(0) ? swapAmount : 0}(
                recipient,
                false, // exactIn
                tokenIn,
                ghstContract,
                swapAmount,
                calculatedMinOut,
                deadline
            );
            require(amountOut >= calculatedMinOut, "LibTokenSwap: Insufficient output amount");
        }
    }

    function _executeSwapCL(
        address tokenIn,
        uint256 swapAmount,
        uint256 calculatedMinOut,
        uint256 deadline,
        address recipient,
        address ghstContract
    ) private returns (uint256 amountOut) {
        IZRouter router = IZRouter(ROUTER);

        try
            router.swapAeroCL{value: tokenIn == address(0) ? swapAmount : 0}(
                recipient,
                false,
                int24(2000),
                tokenIn,
                ghstContract,
                swapAmount,
                calculatedMinOut,
                deadline
            )
        returns (uint256, uint256 amountOut_) {
            require(amountOut_ >= calculatedMinOut, "LibTokenSwap: Insufficient output amount");
            return amountOut_;
        } catch {
            // Fallback to V2 if Aerodrome fails
            (, amountOut) = router.swapV2{value: tokenIn == address(0) ? swapAmount : 0}(
                recipient,
                false, // exactIn
                tokenIn,
                ghstContract,
                swapAmount,
                calculatedMinOut,
                deadline
            );
            require(amountOut >= calculatedMinOut, "LibTokenSwap: Insufficient output amount");
        }
    }

    /**
     * @notice Validate swap parameters
     * @param tokenIn Address of input token
     * @param swapAmount Amount to swap
     * @param minGhstOut Minimum GHST expected
     * @param deadline Swap deadline
     */
    function validateSwapParams(address tokenIn, uint256 swapAmount, uint256 minGhstOut, uint256 deadline) internal view {
        require(swapAmount > 0, "LibTokenSwap: swapAmount must be > 0");
        require(minGhstOut > 0, "LibTokenSwap: minGhstOut must be > 0");
        require(deadline >= block.timestamp, "LibTokenSwap: deadline expired");

        // Enhanced deadline validation - prevent indefinite orders (max 24 hours)
        require(deadline <= block.timestamp + 86400, "LibTokenSwap: deadline too far in future");

        // Validate ETH amount matches if ETH swap
        if (tokenIn == address(0)) {
            require(msg.value == swapAmount, "LibTokenSwap: ETH amount mismatch");
        } else {
            require(msg.value == 0, "LibTokenSwap: unexpected ETH sent");
        }
    }

    /**
     * @notice Refund excess GHST to recipient
     * @param recipient Address to receive excess GHST
     * @param ghstReceived GHST received from the swap
     * @param ghstNeeded GHST needed for the swap
     */
    function refundExcessGHST(address recipient, uint256 ghstReceived, uint256 ghstNeeded) internal {
        AppStorage storage s = appStorage();

        if (ghstReceived > ghstNeeded) {
            uint256 excess = ghstReceived - ghstNeeded;
            _safeTransfer(IERC20(s.GHST), recipient, excess);
        }
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 value) private {
        (bool success, bytes memory returndata) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value)
        );
        require(success && (returndata.length == 0 || abi.decode(returndata, (bool))), "LibTokenSwap: transferFrom failed");
    }

    function _safeTransfer(IERC20 token, address to, uint256 value) private {
        (bool success, bytes memory returndata) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (returndata.length == 0 || abi.decode(returndata, (bool))), "LibTokenSwap: transfer failed");
    }

    function _safeApprove(IERC20 token, address spender, uint256 value) private {
        (bool success, bytes memory returndata) = address(token).call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, value)
        );
        require(success && (returndata.length == 0 || abi.decode(returndata, (bool))), "LibTokenSwap: approve failed");
    }

    function appStorage() internal pure returns (AppStorage storage a) {
        assembly {
            a.slot := 0
        }
    }
}
