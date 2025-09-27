// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IGBM.sol";
import "./AppStorage.sol";

library LibGBM {
    function appStorage() internal pure returns (AppStorage storage a) {
        assembly {
            a.slot := 0
        }
    }

    function getAuctionPresets(uint256 _auctionPresetID) internal view returns (Preset memory presets_) {
        presets_ = appStorage().auctionPresets[_auctionPresetID];
    }

    function getAuctionInfo(uint256 _auctionID) internal view returns (Auction memory auctionInfo_) {
        auctionInfo_ = appStorage().auctions[_auctionID];
    }

    function getAuctionHighestBidder(uint256 _auctionID) internal view returns (address) {
        return appStorage().auctions[_auctionID].highestBidder;
    }

    function getAuctionHighestBid(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].highestBid;
    }

    function getAuctionDebt(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].auctionDebt;
    }

    function getAuctionDueIncentives(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].dueIncentives;
    }

    function getTokenKind(uint256 _auctionID) internal view returns (bytes4) {
        return appStorage().auctions[_auctionID].info.tokenKind;
    }

    function getTokenId(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].info.tokenID;
    }

    function getContractAddress(uint256 _auctionID) internal view returns (address) {
        return appStorage().auctions[_auctionID].tokenContract;
    }

    function getAuctionStartTime(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].info.startTime;
    }

    function getAuctionEndTime(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].info.endTime;
    }

    function getAuctionHammerTimeDuration() internal view returns (uint256) {
        return appStorage().hammerTimeDuration;
    }

    function getAuctionBidDecimals(uint256 _auctionID) internal view returns (uint256) {
        return appStorage().auctions[_auctionID].presets.bidDecimals;
    }

    function getAuctionStepMin(uint256 _auctionID) internal view returns (uint64) {
        return appStorage().auctions[_auctionID].presets.stepMin;
    }

    function getAuctionIncMin(uint256 _auctionID) internal view returns (uint64) {
        return appStorage().auctions[_auctionID].presets.incMin;
    }

    function getAuctionIncMax(uint256 _auctionID) internal view returns (uint64) {
        return appStorage().auctions[_auctionID].presets.incMax;
    }

    function getAuctionBidMultiplier(uint256 _auctionID) internal view returns (uint64) {
        return appStorage().auctions[_auctionID].presets.bidMultiplier;
    }

    function getBuyItNowInvalidationThreshold() internal view returns (uint256) {
        return appStorage().buyItNowInvalidationThreshold;
    }

    function isBiddingAllowed(address _contract) internal view returns (bool) {
        return appStorage().contractBiddingAllowed[_contract];
    }

    function _validateBidParams(
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 _highestBid,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount
    ) internal view returns (Auction storage) {
        Auction storage a = appStorage().auctions[_auctionID];

        if (a.startingBid > _bidAmount) revert("BidAmountBelowStartingBid");
        if (msg.sender == a.highestBidder) revert("SelfOutbidUnavailable");

        if (_bidAmount < 1) revert("NoZeroBidAmount");
        //short-circuit
        if (_highestBid != a.highestBid) revert("UnmatchedHighestBid");

        //Verify onchain Auction Params
        if (a.tokenContract != _tokenContract) revert("InvalidAuctionParams");
        if (a.info.tokenID != _tokenID) revert("InvalidAuctionParams");
        if (a.info.tokenAmount != _amount) revert("InvalidAuctionParams");

        address tokenContract = a.tokenContract;
        if (appStorage().contractBiddingAllowed[tokenContract] == false) revert("BiddingNotAllowed");

        uint256 tmp = _highestBid * getAuctionBidDecimals(_auctionID);

        if (tmp + getAuctionStepMin(_auctionID) >= _bidAmount * getAuctionBidDecimals(_auctionID)) revert("MinBidNotMet");

        return a;
    }

    function _validateInitialAuction(InitiatorInfo memory _info) internal view {
        if (_info.startTime < block.timestamp || _info.startTime >= _info.endTime) revert("StartOrEndTimeTooLow");
        uint256 duration = _info.endTime - _info.startTime;
        if (duration < 3600) revert("DurationTooLow");
        if (duration > 604800) revert("DurationTooHigh");
    }

    function _validateAuctionExistence(uint256 _auctionID) internal view {
        Auction memory a = appStorage().auctions[_auctionID];
        if (a.owner == address(0)) revert("NoAuction");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");
        if (a.biddingAllowed == false) revert("BiddingNotAllowed");
        if (msg.sender == a.owner) revert("OwnerBuyNowNotAllowed");
        if (a.info.startTime > block.timestamp) revert("AuctionNotStarted");
    }

    /// @notice Calculating and setting how much payout a bidder will receive if outbid
    /// @dev Only callable internally
    function calculateIncentives(uint256 _auctionID, uint256 _newBidValue) internal view returns (uint256) {
        uint256 bidDecimals = LibGBM.getAuctionBidDecimals(_auctionID);
        uint256 bidIncMax = LibGBM.getAuctionIncMax(_auctionID);

        //Init the baseline bid we need to perform against
        uint256 baseBid = (appStorage().auctions[_auctionID].highestBid * (bidDecimals + LibGBM.getAuctionStepMin(_auctionID))) / bidDecimals;

        //If no bids are present, set a basebid value of 1 to prevent divide by 0 errors
        if (baseBid == 0) {
            baseBid = 1;
        }

        //Ratio of newBid compared to expected minBid
        uint256 decimaledRatio = (bidDecimals * LibGBM.getAuctionBidMultiplier(_auctionID) * (_newBidValue - baseBid)) /
            baseBid +
            LibGBM.getAuctionIncMin(_auctionID) *
            bidDecimals;

        if (decimaledRatio > bidDecimals * bidIncMax) {
            decimaledRatio = bidDecimals * bidIncMax;
        }

        return (_newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
    }
}
