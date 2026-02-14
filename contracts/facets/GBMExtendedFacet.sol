// SPDX-License-Identifier: UNLICENSED
// © Copyright 2021. Patent pending. All rights reserved. Perpetual Altruism Ltd.
pragma solidity ^0.8.0;
import "../interfaces/IGBM.sol";
import "../interfaces/IGBMInitiator.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IERC721TokenReceiver.sol";
import "../interfaces/IERC1155.sol";
import "../interfaces/IERC1155TokenReceiver.sol";
import "../interfaces/Ownable.sol";
import "../libraries/AppStorage.sol";
import "../libraries/LibDiamond.sol";

import "../interfaces/IERC2981.sol";
import "../interfaces/IMultiRoyalty.sol";

import "../libraries/LibTokenSwap.sol";

contract GBMExtendedFacet is IGBM, IERC1155TokenReceiver, IERC721TokenReceiver, Modifiers {
    function onERC721Received(
        address /* _operator */,
        address /*  _from */,
        uint256 /*  _tokenId */,
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    function onERC1155Received(
        address /* _operator */,
        address /* _from */,
        uint256 /* _id */,
        uint256 /* _value */,
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(
        address /* _operator */,
        address /* _from */,
        uint256[] calldata /* _ids */,
        uint256[] calldata /* _values */,
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }

    function getAuctionPresets(uint256 _auctionPresetID) public view returns (Preset memory presets_) {
        presets_ = s.auctionPresets[_auctionPresetID];
    }

    function getAuctionInfo(uint256 _auctionID) external view returns (Auction memory auctionInfo_) {
        auctionInfo_ = s.auctions[_auctionID];
    }

    function getAuctionHighestBidder(uint256 _auctionID) external view returns (address) {
        return s.auctions[_auctionID].highestBidder;
    }

    function getAuctionHighestBid(uint256 _auctionID) external view returns (uint256) {
        return s.auctions[_auctionID].highestBid;
    }

    function getAuctionDebt(uint256 _auctionID) external view returns (uint256) {
        return s.auctions[_auctionID].auctionDebt;
    }

    function getAuctionDueIncentives(uint256 _auctionID) external view returns (uint256) {
        return s.auctions[_auctionID].dueIncentives;
    }

    function getTokenKind(uint256 _auctionID) external view returns (bytes4) {
        return s.auctions[_auctionID].info.tokenKind;
    }

    function getTokenId(uint256 _auctionID) external view returns (uint256) {
        return s.auctions[_auctionID].info.tokenID;
    }

    function getContractAddress(uint256 _auctionID) external view returns (address) {
        return s.auctions[_auctionID].tokenContract;
    }

    function getAuctionStartTime(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].info.startTime;
    }

    function getAuctionEndTime(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].info.endTime;
    }

    function getAuctionHammerTimeDuration() public view returns (uint256) {
        return s.hammerTimeDuration;
    }

    function getAuctionBidDecimals(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.bidDecimals;
    }

    function getAuctionStepMin(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.stepMin;
    }

    function getAuctionIncMin(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.incMin;
    }

    function getAuctionIncMax(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.incMax;
    }

    function getAuctionBidMultiplier(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.bidMultiplier;
    }

    function getBuyItNowInvalidationThreshold() external view returns (uint256) {
        return s.buyItNowInvalidationThreshold;
    }

    function isBiddingAllowed(address _contract) public view returns (bool) {
        return s.contractBiddingAllowed[_contract];
    }

    /// @notice Register parameters of auction to be used as presets
    /// Throw if the token owner is not the GBM smart contract
    function setAuctionPresets(uint256 _auctionPresetID, Preset calldata _preset) external onlyOwner {
        s.auctionPresets[_auctionPresetID] = _preset;
    }

    function setPubkey(bytes calldata _newPubkey) external onlyOwner {
        s.backendPubKey = _newPubkey;
    }

    function setAddresses(address _pixelcraft, address _dao, address _gbm, address _rarityFarming) external onlyOwner {
        s.pixelcraft = _pixelcraft;
        s.DAO = _dao;
        s.GBMAddress = _gbm;
        s.rarityFarming = _rarityFarming;
    }

    function toggleDiamondPause(bool _pause) external onlyOwner {
        s.diamondPaused = _pause;
    }

    /// @notice Allow/disallow bidding and claiming for a whole token contract address.
    /// @param _contract The token contract the auctionned token belong to
    /// @param _value True if bidding/claiming should be allowed.
    function setBiddingAllowed(address _contract, bool _value) external onlyOwner {
        s.contractBiddingAllowed[_contract] = _value;
        emit Contract_BiddingAllowed(_contract, _value);
    }

    /// @notice Allow/disallow auction creation for a whole token contract address.
    /// @param _tokenContract The token contract to allow/disallow auction creations for
    /// @param _allowed True if auctions can be created for the token, False if otherwise.
    function toggleContractWhitelist(address _tokenContract, bool _allowed) external onlyOwner {
        if (_allowed) {
            if (s.contractAllowed[_tokenContract]) revert("ContractEnabledAlready");
            s.contractAllowed[_tokenContract] = _allowed;
        } else {
            if (!s.contractAllowed[_tokenContract]) revert("ContractDisabledAlready");
            s.contractAllowed[_tokenContract] = _allowed;
        }
    }
}
