// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibMeta} from "../libraries/LibMeta.sol";
import {Modifiers, Whitelist} from "../libraries/AppStorage.sol";
import {LibWhitelist} from "../libraries/LibWhitelist.sol";

contract WhitelistFacet is Modifiers {
    event WhitelistCreated(uint256 indexed whitelistId);
    event WhitelistUpdated(uint256 indexed whitelistId);
    event WhitelistOwnershipTransferred(uint256 indexed whitelistId, address indexed newOwner);

    function createWhitelist(string calldata _name, address[] calldata _whitelistAddresses) external {
        if (_whitelistAddresses.length == 0) revert("Non-elemented address array");
        if (bytes(_name).length == 0) revert("Blank Name Not Allowed");
        uint256 whitelistId = LibWhitelist._getNewWhitelistId();

        Whitelist storage w = s.whitelists[whitelistId];
        w.owner = LibMeta.msgSender();
        w.name = _name;
        //use conventional push to prevent duplicates
        LibWhitelist._addAddressesToWhitelist(whitelistId, _whitelistAddresses);
        s.nextWhitelistId++;
        emit WhitelistCreated(whitelistId);
    }

    function updateWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) external {
        if (_whitelistAddresses.length == 0) revert("Non-elemented address array");
        LibWhitelist._whitelistExists(_whitelistId);
        LibWhitelist._checkWhitelistOwner(_whitelistId);

        LibWhitelist._addAddressesToWhitelist(_whitelistId, _whitelistAddresses);

        emit WhitelistUpdated(_whitelistId);
    }

    function removeAddressesFromWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) external {
        if (_whitelistAddresses.length == 0) revert("Non-elemented address array");
        LibWhitelist._whitelistExists(_whitelistId);
        LibWhitelist._checkWhitelistOwner(_whitelistId);
        LibWhitelist._removeAddressesFromWhitelist(_whitelistId, _whitelistAddresses);

        emit WhitelistUpdated(_whitelistId);
    }

    function transferOwnershipOfWhitelist(uint256 _whitelistId, address _whitelistOwner) external {
        LibWhitelist._whitelistExists(_whitelistId);
        LibWhitelist._checkWhitelistOwner(_whitelistId);
        Whitelist storage whitelist = LibWhitelist._getWhitelistFromWhitelistId(_whitelistId);
        whitelist.owner = _whitelistOwner;
        emit WhitelistOwnershipTransferred(_whitelistId, _whitelistOwner);
    }

    function whitelistExists(uint256 whitelistId) external view returns (bool exists) {
        exists = whitelistId >= s.nextWhitelistId || whitelistId == 0 ? false : true;
    }

    function isWhitelisted(uint256 _whitelistId, address _whitelistAddress) external view returns (bool) {
        return LibWhitelist._isWhitelisted(_whitelistId, _whitelistAddress);
    }

    function getWhitelistsLength() external view returns (uint256 total_) {
        total_ = s.nextWhitelistId - 1;
    }

    function getWhitelist(uint256 _whitelistId) external view returns (Whitelist memory) {
        LibWhitelist._whitelistExists(_whitelistId);
        return LibWhitelist._getWhitelistFromWhitelistId(_whitelistId);
    }

    function whitelistOwner(uint256 _whitelistId) external view returns (address) {
        LibWhitelist._whitelistExists(_whitelistId);
        return LibWhitelist._getWhitelistFromWhitelistId(_whitelistId).owner;
    }

    function setStartingId() public onlyOwner {
        if (s.nextWhitelistId == 0) {
            s.nextWhitelistId = 1;
        }
    }
}
