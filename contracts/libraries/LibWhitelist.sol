// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibMeta} from "../libraries/LibMeta.sol";
import {AppStorage, Whitelist, LibAppStorage} from "../libraries/AppStorage.sol";

library LibWhitelist {
    function _getNewWhitelistId() internal view returns (uint256 whitelistId) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        //0 is reserved
        whitelistId = s.nextWhitelistId;
    }

    function _whitelistExists(uint256 whitelistId) internal view {
        AppStorage storage s = LibAppStorage.diamondStorage();
        if (whitelistId >= s.nextWhitelistId + 1 || whitelistId == 0) revert("NonExistentWhitelist");
    }

    function _getWhitelistFromWhitelistId(uint256 _whitelistId) internal view returns (Whitelist storage whitelist) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        _whitelistExists(_whitelistId);
        whitelist = s.whitelists[_whitelistId];
    }

    function _checkWhitelistOwner(uint256 whitelistId) internal view {
        Whitelist storage whitelist = _getWhitelistFromWhitelistId(whitelistId);
        if (LibMeta.msgSender() != whitelist.owner) revert("NotWhitelistowner");
    }

    function _addAddressToWhitelist(uint256 _whitelistId, address _whitelistAddress) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        if (!s.whitelisted[_whitelistId][_whitelistAddress]) {
            Whitelist storage whitelist = _getWhitelistFromWhitelistId(_whitelistId);
            whitelist.addresses.push(_whitelistAddress);
            s.whitelisted[_whitelistId][_whitelistAddress] = true;
        }
    }

    function _removeAddressFromWhitelist(uint256 _whitelistId, address _whitelistAddress) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        if (s.whitelisted[_whitelistId][_whitelistAddress]) {
            _removeAddress(s.whitelists[_whitelistId].addresses, _whitelistAddress);
            s.whitelisted[_whitelistId][_whitelistAddress] = false;
        }
    }

    function _addAddressesToWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) internal {
        for (uint256 i; i < _whitelistAddresses.length; i++) {
            _addAddressToWhitelist(_whitelistId, _whitelistAddresses[i]);
        }
    }

    function _removeAddressesFromWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) internal {
        for (uint256 i; i < _whitelistAddresses.length; i++) {
            _removeAddressFromWhitelist(_whitelistId, _whitelistAddresses[i]);
        }
    }

    function _isWhitelisted(uint256 _whitelistId, address _whitelistAddress) internal view returns (bool) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        return s.whitelisted[_whitelistId][_whitelistAddress];
    }

    function findAddIndex(address _item, address[] memory addressArray) internal pure returns (uint256 i) {
        for (i; i < addressArray.length; i++) {
            //using the conventional method since we cannot have duplicate addresses
            if (addressArray[i] == _item) {
                return i;
            }
        }
    }

    function _removeAddress(address[] storage _array, address _add) internal {
        if (_array.length < 1) revert("Non-elemented address array");
        uint256 index = findAddIndex(_add, _array);
        if (_array.length == 1) {
            _array.pop();
        }

        if (_array.length > 1) {
            for (uint256 i = index; i < _array.length - 1; i++) {
                _array[i] = _array[i + 1];
            }
            _array.pop();
        }
    }
}
