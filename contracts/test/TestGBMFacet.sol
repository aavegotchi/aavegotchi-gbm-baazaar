// SPDX-License-Identifier: UNLICENSED
// © Copyright 2021. Patent pending. All rights reserved. Perpetual Altruism Ltd.
pragma solidity ^0.8.0;

import "../interfaces/IGBM.sol";
import "../interfaces/IERC20.sol";
import "../libraries/AppStorage.sol";

contract TestGBMFacet is Modifiers, IGBM {
    function mockCommitBid(
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 _highestBid,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount
    ) external {
        bid(_auctionID, _tokenContract, _tokenID, _amount, _bidAmount, _highestBid);
    }

    function bid(
        uint256 _auctionID,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount,
        uint256 _bidAmount,
        uint256 _highestBid
    ) internal {
        Auction storage a = s.auctions[_auctionID];
        if (msg.sender == a.owner) revert("OwnerBidNotAllowed");
        if (a.info.startTime > block.timestamp) revert("AuctionNotStarted");
        //verify existence
        if (a.owner == address(0)) revert("NoAuction");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");
        if (a.biddingAllowed == false) revert("BiddingNotAllowed");
        if (_bidAmount < 1) revert("NoZeroBidAmount");
        //short-circuit
        if (_highestBid != a.highestBid) revert("UnmatchedHighestBid");

        //Verify onchain Auction Params
        if (a.tokenContract != _tokenContract) revert(" InvalidAuctionParams");
        if (a.info.tokenID != _tokenID) revert(" InvalidAuctionParams");
        if (a.info.tokenAmount != _amount) revert(" InvalidAuctionParams");

        address tokenContract = a.tokenContract;
        if (s.contractBiddingAllowed[tokenContract] == false) revert("BiddingNotAllowed");

        uint256 tmp = _highestBid * mockGetAuctionBidDecimals(_auctionID);

        if (tmp + mockGetAuctionStepMin(_auctionID) >= _bidAmount * mockGetAuctionBidDecimals(_auctionID)) revert("MinBidNotMet");

        //Transfer the money of the bidder to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), _bidAmount);

        //Extend warmup time if bid is made towards warmup duration end
        uint256 warmupEndTime = s.warmupEndTime[_auctionID];
        if (warmupEndTime > 0) {
            uint256 minWarmupWindow = warmupEndTime - s.defaultWarmupDuration;
            if ((block.timestamp >= minWarmupWindow && block.timestamp < warmupEndTime) || block.timestamp == warmupEndTime) {
                //extend warmup duration
                s.warmupEndTime[_auctionID] = block.timestamp + s.defaultWarmupDuration;
                emit Auction_WarmUpEndTimeUpdated(_auctionID, s.warmupEndTime[_auctionID]);
            }
        }

        //Extend the duration time of the auction if we are close to the end
        if (mockGetAuctionEndTime(_auctionID) < block.timestamp + mockGetAuctionHammerTimeDuration()) {
            a.info.endTime = uint80(block.timestamp + mockGetAuctionHammerTimeDuration());
            emit Auction_EndTimeUpdated(_auctionID, a.info.endTime);
        }

        // Saving incentives for later sending
        uint256 duePay = s.auctions[_auctionID].dueIncentives;
        address previousHighestBidder = s.auctions[_auctionID].highestBidder;
        uint256 previousHighestBid = s.auctions[_auctionID].highestBid;

        // Emitting the event sequence
        if (previousHighestBidder != address(0)) {
            emit Auction_BidRemoved(_auctionID, previousHighestBidder, previousHighestBid);
        }

        if (duePay != 0) {}

        emit Auction_BidPlaced(_auctionID, msg.sender, _bidAmount);

        // Calculating incentives for the new bidder
        s.auctions[_auctionID].dueIncentives = uint88(calculateIncentives(_auctionID, _bidAmount));

        //Setting the new bid/bidder as the highest bid/bidder
        s.auctions[_auctionID].highestBidder = msg.sender;
        s.auctions[_auctionID].highestBid = uint96(_bidAmount);

        if (previousHighestBid + duePay != 0) {
            //only pay out incentives if not in warmup period
            if (mockGetAuctionWarmupEndTime(_auctionID) < block.timestamp) {
                s.auctions[_auctionID].auctionDebt = uint88(a.auctionDebt + duePay);
                //Refunding the previous bid as well as sending the incentives
                IERC20(s.GHST).transfer(previousHighestBidder, previousHighestBid + duePay);
                emit Auction_IncentivePaid(_auctionID, previousHighestBidder, duePay);
            } else {
                //only refund if still in warmup period
                IERC20(s.GHST).transfer(previousHighestBidder, previousHighestBid);
            }
        }
    }

    function mockGetAuctionWarmupEndTime(uint256 _auctionID) public view returns (uint256) {
        uint256 warmupTime = s.warmupEndTime[_auctionID];
        if (warmupTime != 0) {
            return warmupTime;
        } else {
            return s.auctions[_auctionID].info.startTime;
        }
    }

    function mockGetAuctionHammerTimeDuration() public view returns (uint256) {
        return s.hammerTimeDuration;
    }

    function mockGetAuctionBidDecimals(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.bidDecimals;
    }

    function mockGetAuctionStepMin(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.stepMin;
    }

    function mockGetAuctionIncMin(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.incMin;
    }

    function mockGetAuctionIncMax(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.incMax;
    }

    function mockGetAuctionBidMultiplier(uint256 _auctionID) public view returns (uint64) {
        return s.auctions[_auctionID].presets.bidMultiplier;
    }

    function calculateIncentives(uint256 _auctionID, uint256 _newBidValue) internal view returns (uint256) {
        uint256 bidDecimals = mockGetAuctionBidDecimals(_auctionID);
        uint256 bidIncMax = mockGetAuctionIncMax(_auctionID);

        //Init the baseline bid we need to perform against
        uint256 baseBid = (s.auctions[_auctionID].highestBid * (bidDecimals + mockGetAuctionStepMin(_auctionID))) / bidDecimals;

        //If no bids are present, set a basebid value of 1 to prevent divide by 0 errors
        if (baseBid == 0) {
            baseBid = 1;
        }

        //Ratio of newBid compared to expected minBid
        uint256 decimaledRatio = (bidDecimals * mockGetAuctionBidMultiplier(_auctionID) * (_newBidValue - baseBid)) /
            baseBid +
            mockGetAuctionIncMin(_auctionID) *
            bidDecimals;

        if (decimaledRatio > bidDecimals * bidIncMax) {
            decimaledRatio = bidDecimals * bidIncMax;
        }

        return (_newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
    }

    function mockGetAuctionEndTime(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].info.endTime;
    }
}
