// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";
import "../interfaces/IERC721TokenReceiver.sol";

/// @notice ERC20 that attempts to re-enter GBMFacet.buyNow() during transferFrom.
/// @dev Used to test swapAndCommitBid reentrancy hardening.
contract ReentrantBuyNowERC20 is IERC20, IERC721TokenReceiver {
    string public name = "ReentrantBuyNowERC20";
    string public symbol = "RBN";
    uint8 public decimals = 18;

    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) private _allowance;

    address public gbm;
    uint256 public auctionId;
    address public triggerFrom;

    bool public attemptedBuyNow;
    bool public buyNowCallOk;

    function configure(address _gbm, uint256 _auctionId, address _triggerFrom) external {
        gbm = _gbm;
        auctionId = _auctionId;
        triggerFrom = _triggerFrom;
    }

    function approveGhst(address ghst, address spender, uint256 amount) external {
        IERC20(ghst).approve(spender, amount);
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowance[owner][spender];
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        _allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external override returns (bool) {
        require(balanceOf[msg.sender] >= value, "RBN: insufficient");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external override returns (bool) {
        require(balanceOf[from] >= value, "RBN: insufficient");

        if (msg.sender != from) {
            uint256 allowed = _allowance[from][msg.sender];
            require(allowed >= value, "RBN: allowance");
            _allowance[from][msg.sender] = allowed - value;
        }

        // Attempt reentrancy only on the initial GBMFacet -> token transferFrom call.
        if (!attemptedBuyNow && msg.sender == gbm && from == triggerFrom && to == gbm) {
            attemptedBuyNow = true;
            (buyNowCallOk, ) = gbm.call(abi.encodeWithSignature("buyNow(uint256)", auctionId));
        }

        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        totalSupply += value;
        emit Transfer(address(0), to, value);
    }

    function onERC721Received(
        address /* _operator */,
        address /* _from */,
        uint256 /* _tokenId */,
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }
}

