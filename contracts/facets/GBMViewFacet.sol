// SPDX-License-Identifier: UNLICENSED
// © Copyright 2021. Patent pending. All rights reserved. Perpetual Altruism Ltd.
pragma solidity ^0.8.0;

import "../libraries/AppStorage.sol";
import "../libraries/LibDiamond.sol";

contract GBMViewFacet {
    AppStorage internal s;

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

    function getAllUnclaimedAuctions() public view returns (uint256[] memory) {
        uint256[] memory unclaimedAuctions = new uint256[](s.auctionNonce);
        uint256 unclaimedCount = 0;
        for (uint256 i = 0; i < s.auctionNonce; i++) {
            if (s.auctions[i].claimed == false) {
                unclaimedAuctions[unclaimedCount] = i;
                unclaimedCount++;
            }
        }

        assembly {
            mstore(unclaimedAuctions, unclaimedCount)
        }
        return unclaimedAuctions;
    }
}