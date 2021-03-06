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

//import "hardhat/console.sol";

/// @title GBM auction contract
/// @dev See GBM.auction on how to use this contract
/// @author Guillaume Gonnaud
contract GBMFacet is IGBM, IERC1155TokenReceiver, IERC721TokenReceiver, Modifiers {
    error NoSecondaryMarket();

    error AuctionNotStarted();
    error ContractEnabledAlready();
    error AuctionExists();
    error NotTokenOwner();
    error StartOrEndTimeTooLow();
    error InsufficientToken();
    error TokenTypeMismatch();
    error UndefinedPreset();
    error NoAuction();
    error NotAuctionOwner();
    error AuctionEnded();
    error AuctionClaimed();
    error ModifyAuctionError();
    error AuctionNotEnded(uint256 timeToEnd);
    error CancellationTimeExceeded();
    error BiddingNotAllowed();
    error NoZeroBidAmount();
    error UnmatchedHighestBid(uint256 currentHighestBid);
    error NotHighestBidderOrOwner();
    error MinBidNotMet();
    error EndTimeTooLow();
    error DurationTooLow();
    error DurationTooHigh();
    error InvalidAuctionParams(string arg);
    error ContractDisabledAlready();

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    /// @param _signature Signature
    function commitBid(
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 _highestBid,
        uint256 _contractID,
        uint256 _tokenID,
        uint256 _amount,
        bytes memory _signature
    ) external {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _auctionID, _bidAmount, _highestBid));
        require(LibSignature.isValid(messageHash, _signature, s.backendPubKey), "bid: Invalid signature");

        bid(_auctionID, _contractID, _tokenID, _amount, _bidAmount, _highestBid);
    }

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionID The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    function bid(
        uint256 _auctionID,
        uint256 _contractID,
        uint256 _tokenID,
        uint256 _amount,
        uint256 _bidAmount,
        uint256 _highestBid
    ) internal {
        Auction storage a = s.auctions[_auctionID];
        //verify existence
        if (a.owner == address(0)) revert NoAuction();
        if (a.info.endTime < block.timestamp) revert AuctionEnded();
        if (a.claimed == true) revert AuctionClaimed();
        if (a.biddingAllowed == false) revert BiddingNotAllowed();
        if (_bidAmount < 1) revert NoZeroBidAmount();
        //short-circuit
        if (_highestBid != a.highestBid) revert UnmatchedHighestBid(a.highestBid);

        //Verify onchain Auction Params
        if (a.contractID != _contractID) revert InvalidAuctionParams("contractID");
        if (a.info.tokenID != _tokenID) revert InvalidAuctionParams("tokenID");
        if (a.info.tokenAmount != _amount) revert InvalidAuctionParams("amount");

        //  if (_bidAmount <= _highestBid) revert HigherBidAmount(_highestBid);

        address tokenContract = s.secondaryMarketTokenContract[_contractID];
        if (s.contractBiddingAllowed[tokenContract] == false) revert BiddingNotAllowed();

        uint256 tmp = _highestBid * (getAuctionBidDecimals(_auctionID));

        if ((tmp + getAuctionStepMin(_auctionID)) >= (_bidAmount * getAuctionBidDecimals(_auctionID))) revert MinBidNotMet();

        //Transfer the money of the bidder to the GBM Diamond
        IERC20(s.GHST).transferFrom(msg.sender, address(this), _bidAmount);

        //Extend the duration time of the auction if we are close to the end
        if (getAuctionEndTime(_auctionID) < block.timestamp + getAuctionHammerTimeDuration(_auctionID)) {
            a.info.endTime = uint80(block.timestamp + getAuctionHammerTimeDuration(_auctionID));
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

        if ((previousHighestBid + duePay) != 0) {
            //Refunding the previous bid as well as sending the incentives
            //Added to prevent revert
            //No need if using transfer()
            //  IERC20(s.GHST).approve(address(this), (previousHighestBid + duePay));

            IERC20(s.GHST).transfer(previousHighestBidder, (previousHighestBid + duePay));
        }
    }

    function batchClaim(uint256[] memory _auctionIDs) external {
        for (uint256 index = 0; index < _auctionIDs.length; index++) {
            claim(_auctionIDs[index]);
        }
    }

    // function updatePlayerRewardsAddress(address _newAddress) external onlyOwner {
    //     s.playerRewards = _newAddress;
    // }

    /// @notice Attribute a token to the winner of the auction and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionID The auctionId of the auction to complete
    function claim(uint256 _auctionID) public {
        Auction storage a = s.auctions[_auctionID];
        if (a.owner == address(0)) revert NoAuction();
        if (a.claimed == true) revert AuctionClaimed();
        if (a.info.endTime + getAuctionHammerTimeDuration(_auctionID) > block.timestamp)
            revert AuctionNotEnded(a.info.endTime + getAuctionHammerTimeDuration(_auctionID));
        //only owner or highestBidder should caim
        require(msg.sender == a.highestBidder || msg.sender == a.owner, "NotHighestBidderOrOwner");
        address ca = s.secondaryMarketTokenContract[a.contractID];
        uint256 tid = a.info.tokenID;
        uint256 tam = a.info.tokenAmount;

        //Prevents re-entrancy
        a.claimed = true;

        //Todo: Add in the various Aavegotchi addresses
        uint256 _proceeds = a.highestBid - a.auctionDebt;

        //Added to prevent revert
        //IERC20(s.GHST).approve(address(this), _proceeds);

        //Transfer the proceeds to the various recipients
        //TODO: DEFINE FEE PERCENTAGES
        //5% to burn address
        /** 
        uint256 burnShare = (_proceeds * 5) / 100;

        //40% to Pixelcraft wallet
        uint256 companyShare = (_proceeds * 40) / 100;

        //40% to player rewards
        uint256 playerRewardsShare = (_proceeds * 2) / 5;

        //15% to DAO
        uint256 daoShare = (_proceeds - burnShare - companyShare - playerRewardsShare);

        IERC20(s.GHST).transfer(address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF), burnShare);
        IERC20(s.GHST).transfer(s.pixelcraft, companyShare);
        IERC20(s.GHST).transfer(s.playerRewards, playerRewardsShare);
        IERC20(s.GHST).transfer(s.daoTreasury, daoShare);
*/
        //96% goes to auction owner
        uint256 ownerShare = (_proceeds * 96) / 100;
        IERC20(s.GHST).transfer(a.owner, ownerShare);

        //1% goes to pixelcraft
        uint256 pixelcraftShare = (_proceeds * 1) / 100;
        IERC20(s.GHST).transfer(s.pixelcraft, pixelcraftShare);
        //1% goes to GBM
        uint256 GBM = (_proceeds * 1) / 100;
        IERC20(s.GHST).transfer(s.GBMAddress, GBM);
        //1% goes to Treasury
        uint256 Treasury = (_proceeds * 1) / 100;
        IERC20(s.GHST).transfer(s.Treasury, Treasury);
        //0.5% goes to DAO
        uint256 DAO = (_proceeds * 5) / 1000;
        IERC20(s.GHST).transfer(s.DAO, DAO);

        if (a.info.tokenKind == ERC721) {
            _sendTokens(ca, a.highestBidder, ERC721, tid, 1);
            s.erc721AuctionExists[ca][tid] = false;
        }
        if (a.info.tokenKind == ERC1155) {
            _sendTokens(ca, a.highestBidder, ERC1155, tid, tam);
            //update storage
            unchecked {
                s.erc1155AuctionIndexes[ca][tid][tam]--;
            }
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

    function enableContract(uint256 _contractID, address _tokenContract) external onlyOwner {
        if (s.secondaryMarketTokenContract[_contractID] != address(0)) revert ContractEnabledAlready();
        s.secondaryMarketTokenContract[_contractID] = _tokenContract;
    }

    function disableContract(uint256 _contractID) external onlyOwner {
        if (s.secondaryMarketTokenContract[_contractID] == address(0)) revert ContractDisabledAlready();
        s.secondaryMarketTokenContract[_contractID] = address(0);
    }

    function createAuction(
        InitiatorInfo calldata _info,
        uint160 _contractID,
        uint256 _auctionPresetID
    ) external returns (uint256) {
        if (s.auctionPresets[_auctionPresetID].incMin < 1) revert UndefinedPreset();
        uint256 id = _info.tokenID;
        uint256 amount = _info.tokenAmount;
        address ca = s.secondaryMarketTokenContract[_contractID];
        bytes4 tokenKind = _info.tokenKind;
        uint256 _aid;
        assert(tokenKind == ERC721 || tokenKind == ERC1155);
        if (ca == address(0)) revert NoSecondaryMarket();
        _validateInitialAuction(_info);
        if (tokenKind == ERC721) {
            if (s.erc721AuctionExists[ca][id] != false) revert AuctionExists();
            if (Ownable(ca).ownerOf(id) == address(0) || msg.sender != Ownable(ca).ownerOf(id)) revert NotTokenOwner();
            //transfer Token
            IERC721(ca).safeTransferFrom(msg.sender, address(this), id);
            //register onchain after successfull transfer
            _aid = uint256(keccak256(abi.encodePacked(ca, id, tokenKind, block.timestamp, amount, msg.sender)));
            amount = 1;
            s.erc721AuctionExists[ca][id] = true;
        }
        if (tokenKind == ERC1155) {
            uint256 index = s.erc1155AuctionIndexes[ca][id][amount];
            if (IERC1155(ca).balanceOf(msg.sender, id) < amount) revert InsufficientToken();
            //transfer Token
            IERC1155(ca).safeTransferFrom(msg.sender, address(this), id, amount, "");
            _aid = uint256(keccak256(abi.encodePacked(ca, id, tokenKind, block.timestamp, index, amount, msg.sender)));
            unchecked {
                s.erc1155AuctionIndexes[ca][id][amount]++;
            }
        }

        //set initiator info and set bidding allowed
        Auction storage a = s.auctions[_aid];
        a.owner = msg.sender;
        a.contractID = _contractID;
        a.info = _info;
        a.presets = s.auctionPresets[_auctionPresetID];
        a.biddingAllowed = true;
        //for recurring auction creations
        //   a.claimed = false;
        emit Auction_Initialized(_aid, id, amount, ca, tokenKind, _auctionPresetID);
        emit Auction_StartTimeUpdated(_aid, getAuctionStartTime(_aid), getAuctionEndTime(_aid));
        return _aid;
    }

    function modifyAuction(
        uint256 _auctionID,
        uint80 _newEndTime,
        uint64 _newTokenAmount,
        bytes4 _tokenKind
    ) external {
        Auction storage a = s.auctions[_auctionID];
        //verify existence
        if (a.owner == address(0)) revert NoAuction();
        //verify ownership
        if (a.owner != msg.sender) revert NotAuctionOwner();
        if (a.info.endTime < block.timestamp) revert AuctionEnded();
        if (a.claimed == true) revert AuctionClaimed();
        if (a.info.tokenKind != _tokenKind) revert TokenTypeMismatch();
        uint256 tid = a.info.tokenID;
        address ca = s.secondaryMarketTokenContract[a.contractID];
        //verify that no bids have been entered yet
        if (a.highestBid > 0) revert ModifyAuctionError();
        //If the end time is being changed
        if (a.info.endTime != _newEndTime) {
            if (block.timestamp >= _newEndTime || a.info.startTime >= _newEndTime) revert EndTimeTooLow();
            uint256 duration = _newEndTime - a.info.startTime;
            //max time should not be grater than 7 days
            if (duration > 604800) revert DurationTooHigh();
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
                unchecked {
                    s.erc1155AuctionIndexes[ca][tid][currentAmount]--;
                    s.erc1155AuctionIndexes[ca][tid][_newTokenAmount]++;
                }
            }
            if (currentAmount > _newTokenAmount) {
                diff = currentAmount - _newTokenAmount;
                //refund tokens
                _sendTokens(ca, msg.sender, _tokenKind, tid, diff);
                //update storage
                a.info.tokenAmount = _newTokenAmount;
                unchecked {
                    s.erc1155AuctionIndexes[ca][tid][currentAmount]--;
                    s.erc1155AuctionIndexes[ca][tid][_newTokenAmount]++;
                }
            }
            emit Auction_Modified(_auctionID, _newTokenAmount, _newEndTime);
        }
    }

    function _validateInitialAuction(InitiatorInfo memory _info) internal view {
        if (_info.startTime < block.timestamp || _info.startTime >= _info.endTime) revert StartOrEndTimeTooLow();
        uint256 duration = _info.endTime - _info.startTime;
        if (duration < 3600) revert DurationTooLow();
        if (duration > 604800) revert DurationTooHigh();
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

    /// @notice Seller can cancel an auction during the grace period
    /// Throw if the token owner is not the caller of the function
    /// @param _auctionID The auctionId of the auction to cancel
    function cancelAuction(uint256 _auctionID) public {
        Auction storage a = s.auctions[_auctionID];
        //verify existence
        if (a.owner == address(0)) revert NoAuction();
        //verify ownership
        if (a.owner != msg.sender) revert NotAuctionOwner();
        if (a.info.endTime > block.timestamp) revert AuctionNotEnded(getAuctionEndTime(_auctionID));
        //check if not claimed
        if (a.claimed == true) revert AuctionClaimed();

        address ca = s.secondaryMarketTokenContract[a.contractID];
        uint256 tid = a.info.tokenID;
        uint256 tam = a.info.tokenAmount;
        if (getAuctionEndTime(_auctionID) + getAuctionHammerTimeDuration(_auctionID) < block.timestamp) revert CancellationTimeExceeded();
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
                //update storage
                unchecked {
                    s.erc1155AuctionIndexes[ca][tid][tam]--;
                }
            }
            emit AuctionCancelled(_auctionID, tid);
        }
        if (a.highestBid > 0) {
            uint256 _proceeds = a.highestBid - a.auctionDebt;
            //Fees of pixelcraft,GBM,DAO and Treasury
            uint256 _auctionFees = (_proceeds * 4) / 100;

            //Send the debt + his due incentives from the seller to the highest bidder
            IERC20(s.GHST).transferFrom(a.owner, address(this), _auctionFees + a.dueIncentives + a.auctionDebt);

            //Refund it's bid plus his incentives to the highest bidder
            uint256 ownerShare = _proceeds + a.auctionDebt + a.dueIncentives;
            IERC20(s.GHST).transfer(a.highestBidder, ownerShare);

            //1.5% goes to pixelcraft
            uint256 pixelcraftShare = (_proceeds * 15) / 1000;
            IERC20(s.GHST).transfer(s.pixelcraft, pixelcraftShare);
            //1% goes to GBM
            uint256 GBM = (_proceeds * 1) / 100;
            IERC20(s.GHST).transfer(s.GBMAddress, GBM);
            //0.5% to DAO
            uint256 DAO = (_proceeds * 5) / 1000;
            IERC20(s.GHST).transfer(s.DAO, DAO);
            //1% to treasury
            uint256 Treasury = (_proceeds * 1) / 100;
            IERC20(s.GHST).transfer(s.Treasury, Treasury);

            // Transfer the token to the owner/canceller
            if (a.info.tokenKind == ERC721) {
                _sendTokens(ca, a.owner, ERC721, tid, 1);
                //update storage
                s.erc721AuctionExists[ca][tid] = false;
            }
            if (a.info.tokenKind == ERC1155) {
                _sendTokens(ca, a.owner, ERC1155, tid, tam);
                //update storage
                unchecked {
                    s.erc1155AuctionIndexes[ca][tid][tam]--;
                }
            }

            emit AuctionCancelled(_auctionID, tid);
        }
    }

    /// @notice Register parameters of auction to be used as presets
    /// Throw if the token owner is not the GBM smart contract
    function setAuctionPresets(uint256 _auctionPresetID, Preset calldata _preset) external onlyOwner {
        s.auctionPresets[_auctionPresetID] = _preset;
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
        return s.secondaryMarketTokenContract[s.auctions[_auctionID].contractID];
    }

    function getAuctionStartTime(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].info.startTime;
    }

    function getAuctionEndTime(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].info.endTime;
    }

    function getAuctionHammerTimeDuration(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.hammerTimeDuration;
    }

    function getAuctionBidDecimals(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.bidDecimals;
    }

    function getAuctionStepMin(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.stepMin;
    }

    function getAuctionIncMin(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.incMin;
    }

    function getAuctionIncMax(uint256 _auctionID) public view returns (uint256) {
        return s.auctions[_auctionID].presets.incMax;
    }

    function getAuctionBidMultiplier(uint256 _auctionID) public view returns (uint256) {
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
        uint256 decimaledRatio = ((bidDecimals * getAuctionBidMultiplier(_auctionID) * (_newBidValue - baseBid)) / baseBid) +
            getAuctionIncMin(_auctionID) *
            bidDecimals;

        if (decimaledRatio > (bidDecimals * bidIncMax)) {
            decimaledRatio = bidDecimals * bidIncMax;
        }

        return (_newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
    }

    //mock calls
    function checkPubKey() public view returns (bytes memory) {
        return s.backendPubKey;
    }

    function checkIndex(
        address _contract,
        uint256 id,
        uint256 amount
    ) public view returns (uint256) {
        return s.erc1155AuctionIndexes[_contract][id][amount];
    }

    function changePubKey(bytes calldata _newPubKey) public onlyOwner {
        s.backendPubKey = _newPubKey;
    }
}
