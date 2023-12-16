// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;
import {LibMeta} from "../libraries/LibMeta.sol";
import {AppStorage, Whitelist, LibAppStorage} from "../libraries/AppStorage.sol";
import {LibWhitelist} from "../libraries/LibWhitelist.sol";

library LibModifiers {
    //auction modifiers
    //0 - no modifier
    //1 - gotchiverse-only bidding
    //2 - whitelist-only bidding
    //3 - gotchiverse + whitelist bidding

    function _assertModifiers(
        uint8 _modifierType,
        uint256 _modifierId,
        bool _inGame
    ) internal view {
        if (_modifierType > 0) {
            if (_modifierType == 1) {
                _assertInGame(_inGame);
            }
            if (_modifierType == 2) {
                _assertWhitelist(_modifierId);
            }
            if (_modifierType == 3) {
                _assertInGame(_inGame);
                _assertWhitelist(_modifierId);
            }

            //more modifier types can be added here
        }
    }

    function _assertInGame(bool _inGame) internal pure {
        if (!_inGame) revert("Must be in-game to bid");
    }

    function _assertWhitelist(uint256 _whitelistId) internal view {
        if (_whitelistId < 1) revert("Whitelist id must be greater than 0");
        //get current bidder
        address bidder = LibMeta.msgSender();
        if (!LibWhitelist._isWhitelisted(_whitelistId, bidder)) revert("NotWhitelisted");
    }
}
