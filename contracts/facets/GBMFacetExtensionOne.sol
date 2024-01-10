// SPDX-License-Identifier: UNLICENSED
// © Copyright 2023. Patent pending. All rights reserved. Perpetual Altruism Ltd.
pragma solidity ^0.8.0;


import "./GBMFacet.sol";

//import "hardhat/console.sol";

/// @title GBM auction contract
/// @dev See GBM.auction on how to use this contract
/// @author Guillaume Gonnaud
/// Adding the buy it now feature as well as a starting bid recoupable fee
contract GBMFacetExtensionOne is GBMFacet {

    /// For updating a diamond from a deployed GBMFacet to a GBMFacet to a GBMFacetExtensionOne
    /// MUST OVERRIDE commitBid, cancelAuction, batchClaim, claim
    /// MUST ADD createAuctionExt1, batchCreateAuctionsExt1, buyNow, setBuyNow, setBuyNowInvalidationThreshold, getBuyItNowInvalidationThreshold
    /// SHOULD OVERRIDE to null createAuction, batchCreateAuctions (safe to leave as is, simply will assume to null startingprice and buy-it-now price)

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    /// @param _signature Signature
    /// MUST OVERRIDE PREVIOUS FUNCTION
    function commitBid(
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 _highestBid,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount,
        bytes memory _signature
    ) external override {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _auctionID, _bidAmount, _highestBid));
        require(LibSignature.isValid(messageHash, _signature, s.backendPubKey), "bid: Invalid signature");

        //GBMFacetExtensionOne addition : Require the bid to be above the starting bid
        require(s.auctionsExtOne[_auctionID].startingBid <= _bidAmount, "bid: _bidAmount below starting bid");

        bid(_auctionID, _tokenContract, _tokenID, _amount, _bidAmount, _highestBid);
    }

    /// @notice Allows the creation of new Auctions
    /// @dev Will throw if the auction preset does not exist
    /// @dev For ERC721 auctions, will throw if that tokenId is already in an unsettled auction
    /// @param _info A struct containing various details about the auction
    /// @param _tokenContract The contract address of the token
    /// @param _auctionPresetID The identifier of the GBMM preset to use for this auction
    function createAuctionExt1(
        InitiatorInfoExtensionOne calldata _info,
        address _tokenContract,
        uint256 _auctionPresetID
    ) public returns (uint256) { //No need for payable, we are dealing with ERC20 only

        //Packing the data
        InitiatorInfo memory V0_info = InitiatorInfo(
            _info.startTime,
            _info.endTime,
            _info.tokenAmount,
            _info.category, //0 = portal 1 = open portal 2 = pending 3 = aavegotchi
            _info.tokenKind,
            _info.tokenID
        );

        //The function being called here is the internal function in this facet, not the one registered on the diamond
        uint256 _aid = createAuctionInternal(V0_info, _tokenContract, _auctionPresetID); 

        //In order to start an auction with a minium starting price, you need to prepay the fees
        if(_info.startingBid != 0){
            //Transfer the money of the seller to the GBM Diamond
            uint256 prepaidFee = (_info.startingBid* 40) / 1000; //4% fee, hardcoded
            IERC20(s.GHST).transferFrom(msg.sender, address(this), prepaidFee);

            //Presettle the fee
            uint256 _rem = _settleFees(_info.startingBid);
            require(_rem == prepaidFee, "createAuctionExt1: Mismatch of distributed fee and paid amount");
            s.auctionsExtOne[_aid].startingBid =  _info.startingBid;

            emit Auction_StartingPriceUpdated(_aid, _info.startingBid);
        }

        if(_info.buyItNowPrice != 0){
            s.auctionsExtOne[_aid].buyItNowPrice = _info.buyItNowPrice;
             emit Auction_BuyItNowUpdated(_aid, _info.buyItNowPrice);
        }
 
        return _aid;
    }

    function createAuction(
        InitiatorInfo calldata,
        address,
        uint256
    ) public override pure returns (uint256){
        return 0;
    } //Reduce code size of uneeded functions

    function batchCreateAuctions(
        InitiatorInfo[] calldata,
        address[] calldata,
        uint256[] calldata
    ) public pure override {
    } //Reduce code size of uneeded functions

    /// @notice Allows the creation of new Auctions
    /// @dev Will throw if the auction preset does not exist
    /// @dev For ERC721 auctions, will throw if that tokenId is already in an unsettled auction
    /// @param _info A struct containing various details about the auction
    /// @param _tokenContract The contract address of the token
    /// @param _auctionPresetID The identifier of the GBMM preset to use for this auction
    /// Exact same function as GBMFacet.sol, but internal and memory instead of calldata for _info
    function createAuctionInternal(
        InitiatorInfo memory _info,
        address _tokenContract,
        uint256 _auctionPresetID
    ) internal returns (uint256) {
        if (s.auctionPresets[_auctionPresetID].incMin < 1) revert("UndefinedPreset");
        uint256 id = _info.tokenID;
        uint256 amount = _info.tokenAmount;
        bytes4 tokenKind = _info.tokenKind;
        uint256 _aid;
        assert(tokenKind == ERC721 || tokenKind == ERC1155);
        address ca = _tokenContract;
        if (!s.contractAllowed[ca]) revert("ContractNotAllowed");
        _validateInitialAuction(_info);
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
        emit Auction_StartTimeUpdated(_aid, getAuctionStartTime(_aid), getAuctionEndTime(_aid));
        s.auctionNonce++;
        return _aid;
    }


    function batchCreateAuctionsExt1(
        InitiatorInfoExtensionOne[] calldata _info,
        address[] calldata _tokenContracts,
        uint256[] calldata _auctionPresetIDs
    ) external {
        for (uint256 i = 0; i < _info.length; i++) {
            createAuctionExt1(_info[i], _tokenContracts[i], _auctionPresetIDs[i]);
        }
    }

    /// @notice Seller can cancel an auction during the cancellation time
    /// Throw if the token owner is not the caller of the function
    /// @param _auctionID The auctionId of the auction to cancel
    function cancelAuction(uint256 _auctionID) public virtual override{
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
            if (getAuctionEndTime(_auctionID) + s.cancellationTime < block.timestamp) revert("CancellationTimeExceeded");
            //Fees of pixelcraft,GBM,DAO and rarityFarming
            uint256 _auctionFees = (a.highestBid * 4) / 100;

            //Auction owner pays penalty fee to the GBM Contract
            IERC20(s.GHST).transferFrom(a.owner, address(this), _auctionFees + a.dueIncentives + a.auctionDebt);

            //Refund lastHighestBidder's bid plus his incentives
            uint256 bidderShare = a.highestBid + a.dueIncentives;
            IERC20(s.GHST).transfer(a.highestBidder, bidderShare);
            //emit incentive event and bidRemoval event
            emit Auction_IncentivePaid(_auctionID, a.highestBidder, a.dueIncentives);
            emit Auction_BidRemoved(_auctionID, a.highestBidder, a.highestBid);

            _settleFees(a.highestBid - s.auctionsExtOne[_auctionID].startingBid);

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

    //No change necessary for this function code, but it use overriden internal and hence need overriding too in the diamond
    function batchClaim(uint256[] memory _auctionIDs) external override {
        for (uint256 index = 0; index < _auctionIDs.length; index++) {
            this.claim(_auctionIDs[index]);
        }
    }

    /// @notice Attribute a token to the winner of the auction and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionID The auctionId of the auction to complete
    //No change necessary for this function code, but it use overriden internal and hence need overriding too in the diamond
    function claim(uint256 _auctionID) public override {
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
        address ca = a.tokenContract;
        uint256 tid = a.info.tokenID;
        uint256 tam = a.info.tokenAmount;

        //royalties
        address[] memory royalties;
        uint256[] memory royaltyShares;

        //Prevents re-entrancy
        a.claimed = true;

        if (IERC165(ca).supportsInterface(0x2a55205a)) {
            // EIP-2981 is supported
            royalties = new address[](1);
            royaltyShares = new uint256[](1);
            (royalties[0], royaltyShares[0]) = IERC2981(ca).royaltyInfo(tid, a.highestBid);
        } else if (IERC165(ca).supportsInterface(0x24d34933)) {
            // Multi Royalty Standard supported
            (royalties, royaltyShares) = IMultiRoyalty(ca).multiRoyaltyInfo(tid, a.highestBid);
        }
        uint256 toOwner = _settleFeesWithRoyalty(_auctionID, a.highestBid, royalties, royaltyShares) - a.auctionDebt;

        //remaining goes to auction owner
        IERC20(s.GHST).transfer(a.owner, toOwner);

        address recipient = a.highestBidder == address(0) ? a.owner : a.highestBidder;

        if (a.info.tokenKind == ERC721) {
            _sendTokens(ca, recipient, ERC721, tid, 1);
            s.erc721AuctionExists[ca][tid] = false;
        }
        if (a.info.tokenKind == ERC1155) {
            _sendTokens(ca, recipient, ERC1155, tid, tam);
        }
        a.biddingAllowed = false;
        emit Auction_ItemClaimed(_auctionID);
    }


    /// @notice Attribute a token to the caller and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionID The auctionId of the auction to complete
    //No change necessary for this function code, but it use overriden internal and hence need overriding too in the diamond
    function buyNow(uint256 _auctionID) public  {
        Auction storage a = s.auctions[_auctionID];
        if (a.owner == address(0)) revert("NoAuction");
        if (a.claimed == true) revert("AuctionClaimed");

        address ca = a.tokenContract;
        uint256 tid = a.info.tokenID;
        uint256 tam = a.info.tokenAmount;
        uint256 ae1bnp = s.auctionsExtOne[_auctionID].buyItNowPrice;
        
        if(ae1bnp == 0) revert ("NoBuyItNowPrice");
        if(((ae1bnp * s.buyItNowInvalidationThreshold) / 100) <= a.highestBid) revert("HighestBidTooHighToBuyNow");

        if (msg.sender == a.owner) revert("OwnerBuyNowNotAllowed");
        if (a.info.startTime > block.timestamp) revert("AuctionNotStarted");
        //verify existence
        if (a.owner == address(0)) revert("NoAuction");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");
        if (a.biddingAllowed == false) revert("BiddingNotAllowed");

        address tokenContract = a.tokenContract;
        if (s.contractBiddingAllowed[tokenContract] == false) revert("BiddingNotAllowed");

        //royalties
        address[] memory royalties;
        uint256[] memory royaltyShares;

        //Prevents re-entrancy
        a.claimed = true;

        //Transfer the money of the buyer to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), ae1bnp);

        //Refund the highest bidder
        if (a.highestBid > 0) {
            
            IERC20(s.GHST).transfer(a.highestBidder, a.highestBid + a.dueIncentives);
            //emit incentive event and bidRemoval event
            emit Auction_IncentivePaid(_auctionID, a.highestBidder,  a.dueIncentives);
            emit Auction_BidRemoved(_auctionID, a.highestBidder, a.highestBid);
        }

        emit Auction_BoughtNow(_auctionID, msg.sender);

        if (IERC165(ca).supportsInterface(0x2a55205a)) {
            // EIP-2981 is supported
            royalties = new address[](1);
            royaltyShares = new uint256[](1);
            (royalties[0], royaltyShares[0]) = IERC2981(ca).royaltyInfo(tid, ae1bnp);
        } else if (IERC165(ca).supportsInterface(0x24d34933)) {
            // Multi Royalty Standard supported
            (royalties, royaltyShares) = IMultiRoyalty(ca).multiRoyaltyInfo(tid, ae1bnp);
        }
        uint256 toOwner = _settleFeesWithRoyalty(_auctionID, ae1bnp, royalties, royaltyShares) - a.auctionDebt - a.dueIncentives;

        //remaining goes to auction owner
        IERC20(s.GHST).transfer(msg.sender, toOwner);

        address recipient = msg.sender;

        if (a.info.tokenKind == ERC721) {
            _sendTokens(ca, recipient, ERC721, tid, 1);
            s.erc721AuctionExists[ca][tid] = false;
        }
        if (a.info.tokenKind == ERC1155) {
            _sendTokens(ca, recipient, ERC1155, tid, tam);
        }
        a.biddingAllowed = false;
        emit Auction_ItemClaimed(_auctionID);
    }

    
    //Adapted to not take fees from the starting price : those are already paid
    function _settleFeesWithRoyalty(
        uint256 _auctionID,
        uint256 _total,
        address[] memory _royaltyRecipients,
        uint256[] memory _royaltyShares
    ) internal override returns (uint256 rem_) {
        //settle royalties if any
        uint256 totalRoyalty = 0;
        if (_royaltyRecipients.length > 0) {
            //assert length
            if (_royaltyRecipients.length != _royaltyShares.length) revert("LengthMismatch");

            for (uint256 i = 0; i < _royaltyRecipients.length; i++) {
                if (_royaltyShares[i] > 0) {
                    IERC20(s.GHST).transfer(_royaltyRecipients[i], _royaltyShares[i]);
                    emit RoyaltyPaid(_auctionID, s.GHST, _royaltyRecipients[i], _royaltyShares[i]);
                    totalRoyalty += _royaltyShares[i];
                }
            }
        }
        //settle other fees, discounting the initial, already paid, starting price
        uint256 totalFees = _settleFees(_total - s.auctionsExtOne[_auctionID].startingBid );
        rem_ = _total - (totalFees + totalRoyalty);
    }

    function setBuyNow(uint256 _auctionID, uint96 _buyItNowPrice) external{
        Auction storage a = s.auctions[_auctionID];
        if (a.owner == msg.sender) revert("NotAuctionOwner");
        if (a.info.endTime < block.timestamp) revert("AuctionEnded");
        if (a.claimed == true) revert("AuctionClaimed");

        if(_buyItNowPrice != 0){
            uint256 ae1bnp = s.auctionsExtOne[_auctionID].buyItNowPrice; 
            if(((ae1bnp * s.buyItNowInvalidationThreshold) / 100) <= a.highestBid) revert("HighestBidTooHighToBuyNow");
            if(ae1bnp <=  _buyItNowPrice) revert("CanOnlyLowerBuyNow");
            s.auctionsExtOne[_auctionID].buyItNowPrice  = _buyItNowPrice;
            
        } else {
            s.auctionsExtOne[_auctionID].buyItNowPrice = 0;
        }

        emit Auction_BuyItNowUpdated(_auctionID, _buyItNowPrice);

    }

    //Recommended to be set to 70
    function setBuyItNowInvalidationThreshold(uint256 _invalidationThreshold) external onlyOwner{ 
        s.buyItNowInvalidationThreshold = _invalidationThreshold;
    }

    function getBuyItNowInvalidationThreshold() external view returns(uint256){
        return s.buyItNowInvalidationThreshold;
    }

}