// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/AppStorage.sol";
import "../libraries/LibDiamond.sol";

/// @notice Small test-only facet for configuring AppStorage on a local diamond deployment.
/// @dev This is used by security regression tests and is not intended for production upgrades.
contract GBMReentrancySetupFacet {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    function harnessSetGHST(address ghst) external onlyOwner {
        s.GHST = ghst;
    }

    function harnessSetBackendPubKey(bytes calldata pubKey) external onlyOwner {
        s.backendPubKey = pubKey;
    }

    function harnessSetFeeRecipients(address pixelcraft, address dao, address gbm, address rarityFarming) external onlyOwner {
        s.pixelcraft = pixelcraft;
        s.DAO = dao;
        s.GBMAddress = gbm;
        s.rarityFarming = rarityFarming;
    }

    function harnessSetBuyItNowInvalidationThreshold(uint256 threshold) external onlyOwner {
        s.buyItNowInvalidationThreshold = threshold;
    }

    function harnessSetContractBiddingAllowed(address tokenContract, bool allowed) external onlyOwner {
        s.contractBiddingAllowed[tokenContract] = allowed;
    }

    function harnessInitAuction(
        uint256 auctionId,
        address owner,
        address tokenContract,
        bytes4 tokenKind,
        uint256 tokenId,
        uint56 tokenAmount,
        uint80 startTime,
        uint80 endTime,
        uint96 buyItNowPrice
    ) external onlyOwner {
        Auction storage a = s.auctions[auctionId];
        a.owner = owner;
        a.tokenContract = tokenContract;
        a.info.tokenKind = tokenKind;
        a.info.tokenID = tokenId;
        a.info.tokenAmount = tokenAmount;
        a.info.startTime = startTime;
        a.info.endTime = endTime;

        a.buyItNowPrice = buyItNowPrice;
        a.startingBid = 0;

        a.highestBid = 0;
        a.highestBidder = address(0);
        a.auctionDebt = 0;
        a.dueIncentives = 0;
        a.biddingAllowed = true;
        a.claimed = false;

        // Minimal presets to keep incentive math safe.
        a.presets.bidDecimals = 1;
        a.presets.stepMin = 0;
        a.presets.incMin = 0;
        a.presets.incMax = 0;
        a.presets.bidMultiplier = 0;
    }

    function harnessGetAuctionClaimed(uint256 auctionId) external view returns (bool) {
        return s.auctions[auctionId].claimed;
    }

    function harnessGetAuctionBiddingAllowed(uint256 auctionId) external view returns (bool) {
        return s.auctions[auctionId].biddingAllowed;
    }
}

