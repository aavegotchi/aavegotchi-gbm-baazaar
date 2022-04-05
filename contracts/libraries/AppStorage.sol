// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {LibDiamond} from "./LibDiamond.sol";

//Struct used to store the representation of an NFT being auctionned
// struct TokenRepresentation {
//     address contractAddress; // The contract address
//     uint256 tokenId; // The ID of the token on the contract
//     bytes4 tokenKind; // The ERC name of the token implementation bytes4(keccak256("ERC721")) or bytes4(keccak256("ERC1155"))
//     uint256 tokenAmount; // The amount of units that are sold in the auction
// }

// struct ContractAddresses {
//     address pixelcraft;
//     address daoTreasury;
//     // address erc20Currency;
// }
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
    uint240 bidDecimals;
    uint16 hammerTimeDuration;
}
struct Auction {
    address owner;
    uint96 highestBid;
    address highestBidder;
    uint88 auctionDebt;
    uint88 dueIncentives;
    bool biddingAllowed;
    bool claimed;
    uint160 contractID;
    InitiatorInfo info;
    Preset presets;
}

// struct Collection {
//     uint256 startTime;
//     uint256 endTime;
//     uint256 hammerTimeDuration;
//     uint256 bidDecimals;
//     uint256 stepMin;
//     uint256 incMin; // minimal earned incentives
//     uint256 incMax; // maximal earned incentives
//     uint256 bidMultiplier; // bid incentive growth multiplier
//     bool biddingAllowed; // Allow to start/pause ongoing auctions
// }

struct AppStorage {
    address pixelcraft;
    address daoTreasury;
    address GBMAddrress;
    address GHST;
    mapping(address => bool) biddingAllowed;
    // mapping(uint256 => TokenRepresentation) tokenMapping; //_auctionId => token_primaryKey
    //DEPRECATED DUE TO DUAL TOKEN ID SAME CONTRACT
    //mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auctionMapping; // contractAddress => tokenId => TokenIndex => _auctionId
    //var storing individual auction settings. if != null, they take priority over collection settings
    mapping(uint256 => Auction) auctions; //_auctionId => auctions
    mapping(uint256 => bool) auctionItemClaimed;
    // //var storing contract wide settings. Those are used if no auctionId specific parameters is initialized
    // // mapping(address => Collection) collections; //tokencontract => collections
    mapping(address => mapping(uint256 => uint256)) erc1155TokensIndex; //Contract => TokenID => Amount being auctionned
    //mapping(address => mapping(uint256 => uint256)) erc1155TokensUnderAuction; //Contract => TokenID => Amount being auctionned
    bytes backendPubKey;
    //Secondary market patch
    // mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auction721Mapping; // contractAddress => tokenId => TokenIndex => _auctionId
    // mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auction1155Mapping; // contractAddress => tokenId => TokenIndex => _auctionId
    mapping(address => mapping(uint256 => bool)) erc721AuctionExists; //Contract => TokenID => Existence
    //mapping(address => mapping(uint256 => mapping(uint256 => bool))) erc1155AuctionExists; //Contract=>TokenID=>Amount=>Existence
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) erc1155AuctionIndexes; //Contract=>TokenID=>Amount=>maxIndex;
    //TODO:remove
    // mapping(uint256 => address) auctionSeller; //auctionID => Auction seller Mapping storing who is the seller of a token for a specific auction.
    mapping(uint256 => Preset) auctionPresets; // presestID => Configuration parameters
    mapping(uint256 => address) secondaryMarketTokenContract; //tokenContractId => Token contract address
}

contract Modifiers {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }
}
