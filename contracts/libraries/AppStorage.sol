// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "./LibDiamond.sol";

bytes4 constant ERC721 = 0x73ad2146;
bytes4 constant ERC1155 = 0x973bb640;

struct InitiatorInfo {
    uint80 startTime;
    uint80 endTime;
    uint64 tokenAmount;
    bytes4 tokenKind;
    uint256 tokenID;
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
}

struct AppStorage {
    address pixelcraft;
    address DAO;
    address GBMAddress;
    address Treasury;
    address GHST;
    mapping(address => bool) contractBiddingAllowed;
    mapping(address=>bool) secondaryMarketTokenContract; //Token contract address=>allowed
    mapping(uint256 => Auction) auctions; //_auctionId => auctions
    mapping(address => mapping(uint256 => uint256)) erc1155TokensIndex; //Contract => TokenID => Amount being auctionned
    bytes backendPubKey;
    mapping(address => mapping(uint256 => bool)) erc721AuctionExists; //Contract => TokenID => Existence
    mapping(uint256 => Preset) auctionPresets; // presestID => Configuration parameters
    uint128 hammerTimeDuration;
    uint128 cancellationTime;
    uint256 auctionNonce;
}

contract Modifiers {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }
}
