// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.0;

interface Ownable {
    function ownerOf(uint256 _tokenId) external returns (address);
}
