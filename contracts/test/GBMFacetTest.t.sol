import {Diamond} from "../Diamond.sol";
import {DiamondInit} from "../upgradeInitializers/DiamondInit.sol";
import {GBMFacet} from "../facets/GBMFacet.sol";
import {DiamondCutFacet} from "../facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../facets/OwnershipFacet.sol";
import "../interfaces/IDiamondCut.sol";
import "../libraries/AppStorage.sol";
import "../test/ERC1155Generic.sol";
import "../test/ERC20Generic.sol";
import "../test/ERC721Generic.sol";
import "../../lib/ds-test/src/cheat.sol";
import "../../lib/ds-test/src/console.sol";
import "../../lib/ds-test/src/test.sol";
import "./TestHelpers.sol";
import "../libraries/LibSignature.sol";

contract GBMFacetTest is IDiamondCut, DSTest, TestHelpers {
    DiamondCutFacet dcut;
    GBMFacet gFacet;
    Diamond diamond;
    DiamondInit dInit;
    DiamondLoupeFacet dLoupe;
    OwnershipFacet ownerF;
    ERC1155Generic erc1155;
    ERC721Generic erc721;
    ERC20Generic erc20;
    uint256 erc721Auction;
    uint256 erc1155Auction;
    uint256 erc1155Auction2;

    event out(bytes4 iii);
    event outuint(uint256 ii);

    //BURNER ACCTS..DO NOT USE IN PROD
    address bidder2 = 0x07AdeA2EdC30d04f46448E3159aD7aAF0222dB13;
    address bidder3 = 0x9e2f52990b1D802cD6F277ed116b2c76a765C2AF;

    uint256 bidder2priv = 0x18329f54ac729d4765e74e32b1bf7a5ced7a2c0136a03ce18ed1590d43f39890;
    // uint8 v;
    // bytes32 r;
    // bytes32 s;

    ////FACET DATA
    // FacetCut[] cut;
    bytes4[] GBMSELECTORS = [
        bytes4(0xbc292782),
        0x96b5a755,
        0x0b93ba1c,
        0x379607f5,
        0x8ab03e31,
        0x7184e85d,
        0x4d5126c1,
        0x3f21cf81,
        0xda081c94,
        0x6b9a894e,
        0x03ea66a4,
        0x930e79f1,
        0x470e9f8d,
        0xc26e748c,
        0xdfab114b,
        0xdb145701,
        0xef8c55fd,
        0xfc3fc4ed,
        0x5608de71,
        0x919e84f5,
        0xe07bc69c,
        0xaefa7d98,
        0x14ff5ea3,
        0x0facebea,
        0x1a64ba1f,
        0xbc197c81,
        0xf23a6e61,
        0x150b7a02,
        0x10e77df8,
        0x50d265d4,
        0x199da6b4,
        0x66ab9575
    ];

    bytes4[] OWNERSHIP_SELECTORS = [bytes4(0xf2fde38b), 0x8da5cb5b];
    bytes4[] LOUPE_SELECTORS = [bytes4(0x7a0ed627), 0xadfca15e, 0x52ef6b2c, 0xcdffacc6, 0x01ffc9a7];

    string pubKey =
        "18db6dd94c8b8eeeeadbd0f7b4a0050135f086e0ba16f915773652d10e39e409a60a59adc13c2747f8fc4e405a08327849f51a2ed7073eb19f0a815c73dbd399";

    function setUp() public {
        cheat.label(0x07AdeA2EdC30d04f46448E3159aD7aAF0222dB13, "BIDDER2");
        cheat.label(0x9e2f52990b1D802cD6F277ed116b2c76a765C2AF, "BIDDER3");
        cheat.label(address(this), "AUCTIONCREATOR");

        //deploy diamondCut
        dcut = new DiamondCutFacet();
        //deploy diamond
        diamond = new Diamond(0xb4c79daB8f259C7Aee6E5b2Aa729821864227e84, address(dcut));
        //deploy diamondInit
        dInit = new DiamondInit();
        gFacet = new GBMFacet();

        //deploy other facets
        dLoupe = new DiamondLoupeFacet();
        ownerF = new OwnershipFacet();

        //deploy test tokens
        erc1155 = new ERC1155Generic();
        erc721 = new ERC721Generic();
        erc20 = new ERC20Generic();

        erc20.mint(1000e18, address(this));
        erc20.mint(1000e18, msg.sender);
        erc20.mint(1000e18, bidder2);
        erc20.mint(1000e18, bidder3);

        //generate init payload
        bytes memory payload = abi.encodeWithSelector(
            bytes4(0x8c63feb4),
            fromHex(pubKey),
            address(0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64),
            address(erc20),
            address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098)
        );

        //upgrade diamond with facets
        //GBM
        FacetCut[] memory cut = new FacetCut[](3);
        cut[0] = (FacetCut({facetAddress: address(gFacet), action: FacetCutAction.Add, functionSelectors: GBMSELECTORS}));
        cut[1] = (FacetCut({facetAddress: address(dLoupe), action: FacetCutAction.Add, functionSelectors: LOUPE_SELECTORS}));
        cut[2] = (FacetCut({facetAddress: address(ownerF), action: FacetCutAction.Add, functionSelectors: OWNERSHIP_SELECTORS}));
        IDiamondCut(address(diamond)).diamondCut(cut, address(dInit), payload);

        //INIT SAMPLE ERC721 and ERC1155 AUCTION

        cheat.expectRevert(GBMFacet.UndefinedPreset.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 1 days, uint64(1), bytes4(ERC721), 1),
            1100,
            1
        );

        //set a preset
        //using highest preset
        GBMFacet(address(diamond)).setAuctionPresets(0, Preset(1500, 15000, 18270, 15000, 100000, 1200));
        cheat.expectRevert(GBMFacet.NoSecondaryMarket.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 1 days, uint64(1), bytes4(ERC721), 1),
            1100,
            0
        );

        //set a secondary market
        GBMFacet(address(diamond)).enableContract(10, address(erc721));
        GBMFacet(address(diamond)).enableContract(11, address(erc1155));

        //use incorrect start or end times
        cheat.expectRevert(GBMFacet.StartOrEndTimeTooLow.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp), uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        //try to set duration to <1 hour
        cheat.expectRevert(GBMFacet.DurationTooLow.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 200, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        //try to set duration to >7 days
        cheat.expectRevert(GBMFacet.DurationTooHigh.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 605000, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        cheat.expectRevert("ownerOf: ERC721 NFTs assigned to the zero address are considered invalid");
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        //mint two erc721 tokens
        erc721.mint(2);
        cheat.expectRevert("transferFromInternal: msg.sender is not allowed to manipulate the token");

        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        //approve diamond
        erc721.setApprovalForAll(address(diamond), true);
        erc1155.setApprovalForAll(address(diamond), true);

        erc721Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        //mint 7 erc1155 tokens
        erc1155.mint(0, 7);
        cheat.expectRevert(GBMFacet.InsufficientToken.selector);
        erc1155Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(10), bytes4(ERC1155), 0),
            11,
            0
        );
        //create auction for 3 erc1155 tokens
        erc1155Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(3), bytes4(ERC1155), 0),
            11,
            0
        );
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 3), 1);
        //creating another auction(with same token,id and amount) should increment index
        erc1155Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(3), bytes4(ERC1155), 0),
            11,
            0
        );
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 3), 2);
    }

    function testAuctionModification() public {
        ///MODIFY AUCTION///

        GBMFacet(address(diamond)).getAuctionInfo(erc721Auction);
        cheat.expectRevert(GBMFacet.AuctionExists.selector);

        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 1),
            10,
            0
        );

        cheat.expectRevert(GBMFacet.NoAuction.selector);
        GBMFacet(address(diamond)).modifyAuction(233, uint80(block.timestamp), 0, ERC721);

        cheat.expectRevert(GBMFacet.NotAuctionOwner.selector);
        cheat.prank(bidder2);
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp), 0, ERC721);
        cheat.expectRevert(GBMFacet.TokenTypeMismatch.selector);
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp), 0, ERC1155);

        //try to set to the past
        cheat.expectRevert(GBMFacet.EndTimeTooLow.selector);
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp), 0, ERC721);

        //change the expiry time
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp + 4 days), 0, ERC721);
        uint256 endTime = GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction);
        assertEq(endTime, block.timestamp + 4 days);

        //ERC1155 AUCTION MODIFICATION
        emit log_uint(erc1155.balanceOf(address(this), 0));
        //modify erc1155 auction by reducing it to 2 tokens
        GBMFacet(address(diamond)).modifyAuction(erc1155Auction, uint80(block.timestamp) + 3 days, uint64(2), bytes4(ERC1155));
        //auction creator should be refunded 1 token
        assertEq(erc1155.balanceOf(address(this), 0), 2);
        //index for 3 tokens should be reduced
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 3), 1);
        //index for 2 tokens should be added
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 2), 1);

        //modify auction by increasing to 4 tokens
        GBMFacet(address(diamond)).modifyAuction(erc1155Auction, uint80(block.timestamp) + 3 days, uint64(4), bytes4(ERC1155));
        //auction creator should have 1 token left
        assertEq(erc1155.balanceOf(address(this), 0), 0);
        //index for 2 tokens should be reduced
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 2), 0);
        //index for 4 tokens should be added
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 4), 1);
    }

    function testAuctionBidsAndClaim() public {
        cheat.startPrank(bidder2);
        //bidder2 bids
        erc20.approve(address(diamond), 100000e18);

        bytes memory sig = constructSig(bidder2, erc721Auction, 100e18, 10, bidder2priv);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.UnmatchedHighestBid.selector, 0));
        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 10, 10, 1, 1, sig);

        sig = constructSig(bidder2, erc721Auction, 100e18, 0, bidder2priv);

        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 0, 10, 1, 1, sig);
        GBMFacet(address(diamond)).getAuctionInfo(erc721Auction);
        cheat.stopPrank();
        cheat.startPrank(bidder3);
        erc20.approve(address(diamond), 100000e18);
        cheat.expectRevert(GBMFacet.MinBidNotMet.selector);
        sig = constructSig(bidder3, erc721Auction, 100e18, 100e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 100e18, 10, 1, 1, sig);
        sig = constructSig(bidder3, erc721Auction, 150e18, 100e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc721Auction, 150e18, 100e18, 10, 1, 1, sig);
        cheat.stopPrank();

        //can successfully bid on ERC1155 auctions too

        sig = constructSig(bidder2, erc1155Auction, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        //Test all onchain bid auths
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "contractID"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, 111, 0, 1, sig);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "tokenID"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, 11, 9, 1, sig);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "amount"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, 11, 0, 90, sig);

        //bidder2 bids 100ghst
        GBMFacet(address(diamond)).getAuctionInfo(erc1155Auction);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, 11, 0, 3, sig);

        cheat.stopPrank();
        //bidder3 bids 150ghst
        sig = constructSig(bidder3, erc1155Auction, 150e18, 100e18, bidder2priv);
        cheat.prank(bidder3);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 150e18, 100e18, 11, 0, 3, sig);

        //can't claim non-existent auction
        cheat.expectRevert(GBMFacet.NoAuction.selector);
        GBMFacet(address(diamond)).claim(100);

        //can't claim an ongoing auction
        cheat.expectRevert(
            abi.encodeWithSelector(GBMFacet.AuctionNotEnded.selector, GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction) + 1200)
        );
        GBMFacet(address(diamond)).claim(erc721Auction);

        //can't claim for someone else
        cheat.expectRevert("NotHighestBidderOrOwner");
        //jump through 4days+hammer time
        cheat.warp(block.timestamp + 4 days);
        cheat.stopPrank();
        cheat.prank(bidder2);
        GBMFacet(address(diamond)).claim(erc721Auction);
        cheat.prank(bidder3);

        //claim erc721 auction
        GBMFacet(address(diamond)).claim(erc721Auction);
        assertEq(erc721.ownerOf(1), bidder3);

        //claim erc1155 auction
        //this time owner claims
        //cheat.stopPrank();
        GBMFacet(address(diamond)).claim(erc1155Auction);
        //reduce index for erc1155 auction
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 4), 0);

        cheat.prank(bidder3);
        //can't claim already claimed auction
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc721Auction);
    }

    function testAuctionCancellation() public {
        //initialize a new auction for erc721
        uint256 erc721Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 2),
            10,
            0
        );

        erc20.approve(address(diamond), 10000000e18);
        //can't cancel when auction hasn't ended
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.AuctionNotEnded.selector, GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction2)));
        GBMFacet(address(diamond)).cancelAuction(erc721Auction2);
        //jump to a time between endTime and hammer time
        cheat.warp(block.timestamp + 3 days + 100);
        //successfully cancel auction
        GBMFacet(address(diamond)).cancelAuction(erc721Auction2);
        assertEq(erc721.ownerOf(2), address(this));
        //verify auction cancellation by opening another auction with same params
        erc721Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC721), 2),
            10,
            0
        );

        //initialize a new auction for erc1155
        erc1155Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint64(1), bytes4(ERC1155), 0),
            11,
            0
        );
        //bidder2 bids 100
        bytes memory sig = constructSig(bidder2, erc721Auction2, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        erc20.approve(address(diamond), 100000e18);
        GBMFacet(address(diamond)).commitBid(erc721Auction2, 100e18, 0, 10, 2, 1, sig);
        cheat.stopPrank();
        //outbid by bidder 3
        sig = constructSig(bidder3, erc721Auction2, 150e18, 100e18, bidder2priv);
        cheat.startPrank(bidder3);
        erc20.approve(address(diamond), 100000e18);
        GBMFacet(address(diamond)).commitBid(erc721Auction2, 150e18, 100e18, 10, 2, 1, sig);

        //FOR ERC1155
        //bidder2 bids 100ghst
        cheat.stopPrank();
        sig = constructSig(bidder2, erc1155Auction2, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        GBMFacet(address(diamond)).commitBid(erc1155Auction2, 100e18, 0, 11, 0, 1, sig);
        cheat.stopPrank();
        //outbid by bidder 3
        sig = constructSig(bidder3, erc1155Auction2, 150e18, 100e18, bidder2priv);
        cheat.startPrank(bidder3);

        GBMFacet(address(diamond)).commitBid(erc1155Auction2, 150e18, 100e18, 11, 0, 1, sig);

        cheat.stopPrank();

        //jump to a time between endTime and hammer time
        cheat.warp(block.timestamp + 3 days + 100);

        cheat.stopPrank();
        GBMFacet(address(diamond)).cancelAuction(erc721Auction2);
        cheat.prank(bidder3);
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc721Auction2);

        //test for erc1155 auction cancellations too

        GBMFacet(address(diamond)).cancelAuction(erc1155Auction2);
        cheat.prank(bidder3);
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc1155Auction2);

        //confirm that index decreases
        assertEq(GBMFacet(address(diamond)).checkIndex(address(erc1155), 0, 1), 0);
    }

    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external override {}

    function onERC1155Received(
        address, /* _operator */
        address, /* _from */
        uint256, /* _id */
        uint256, /* _value */
        bytes calldata /* _data */
    ) external pure returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC721Received(
        address, /* _operator */
        address, /*  _from */
        uint256, /*  _tokenId */
        bytes calldata /* _data */
    ) external pure returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }
}
