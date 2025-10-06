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
import "../libraries/LibSignature.sol";

import "../interfaces/IERC2981.sol";
import "../interfaces/IMultiRoyalty.sol";

import "../libraries/LibTokenSwap.sol";

import "../libraries/LibGBM.sol";

//import "hardhat/console.sol";

/// @title GBM auction contract
/// @dev See GBM.auction on how to use this contract
/// @author Guillaume Gonnaud
contract GBMFacet is IGBM, Modifiers {
    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    /// @param _signature Signature
    function commitBid(
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 _highestBid,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount,
        bytes memory _signature
    ) external {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _auctionID, _bidAmount, _highestBid));
        require(LibSignature.isValid(messageHash, _signature, s.backendPubKey), "bid: Invalid signature");

        bid(_auctionID, _tokenContract, _tokenID, _amount, _bidAmount, _highestBid);
    }

    struct SwapBidCtx {
        address tokenIn;
        uint256 swapAmount;
        uint256 minGhstOut;
        uint256 swapDeadline;
        address recipient;
        uint256 auctionID;
        uint256 bidAmount;
        uint256 highestBid;
        address tokenContract;
        uint256 _tokenID;
        uint256 _amount;
        bytes _signature;
    }

    function swapAndCommitBid(SwapBidCtx memory ctx) external {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, ctx.auctionID, ctx.bidAmount, ctx.highestBid));
        require(LibSignature.isValid(messageHash, ctx._signature, s.backendPubKey), "bid: Invalid signature");
        //validate swap params
        LibTokenSwap.validateSwapParams(ctx.tokenIn, ctx.swapAmount, ctx.minGhstOut, ctx.swapDeadline);
        require(ctx.recipient != address(0), "GBM: recipient cannot be 0 address");
        LibGBM._validateAuctionExistence(ctx.auctionID);
        Auction storage a = LibGBM._validateBidParams(ctx.auctionID, ctx.bidAmount, ctx.highestBid, ctx.tokenContract, ctx._tokenID, ctx._amount);

        require(ctx.minGhstOut >= ctx.bidAmount, "GBM: minGhstOut must cover total bid amount");

        //execute swap
        uint256 ghstReceived = LibTokenSwap.swapForGHST(ctx.tokenIn, ctx.swapAmount, ctx.minGhstOut, ctx.swapDeadline, address(this));

        //make sure we received enough ghst
        require(ghstReceived >= ctx.bidAmount, "GBM: Insufficient ghst received");

        _settleBid(ctx.auctionID, ctx.bidAmount, a);

        //refund excess ghst
        LibTokenSwap.refundExcessGHST(ctx.recipient, ghstReceived, ctx.bidAmount);
    }

    struct SwapBuyNowCtx {
        address tokenIn;
        uint256 swapAmount;
        uint256 minGhstOut;
        uint256 swapDeadline;
        address recipient;
        uint256 auctionID;
    }

    function swapAndBuyNow(SwapBuyNowCtx memory ctx) external {
        // validate swap params
        LibTokenSwap.validateSwapParams(ctx.tokenIn, ctx.swapAmount, ctx.minGhstOut, ctx.swapDeadline);
        require(ctx.recipient != address(0), "GBM: recipient cannot be 0 address");

        LibGBM._validateAuctionExistence(ctx.auctionID);

        Auction storage a = s.auctions[ctx.auctionID];

        uint256 ae1bnp = a.buyItNowPrice;
        if (ae1bnp == 0) revert("NoBuyItNowPrice");
        if (((ae1bnp * s.buyItNowInvalidationThreshold) / 100) <= a.highestBid) revert("HighestBidTooHighToBuyNow");

        address tokenContract = a.tokenContract;
        if (s.contractBiddingAllowed[tokenContract] == false) revert("BiddingNotAllowed");

        // snapshot GHST and prior highest bid state for refunds
        uint256 previousHighestBid = a.highestBid;
        uint256 duePay = a.dueIncentives;
        address previousHighestBidder = a.highestBidder;

        // perform swap
        uint256 ghstReceived = LibTokenSwap.swapForGHST(ctx.tokenIn, ctx.swapAmount, ctx.minGhstOut, ctx.swapDeadline, address(this));
        require(ghstReceived >= ae1bnp, "GBM: Insufficient ghst received");

        // Prevent re-entrancy during state change
        a.claimed = true;

        // Refund the highest bidder if any
        if (previousHighestBid > 0) {
            IERC20(s.GHST).transfer(previousHighestBidder, previousHighestBid + duePay);
            emit Auction_IncentivePaid(ctx.auctionID, previousHighestBidder, duePay);
            emit Auction_BidRemoved(ctx.auctionID, previousHighestBidder, previousHighestBid);
        }

        emit Auction_BoughtNow(ctx.auctionID, msg.sender);

        _calculateRoyaltyAndSend(ctx.auctionID, msg.sender, ae1bnp, a.dueIncentives);

        // refund any excess GHST from the swap that wasn't needed
        LibTokenSwap.refundExcessGHST(ctx.recipient, ghstReceived, ae1bnp);
    }

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    function bid(uint256 _auctionID, address _tokenContract, uint256 _tokenID, uint256 _amount, uint256 _bidAmount, uint256 _highestBid) internal {
        LibGBM._validateAuctionExistence(_auctionID);

        Auction storage a = LibGBM._validateBidParams(_auctionID, _bidAmount, _highestBid, _tokenContract, _tokenID, _amount);

        //Transfer the money of the bidder to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), _bidAmount);

        _settleBid(_auctionID, _bidAmount, a);
    }

    function _settleBid(uint256 _auctionID, uint256 _bidAmount, Auction storage a) internal returns (uint256 previousHighestBid, uint256 duePay) {
        //Extend the duration time of the auction if we are close to the end
        if (LibGBM.getAuctionEndTime(_auctionID) < block.timestamp + LibGBM.getAuctionHammerTimeDuration()) {
            a.info.endTime = uint80(block.timestamp + LibGBM.getAuctionHammerTimeDuration());
            emit Auction_EndTimeUpdated(_auctionID, a.info.endTime);
        }

        // Saving incentives for later sending
        duePay = s.auctions[_auctionID].dueIncentives;
        address previousHighestBidder = s.auctions[_auctionID].highestBidder;
        previousHighestBid = s.auctions[_auctionID].highestBid;

        // Emitting the event sequence
        if (previousHighestBidder != address(0)) {
            emit Auction_BidRemoved(_auctionID, previousHighestBidder, previousHighestBid);
        }

        if (duePay != 0) {
            s.auctions[_auctionID].auctionDebt = uint88(a.auctionDebt + duePay);
            emit Auction_IncentivePaid(_auctionID, previousHighestBidder, duePay);
        }

        emit Auction_BidPlaced(_auctionID, msg.sender, _bidAmount);

        // Calculating incentives for the new bidder
        s.auctions[_auctionID].dueIncentives = uint88(LibGBM.calculateIncentives(_auctionID, _bidAmount));

        //Setting the new bid/bidder as the highest bid/bidder
        s.auctions[_auctionID].highestBidder = msg.sender;
        s.auctions[_auctionID].highestBid = uint96(_bidAmount);

        if (previousHighestBid + duePay != 0) {
            //Refunding the previous bid as well as sending the incentives
            IERC20(s.GHST).transfer(previousHighestBidder, previousHighestBid + duePay);
        }
    }

    function batchClaim(uint256[] memory _auctionIDs) external {
        for (uint256 index = 0; index < _auctionIDs.length; index++) {
            claim(_auctionIDs[index]);
        }
    }

    /// @notice Attribute a token to the winner of the auction and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionID The auctionId of the auction to complete
    function claim(uint256 _auctionID) public {
        Auction storage a = s.auctions[_auctionID];
        if (a.owner == address(0)) revert("NoAuction");
        if (a.claimed == true) revert("AuctionClaimed");
        uint256 cancellationTime = s.cancellationTime;

        //only owner or highestBidder should claim or finalize auction
        //highestBidders have to wait after cancellationTime
        if (msg.sender == a.highestBidder) {
            if (a.info.endTime + cancellationTime > block.timestamp) revert("ClaimNotReady");
        }
        //owners don't need to wait for cancellationTime
        if (msg.sender == a.owner) {
            if (a.info.endTime > block.timestamp) revert("ClaimNotReady");
        }
        require(msg.sender == a.highestBidder || msg.sender == a.owner, "NotHighestBidderOrOwner");

        //Prevents re-entrancy
        a.claimed = true;

        address recipient = a.highestBidder == address(0) ? a.owner : a.highestBidder;

        _calculateRoyaltyAndSend(_auctionID, recipient, a.highestBid, 0);
    }

    //to be called after diamond is paused
    function claimAll(uint256[] calldata _auctionIds) external onlyOwner {
        for (uint256 i = 0; i < _auctionIds.length; i++) {
            Auction storage a = s.auctions[_auctionIds[i]];
            if (a.owner == address(0)) revert("NoAuction");
            if (a.claimed == true) revert("AuctionClaimed");

            //Prevents re-entrancy
            a.claimed = true;

            address recipient = a.highestBidder == address(0) ? a.owner : a.highestBidder;

            _calculateRoyaltyAndSend(_auctionIds[i], recipient, a.highestBid, 0);
        }
    }

    /// @notice Attribute a token to the caller and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionID The auctionId of the auction to complete
    //No change necessary for this function code, but it use overriden internal and hence need overriding too in the diamond
    function buyNow(uint256 _auctionID) public {
        LibGBM._validateAuctionExistence(_auctionID);

        Auction storage a = s.auctions[_auctionID];

        uint256 ae1bnp = a.buyItNowPrice;
        if (ae1bnp == 0) revert("NoBuyItNowPrice");
        if (((ae1bnp * s.buyItNowInvalidationThreshold) / 100) <= a.highestBid) revert("HighestBidTooHighToBuyNow");

        address tokenContract = a.tokenContract;
        if (s.contractBiddingAllowed[tokenContract] == false) revert("BiddingNotAllowed");

        //Prevents re-entrancy
        a.claimed = true;

        //Transfer the money of the buyer to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), ae1bnp);

        //Refund the highest bidder
        if (a.highestBid > 0) {
            IERC20(s.GHST).transfer(a.highestBidder, a.highestBid + a.dueIncentives);
            //emit incentive event and bidRemoval event
            emit Auction_IncentivePaid(_auctionID, a.highestBidder, a.dueIncentives);
            emit Auction_BidRemoved(_auctionID, a.highestBidder, a.highestBid);
        }

        emit Auction_BoughtNow(_auctionID, msg.sender);

        _calculateRoyaltyAndSend(_auctionID, msg.sender, ae1bnp, a.dueIncentives);
    }

    /// @notice Allows the creation of new Auctions
    /// @dev Will throw if the auction preset does not exist
    /// @dev For ERC721 auctions, will throw if that tokenId is already in an unsettled auction
    /// @param _info A struct containing various details about the auction
    /// @param _tokenContract The contract address of the token
    /// @param _auctionPresetID The identifier of the GBMM preset to use for this auction
    function createAuction(InitiatorInfo calldata _info, address _tokenContract, uint256 _auctionPresetID) public diamondNotPaused returns (uint256) {
        if (s.auctionPresets[_auctionPresetID].incMin < 1) revert("UndefinedPreset");
        uint256 id = _info.tokenID;
        uint256 amount = _info.tokenAmount;
        bytes4 tokenKind = _info.tokenKind;
        uint256 _aid;
        assert(tokenKind == ERC721 || tokenKind == ERC1155);
        address ca = _tokenContract;
        if (!s.contractAllowed[ca]) revert("ContractNotAllowed");
        LibGBM._validateInitialAuction(_info);
        if (tokenKind == ERC721) {
            if (s.erc721AuctionExists[ca][id] != false) revert("AuctionExists");
            if (Ownable(ca).ownerOf(id) == address(0) || msg.sender != Ownable(ca).ownerOf(id)) revert("NotTokenOwner");
            //transfer Token
            IERC721(ca).safeTransferFrom(msg.sender, address(this), id);
            amount = 1;
            s.erc721AuctionExists[ca][id] = true;
        }
        if (tokenKind == ERC1155) {
            if (IERC1155(ca).balanceOf(msg.sender, id) < amount) revert("InsufficientToken");
            //transfer Token/s
            IERC1155(ca).safeTransferFrom(msg.sender, address(this), id, amount, "");
        }
        _aid = s.auctionNonce;
        //set initiator info and set bidding allowed
        Auction storage a = s.auctions[_aid];
        a.owner = msg.sender;
        a.tokenContract = _tokenContract;
        a.info = _info;
        a.presets = s.auctionPresets[_auctionPresetID];
        a.biddingAllowed = true;

        emit Auction_Initialized(_aid, id, amount, ca, tokenKind, _auctionPresetID);
        emit Auction_StartTimeUpdated(_aid, LibGBM.getAuctionStartTime(_aid), LibGBM.getAuctionEndTime(_aid));
        s.auctionNonce++;

        //In order to start an auction with a minium starting price, you need to prepay the fees
        if (_info.startingBid != 0) {
            //Transfer the money of the seller to the GBM Diamond
            uint256 prepaidFee = (_info.startingBid * 40) / 1000; //4% fee, hardcoded
            IERC20(s.GHST).transferFrom(msg.sender, address(this), prepaidFee);

            //Presettle the fee
            uint256 _rem = _settleFees(_info.startingBid);
            require(_rem == prepaidFee, "Mismatch of distributed fee and paid amount");
            s.auctions[_aid].startingBid = _info.startingBid;

            emit Auction_StartingPriceUpdated(_aid, _info.startingBid);
        }

        if (_info.buyItNowPrice != 0) {
            s.auctions[_aid].buyItNowPrice = _info.buyItNowPrice;
            emit Auction_BuyItNowUpdated(_aid, _info.buyItNowPrice);
        }

        return _aid;
    }

    function batchCreateAuctions(
        InitiatorInfo[] calldata _info,
        address[] calldata _tokenContracts,
        uint256[] calldata _auctionPresetIDs
    ) external diamondNotPaused {
        for (uint256 i = 0; i < _info.length; i++) {
            createAuction(_info[i], _tokenContracts[i], _auctionPresetIDs[i]);
        }
    }

    function modifyAuction(uint256 _auctionID, uint80 _newEndTime, uint56 _newTokenAmount, bytes4 _tokenKind) external {
        Auction storage a = s.auctions[_auctionID];
        //verify existence
        if (a.owner == address(0)) revert("NoAuction");
        //verify ownership
        if (a.owner != msg.sender) revert("NotAuctionOwner");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");
        if (a.info.tokenKind != _tokenKind) revert("TokenTypeMismatch");
        uint256 tid = a.info.tokenID;
        address ca = a.tokenContract;
        //verify that no bids have been entered yet
        if (a.highestBid > 0) revert("ModifyAuctionError");
        //If the end time is being changed
        if (a.info.endTime != _newEndTime) {
            if (block.timestamp >= _newEndTime || a.info.startTime >= _newEndTime) revert("EndTimeTooLow");
            uint256 duration = _newEndTime - a.info.startTime;
            //max time should not be greater than 7 days
            if (duration > 604800) revert("DurationTooHigh");
        }
        if (_tokenKind == ERC721) {
            a.info.endTime = _newEndTime;
            emit Auction_Modified(_auctionID, 1, _newEndTime);
        }

        if (_tokenKind == ERC1155) {
            uint256 diff = 0;
            a.info.endTime = _newEndTime;
            uint256 currentAmount = a.info.tokenAmount;

            if (currentAmount < _newTokenAmount) {
                diff = _newTokenAmount - currentAmount;
                //retrieve Token
                IERC1155(ca).safeTransferFrom(msg.sender, address(this), a.info.tokenID, diff, "");
                // update storage
                a.info.tokenAmount = _newTokenAmount;
            }
            if (currentAmount > _newTokenAmount) {
                diff = currentAmount - _newTokenAmount;
                //refund tokens
                _sendTokens(ca, msg.sender, _tokenKind, tid, diff);
                //update storage
                a.info.tokenAmount = _newTokenAmount;
            }
            emit Auction_Modified(_auctionID, _newTokenAmount, _newEndTime);
        }
    }

    function _calculateRoyaltyAndSend(uint256 _auctionID, address _recipient, uint256 _salePrice, uint88 _dueIncentives) internal {
        Auction storage a = s.auctions[_auctionID];
        address _contract = a.tokenContract;
        bytes4 _tokenKind = a.info.tokenKind;
        uint256 _tokenID = a.info.tokenID;
        uint256 _amount = a.info.tokenAmount;

        if (_amount > 0) {
            //royalties
            address[] memory royalties;
            uint256[] memory royaltyShares;

            if (IERC165(_contract).supportsInterface(0x2a55205a)) {
                // EIP-2981 is supported
                royalties = new address[](1);
                royaltyShares = new uint256[](1);
                (royalties[0], royaltyShares[0]) = IERC2981(_contract).royaltyInfo(_tokenID, _salePrice);
            } else if (IERC165(_contract).supportsInterface(0x24d34933)) {
                // Multi Royalty Standard supported
                (royalties, royaltyShares) = IMultiRoyalty(_contract).multiRoyaltyInfo(_tokenID, _salePrice);
            }

            uint256 toOwner = _settleFeesWithRoyalty(_auctionID, _salePrice, royalties, royaltyShares) - a.auctionDebt - _dueIncentives;

            //remaining goes to auction owner
            IERC20(s.GHST).transfer(a.owner, toOwner);
        }

        if (_tokenKind == ERC721) {
            _sendTokens(_contract, _recipient, ERC721, _tokenID, 1);
            s.erc721AuctionExists[_contract][_tokenID] = false;
        }
        if (_tokenKind == ERC1155) {
            _sendTokens(_contract, _recipient, ERC1155, _tokenID, _amount);
        }
        a.biddingAllowed = false;
        emit Auction_ItemClaimed(_auctionID);
    }

    function _sendTokens(address _contract, address _recipient, bytes4 _tokenKind, uint256 _tokenID, uint256 _amount) internal {
        if (_tokenKind == ERC721) {
            IERC721(_contract).safeTransferFrom(address(this), _recipient, _tokenID, "");
        }
        if (_tokenKind == ERC1155) {
            IERC1155(_contract).safeTransferFrom(address(this), _recipient, _tokenID, _amount, "");
        }
    }

    /// @notice Seller can cancel an auction during the cancellation time
    /// Throw if the token owner is not the caller of the function
    /// @param _auctionID The auctionId of the auction to cancel
    function cancelAuction(uint256 _auctionID) public {
        Auction storage a = s.auctions[_auctionID];
        //verify existence
        if (a.owner == address(0)) revert("NoAuction");
        //verify ownership
        if (a.owner != msg.sender) revert("NotAuctionOwner");
        //check if not claimed
        if (a.claimed == true) revert("AuctionClaimed");

        address ca = a.tokenContract;
        uint256 tid = a.info.tokenID;
        uint256 tam = a.info.tokenAmount;
        a.claimed = true;
        // case where no bids have been made
        if (a.highestBid == 0) {
            // Transfer the token to the owner/canceller
            if (a.info.tokenKind == ERC721) {
                _sendTokens(ca, a.owner, ERC721, tid, 1);
                //update storage
                s.erc721AuctionExists[ca][tid] = false;
            }
            if (a.info.tokenKind == ERC1155) {
                _sendTokens(ca, a.owner, ERC1155, tid, tam);
            }
            emit AuctionCancelled(_auctionID, tid);
        }
        //if it has a bid
        if (a.highestBid > 0) {
            //make sure auction has ended
            if (a.info.endTime > block.timestamp) revert("AuctionNotEnded");
            //can only cancel during cancellation period
            if (LibGBM.getAuctionEndTime(_auctionID) + s.cancellationTime < block.timestamp) revert("CancellationTimeExceeded");
            uint256 _proceeds = a.highestBid - a.auctionDebt;
            //Fees of pixelcraft,GBM,DAO and rarityFarming
            uint256 _auctionFees = (a.highestBid * 4) / 100;

            //Auction owner pays penalty fee to the GBM Contract
            IERC20(s.GHST).transferFrom(a.owner, address(this), _auctionFees + a.dueIncentives + a.auctionDebt);

            //Refund lastHighestBidder's bid plus his incentives
            uint256 ownerShare = _proceeds + a.auctionDebt + a.dueIncentives;
            IERC20(s.GHST).transfer(a.highestBidder, ownerShare);
            //emit incentive event and bidRemoval event
            emit Auction_IncentivePaid(_auctionID, a.highestBidder, ownerShare - a.highestBid);
            emit Auction_BidRemoved(_auctionID, a.highestBidder, a.highestBid);

            _settleFees(a.highestBid);

            // Transfer the token back to the owner/canceller
            if (a.info.tokenKind == ERC721) {
                _sendTokens(ca, a.owner, ERC721, tid, 1);
                //update storage
                s.erc721AuctionExists[ca][tid] = false;
            }
            if (a.info.tokenKind == ERC1155) {
                _sendTokens(ca, a.owner, ERC1155, tid, tam);
            }

            emit AuctionCancelled(_auctionID, tid);
        }
    }

    function _settleFeesWithRoyalty(
        uint256 _auctionId,
        uint256 _total,
        address[] memory _royaltyRecipients,
        uint256[] memory _royaltyShares
    ) internal returns (uint256 rem_) {
        //settle royalties if any
        uint256 totalRoyalty = 0;
        if (_royaltyRecipients.length > 0) {
            //assert length
            if (_royaltyRecipients.length != _royaltyShares.length) revert("LengthMismatch");

            for (uint256 i = 0; i < _royaltyRecipients.length; i++) {
                if (_royaltyShares[i] > 0) {
                    IERC20(s.GHST).transfer(_royaltyRecipients[i], _royaltyShares[i]);
                    emit RoyaltyPaid(_auctionId, s.GHST, _royaltyRecipients[i], _royaltyShares[i]);
                    totalRoyalty += _royaltyShares[i];
                }
            }
        }
        //settle other fees, discounting the initial, already paid, starting price
        uint256 totalFees = _settleFees(_total - s.auctions[_auctionId].startingBid);
        rem_ = _total - (totalFees + totalRoyalty);
    }

    function setBuyNow(uint256 _auctionID, uint96 _buyItNowPrice) external {
        Auction storage a = s.auctions[_auctionID];
        if (a.owner != msg.sender) revert("NotAuctionOwner");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");

        if (_buyItNowPrice != 0) {
            uint256 ae1bnp = a.buyItNowPrice;
            if (((ae1bnp * s.buyItNowInvalidationThreshold) / 100) <= a.highestBid) revert("HighestBidTooHighToBuyNow");
            if (ae1bnp <= _buyItNowPrice) revert("CanOnlyLowerBuyNow");
            a.buyItNowPrice = _buyItNowPrice;
        } else {
            a.buyItNowPrice = 0;
        }

        emit Auction_BuyItNowUpdated(_auctionID, _buyItNowPrice);
    }

    //Recommended to be set to 70
    function setBuyItNowInvalidationThreshold(uint256 _invalidationThreshold) external onlyOwner {
        if (_invalidationThreshold >= 100) revert("Invalid Threshold");
        s.buyItNowInvalidationThreshold = _invalidationThreshold;
    }

    function _settleFees(uint256 _total) internal returns (uint256 rem_) {
        //1.5% goes to pixelcraft
        uint256 pixelcraftShare = (_total * 15) / 1000;
        IERC20(s.GHST).transfer(s.pixelcraft, pixelcraftShare);
        //1% goes to GBM
        uint256 GBM = (_total * 1) / 100;
        IERC20(s.GHST).transfer(s.GBMAddress, GBM);
        //0.5% to DAO
        uint256 DAO = (_total * 5) / 1000;
        IERC20(s.GHST).transfer(s.DAO, DAO);
        //1% to treasury
        uint256 rarityFarming = (_total * 1) / 100;
        IERC20(s.GHST).transfer(s.rarityFarming, rarityFarming);
        rem_ = pixelcraftShare + GBM + DAO + rarityFarming;
    }
}
