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

//import "hardhat/console.sol";

/// @title GBM auction contract
/// @dev See GBM.auction on how to use this contract
/// @author Guillaume Gonnaud
contract GBMFacet is IGBM, IERC1155TokenReceiver, IERC721TokenReceiver, Modifiers {
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
        bytes memory _signature,
        bool _inGame
    ) external {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _auctionID, _bidAmount, _highestBid));
        require(LibSignature.isValid(messageHash, _signature, s.backendPubKey), "bid: Invalid signature");

        bid(_auctionID, _tokenContract, _tokenID, _amount, _bidAmount, _highestBid, _inGame);
    }

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    function bid(
        uint256 _auctionID,
        address _tokenContract,
        uint256 _tokenID,
        uint256 _amount,
        uint256 _bidAmount,
        uint256 _highestBid,
        bool _inGame
    ) internal {
        Auction storage a = s.auctions[_auctionID];
        if (msg.sender == a.owner) revert("OwnerBidNotAllowed");
        //check for ingame bidding
        if (a.inGameBiddingOnly) {
            if (!_inGame) revert("BidderNotInGame");
        }
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

        uint256 tmp = _highestBid * getAuctionBidDecimals(_auctionID);

        if (tmp + getAuctionStepMin(_auctionID) >= _bidAmount * getAuctionBidDecimals(_auctionID)) revert("MinBidNotMet");

        //Transfer the money of the bidder to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), _bidAmount);

        //Extend the duration time of the auction if we are close to the end
        if (getAuctionEndTime(_auctionID) < block.timestamp + getAuctionHammerTimeDuration()) {
            a.info.endTime = uint80(block.timestamp + getAuctionHammerTimeDuration());
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

        if (duePay != 0) {
            s.auctions[_auctionID].auctionDebt = uint88(a.auctionDebt + duePay);
            emit Auction_IncentivePaid(_auctionID, previousHighestBidder, duePay);
        }

        emit Auction_BidPlaced(_auctionID, msg.sender, _bidAmount);

        // Calculating incentives for the new bidder
        s.auctions[_auctionID].dueIncentives = uint88(calculateIncentives(_auctionID, _bidAmount));

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

    /// @notice Allows the creation of new Auctions
    /// @dev Will throw if the auction preset does not exist
    /// @dev For ERC721 auctions, will throw if that tokenId is already in an unsettled auction
    /// @param _info A struct containing various details about the auction
    /// @param _tokenContract The contract address of the token
    /// @param _auctionPresetID The identifier of the GBMM preset to use for this auction
    function createAuction(
        InitiatorInfo calldata _info,
        address _tokenContract,
        uint256 _auctionPresetID,
        bool _inGameBiddingOnly
    ) public returns (uint256) {
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
        a.inGameBiddingOnly = _inGameBiddingOnly;

        emit Auction_Initialized(_aid, id, amount, ca, tokenKind, _auctionPresetID);
        emit Auction_StartTimeUpdated(_aid, getAuctionStartTime(_aid), getAuctionEndTime(_aid));
        s.auctionNonce++;
        return _aid;
    }

    function batchCreateAuctions(
        InitiatorInfo[] calldata _info,
        address[] calldata _tokenContracts,
        uint256[] calldata _auctionPresetIDs,
        bool[] calldata _inGameBiddingOnly
    ) external {
        for (uint256 i = 0; i < _info.length; i++) {
            createAuction(_info[i], _tokenContracts[i], _auctionPresetIDs[i], _inGameBiddingOnly[i]);
        }
    }

    function modifyAuction(
        uint256 _auctionID,
        uint80 _newEndTime,
        uint56 _newTokenAmount,
        bytes4 _tokenKind
    ) external {
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

    function _validateInitialAuction(InitiatorInfo memory _info) internal view {
        if (_info.startTime < block.timestamp || _info.startTime >= _info.endTime) revert("StartOrEndTimeTooLow");
        uint256 duration = _info.endTime - _info.startTime;
        if (duration < 3600) revert("DurationTooLow");
        if (duration > 604800) revert("DurationTooHigh");
    }

    function _sendTokens(
        address _contract,
        address _recipient,
        bytes4 _tokenKind,
        uint256 _tokenID,
        uint256 _amount
    ) internal {
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
            if (getAuctionEndTime(_auctionID) + s.cancellationTime < block.timestamp) revert("CancellationTimeExceeded");
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
        //settle other fees
        uint256 totalFees = _settleFees(_total);
        rem_ = _total - (totalFees + totalRoyalty);
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

    /// @notice Register parameters of auction to be used as presets
    /// Throw if the token owner is not the GBM smart contract
    function setAuctionPresets(uint256 _auctionPresetID, Preset calldata _preset) external onlyOwner {
        s.auctionPresets[_auctionPresetID] = _preset;
    }

    function setPubkey(bytes calldata _newPubkey) external onlyOwner {
        s.backendPubKey = _newPubkey;
    }

    function setAddresses(
        address _pixelcraft,
        address _dao,
        address _gbm,
        address _rarityFarming
    ) external onlyOwner {
        s.pixelcraft = _pixelcraft;
        s.DAO = _dao;
        s.GBMAddress = _gbm;
        s.rarityFarming = _rarityFarming;
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

    function isBiddingAllowed(address _contract) public view returns (bool) {
        return s.contractBiddingAllowed[_contract];
    }

    function onERC721Received(
        address, /* _operator */
        address, /*  _from */
        uint256, /*  _tokenId */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    function onERC1155Received(
        address, /* _operator */
        address, /* _from */
        uint256, /* _id */
        uint256, /* _value */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(
        address, /* _operator */
        address, /* _from */
        uint256[] calldata, /* _ids */
        uint256[] calldata, /* _values */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }

    /// @notice Calculating and setting how much payout a bidder will receive if outbid
    /// @dev Only callable internally
    function calculateIncentives(uint256 _auctionID, uint256 _newBidValue) internal view returns (uint256) {
        uint256 bidDecimals = getAuctionBidDecimals(_auctionID);
        uint256 bidIncMax = getAuctionIncMax(_auctionID);

        //Init the baseline bid we need to perform against
        uint256 baseBid = (s.auctions[_auctionID].highestBid * (bidDecimals + getAuctionStepMin(_auctionID))) / bidDecimals;

        //If no bids are present, set a basebid value of 1 to prevent divide by 0 errors
        if (baseBid == 0) {
            baseBid = 1;
        }

        //Ratio of newBid compared to expected minBid
        uint256 decimaledRatio = (bidDecimals * getAuctionBidMultiplier(_auctionID) * (_newBidValue - baseBid)) /
            baseBid +
            getAuctionIncMin(_auctionID) *
            bidDecimals;

        if (decimaledRatio > bidDecimals * bidIncMax) {
            decimaledRatio = bidDecimals * bidIncMax;
        }

        return (_newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
    }
}
