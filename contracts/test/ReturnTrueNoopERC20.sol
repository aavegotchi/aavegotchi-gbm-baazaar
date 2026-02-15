// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

/// @notice ERC20 that can be configured to return `true` from `transferFrom` without moving funds
///         for a specific `from` address. Used to test LibTokenSwap balance-delta checks.
contract ReturnTrueNoopERC20 is IERC20 {
    string public name = "ReturnTrueNoopERC20";
    string public symbol = "NOOP";
    uint8 public decimals = 18;

    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) private _allowance;

    address public noopFrom;

    function setNoopFrom(address from) external {
        noopFrom = from;
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
        require(balanceOf[msg.sender] >= value, "NOOP: insufficient");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external override returns (bool) {
        require(balanceOf[from] >= value, "NOOP: insufficient");

        if (msg.sender != from) {
            uint256 allowed = _allowance[from][msg.sender];
            require(allowed >= value, "NOOP: allowance");
            _allowance[from][msg.sender] = allowed - value;
        }

        if (from == noopFrom) {
            // Claim success, but do not move funds.
            emit Transfer(from, to, value);
            return true;
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
}

