// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "./LibDiamond.sol";

bytes4 constant ERC721 = 0x73ad2146;
bytes4 constant ERC1155 = 0x973bb640;

struct InitiatorInfo {
    uint80 startTime;
    uint80 endTime;
    uint56 tokenAmount;
    uint8 category; //0 = portal 1 = open portal 2 = pending 3 = aavegotchi
    bytes4 tokenKind;
    uint256 tokenID;
    uint96 buyItNowPrice;
    uint96 startingBid;
}

//Generic presets
struct Preset {
    uint64 incMin;
    uint64 incMax;
    uint64 bidMultiplier;
    uint64 stepMin;
    uint256 bidDecimals;
}

struct Auction {
    address owner;
    uint96 highestBid;
    address highestBidder;
    uint88 auctionDebt;
    uint88 dueIncentives;
    bool biddingAllowed;
    bool claimed;
    address tokenContract;
    InitiatorInfo info;
    Preset presets;
    uint96 buyItNowPrice;
    uint96 startingBid;
}

struct AppStorage {
    address pixelcraft;
    address DAO;
    address GBMAddress;
    address rarityFarming;
    address GHST;
    mapping(address => bool) contractBiddingAllowed;
    mapping(address => bool) contractAllowed; //Token contract address=>allowed
    mapping(uint256 => Auction) auctions; //_auctionId => auctions
    mapping(address => mapping(uint256 => uint256)) erc1155TokensIndex; //Contract => TokenID => Amount being auctionned
    bytes backendPubKey;
    mapping(address => mapping(uint256 => bool)) erc721AuctionExists; //Contract => TokenID => Existence
    mapping(uint256 => Preset) auctionPresets; // presestID => Configuration parameters
    uint128 hammerTimeDuration;
    uint128 cancellationTime;
    uint256 auctionNonce;
    uint256 buyItNowInvalidationThreshold; //The % (eg : 70% is 70) after which the highest bid disable the buy now price
    bool diamondPaused;
}

contract Modifiers {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    modifier diamondNotPaused() {
        ///we exempt diamond owner from the freeze
        if (msg.sender != LibDiamond.contractOwner()) {
            require(!s.diamondPaused, "AppStorage: Diamond paused");
        }
        _;
    }
}
