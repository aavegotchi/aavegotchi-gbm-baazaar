import {GBMDiamond} from "../GBMDiamond.sol";
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
import "forge-std/Test.sol";
import "./TestHelpers.sol";
import "../libraries/LibSignature.sol";

contract GBMFacetTest is IDiamondCut, DSTest, TestHelpers {
    DiamondCutFacet dcut;
    GBMFacet gFacet;
    GBMDiamond diamond;
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

    uint8 v;
    bytes32 r;
    bytes32 s;

    //FACET DATA

    bytes4[] GBMSELECTORS = generateSelectors("GBMFacet");

    bytes4[] OWNERSHIP_SELECTORS = generateSelectors("OwnershipFacet");
    bytes4[] LOUPE_SELECTORS = generateSelectors("DiamondLoupeFacet");

    string pubKey =
        "18db6dd94c8b8eeeeadbd0f7b4a0050135f086e0ba16f915773652d10e39e409a60a59adc13c2747f8fc4e405a08327849f51a2ed7073eb19f0a815c73dbd399";

    function setUp() public {
        cheat.label(0x07AdeA2EdC30d04f46448E3159aD7aAF0222dB13, "BIDDER2");
        cheat.label(0x9e2f52990b1D802cD6F277ed116b2c76a765C2AF, "BIDDER3");
        cheat.label(address(this), "AUCTIONCREATOR");
        cheat.label(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098, "GBMADDRESS");
        cheat.label(0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64, "PIXELCARFT");

        //deploy diamondCut
        dcut = new DiamondCutFacet();
        //deploy diamond
        diamond = new GBMDiamond(address(this), address(dcut), 20 minutes, 1 hours);
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
            dInit.init.selector,
            fromHex(pubKey),
            address(0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64),
            address(erc20),
            address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098),
            address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098),
            address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098)
        );

        //upgrade diamond with facets
        //GBM
        FacetCut[] memory cut = new FacetCut[](3);
        cut[0] = FacetCut({facetAddress: address(gFacet), action: FacetCutAction.Add, functionSelectors: GBMSELECTORS});
        cut[1] = FacetCut({facetAddress: address(dLoupe), action: FacetCutAction.Add, functionSelectors: LOUPE_SELECTORS});
        cut[2] = FacetCut({facetAddress: address(ownerF), action: FacetCutAction.Add, functionSelectors: OWNERSHIP_SELECTORS});
        IDiamondCut(address(diamond)).diamondCut(cut, address(dInit), payload);

        //INIT SAMPLE ERC721 and ERC1155 AUCTION

        cheat.expectRevert(GBMFacet.UndefinedPreset.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 1 days, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            1
        );

        //set a preset
        //using highest preset
        GBMFacet(address(diamond)).setAuctionPresets(0, Preset(1500, 15000, 18270, 15000, 100000));
        cheat.expectRevert(GBMFacet.ContractNotAllowed.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 1 days, uint56(1), 1, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //set a secondary market
        GBMFacet(address(diamond)).toggleContractWhitelist(address(erc721), true);
        GBMFacet(address(diamond)).toggleContractWhitelist(address(erc1155), true);

        //use incorrect start or end times
        cheat.expectRevert(GBMFacet.StartOrEndTimeTooLow.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp), uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //try to set duration to <1 hour
        cheat.expectRevert(GBMFacet.DurationTooLow.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 200, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //try to set duration to >7 days
        cheat.expectRevert(GBMFacet.DurationTooHigh.selector);
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 605000, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        cheat.expectRevert("ownerOf: ERC721 NFTs assigned to the zero address are considered invalid");
        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //mint two erc721 tokens
        erc721.mint(2);
        cheat.expectRevert("transferFromInternal: msg.sender is not allowed to manipulate the token");

        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //approve diamond
        erc721.setApprovalForAll(address(diamond), true);
        erc1155.setApprovalForAll(address(diamond), true);

        erc721Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
            0
        );

        //mint 7 erc1155 tokens
        erc1155.mint(0, 7);
        cheat.expectRevert(GBMFacet.InsufficientToken.selector);
        erc1155Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(10), 0, bytes4(ERC1155), 0),
            address(erc1155),
            0
        );
        //create auction for 3 erc1155 tokens
        erc1155Auction = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(3), 0, bytes4(ERC1155), 0),
            address(erc1155),
            0
        );

        //creating another auction(with same token,id and amount) should increment index
        erc1155Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(3), 0, bytes4(ERC1155), 0),
            address(erc1155),
            0
        );

        //allow bidding for token contracts
        GBMFacet(address(diamond)).setBiddingAllowed(address(erc721), true);
        GBMFacet(address(diamond)).setBiddingAllowed(address(erc1155), true);

        assertTrue(GBMFacet(address(diamond)).isBiddingAllowed(address(erc1155)));
    }

    function testAuctionModification() public {
        ///MODIFY AUCTION///

        GBMFacet(address(diamond)).getAuctionInfo(erc721Auction);
        cheat.expectRevert(GBMFacet.AuctionExists.selector);

        GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 1),
            address(erc721),
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

        cheat.expectRevert(GBMFacet.DurationTooHigh.selector);
        //try to change auction duration to > 7 days
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp + 8 days), 0, ERC721);

        //change the expiry time
        GBMFacet(address(diamond)).modifyAuction(erc721Auction, uint80(block.timestamp + 4 days), 0, ERC721);
        uint256 endTime = GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction);
        assertEq(endTime, block.timestamp + 4 days);

        //ERC1155 AUCTION MODIFICATION
        //modify erc1155 auction by reducing it to 2 tokens
        GBMFacet(address(diamond)).modifyAuction(erc1155Auction, uint80(block.timestamp) + 3 days, uint56(2), bytes4(ERC1155));
        //auction creator should be refunded 1 token
        assertEq(erc1155.balanceOf(address(this), 0), 2);

        //modify auction by increasing to 4 tokens
        GBMFacet(address(diamond)).modifyAuction(erc1155Auction, uint80(block.timestamp) + 3 days, uint56(4), bytes4(ERC1155));
        //auction creator should have 1 token left
        assertEq(erc1155.balanceOf(address(this), 0), 0);
    }

    function testAuctionBidsAndClaim() public {
        cheat.startPrank(bidder2);
        //bidder2 bids
        erc20.approve(address(diamond), 100000e18);

        bytes memory sig = constructSig(bidder2, erc721Auction, 100e18, 10, bidder2priv);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.UnmatchedHighestBid.selector, 0));
        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 10, address(erc721), 1, 1, sig);

        sig = constructSig(bidder2, erc721Auction, 100e18, 0, bidder2priv);

        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 0, address(erc721), 1, 1, sig);
        GBMFacet(address(diamond)).getAuctionInfo(erc721Auction);
        cheat.stopPrank();
        cheat.startPrank(bidder3);
        erc20.approve(address(diamond), 100000e18);
        cheat.expectRevert(GBMFacet.MinBidNotMet.selector);
        sig = constructSig(bidder3, erc721Auction, 100e18, 100e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc721Auction, 100e18, 100e18, address(erc721), 1, 1, sig);
        sig = constructSig(bidder3, erc721Auction, 150e18, 100e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc721Auction, 150e18, 100e18, address(erc721), 1, 1, sig);
        cheat.stopPrank();

        //can successfully bid on ERC1155 auctions too

        sig = constructSig(bidder2, erc1155Auction, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        //Test all onchain bid auths
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "tokenContract"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, address(0xdead), 0, 1, sig);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "tokenID"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, address(erc1155), 9, 1, sig);
        cheat.expectRevert(abi.encodeWithSelector(GBMFacet.InvalidAuctionParams.selector, "amount"));
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, address(erc1155), 0, 90, sig);

        //bidder2 bids 100ghst
        GBMFacet(address(diamond)).getAuctionInfo(erc1155Auction);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 100e18, 0, address(erc1155), 0, 3, sig);

        cheat.stopPrank();
        //bidder3 bids 150ghst
        sig = constructSig(bidder3, erc1155Auction, 150e18, 100e18, bidder2priv);
        cheat.startPrank(bidder3);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 150e18, 100e18, address(erc1155), 0, 3, sig);

        //can't claim non-existent auction
        cheat.expectRevert(GBMFacet.NoAuction.selector);
        GBMFacet(address(diamond)).claim(100);

        //can't claim an ongoing auction
        //auction should have passed hammerTime + cancellationTime
        cheat.expectRevert(
            abi.encodeWithSelector(
                GBMFacet.ClaimNotReady.selector,
                GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction) + 20 minutes + 1 hours
            )
        );
        GBMFacet(address(diamond)).claim(erc721Auction);
        uint256 oldEndTime = GBMFacet(address(diamond)).getAuctionEndTime(erc1155Auction);
        cheat.stopPrank();
        //can't claim for someone else
        cheat.expectRevert("NotHighestBidderOrOwner");
        cheat.startPrank(bidder2);
        cheat.warp(block.timestamp + 3 days + 20 minutes + 1 hours);
        GBMFacet(address(diamond)).claim(erc721Auction);

        //make sure bidding during hammertime extends duration
        cheat.warp(block.timestamp - 20 minutes - 1 hours);
        //bid again during hammer time with bidder2
        sig = constructSig(bidder2, erc1155Auction, 200e18, 150e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 200e18, 150e18, address(erc1155), 0, 3, sig);
        uint256 newEndTime = GBMFacet(address(diamond)).getAuctionEndTime(erc1155Auction);
        //make sure endTime is extended by 20minutes
        assertEq(newEndTime, oldEndTime + 20 minutes);
        cheat.stopPrank();
        //claim erc721 auction
        cheat.warp(block.timestamp + 20 minutes);
        cheat.startPrank(bidder3);
        //erc1155 auction outbid by bidder3
        //which also extends duration by 20 minutes
        sig = constructSig(bidder3, erc1155Auction, 250e18, 200e18, bidder2priv);
        GBMFacet(address(diamond)).commitBid(erc1155Auction, 250e18, 200e18, address(erc1155), 0, 3, sig);
        GBMFacet(address(diamond)).getAuctionEndTime(erc1155Auction);
        //since auction has been extended twice
        cheat.warp(block.timestamp + 40 minutes + 1 hours);
        GBMFacet(address(diamond)).claim(erc721Auction);
        assertEq(erc721.ownerOf(1), bidder3);

        //can't claim already claimed auction
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc721Auction);
        cheat.stopPrank();

        //claim erc1155 auction
        //this time owner claims
        //owner doesn't need to wait for cancellationTime
        cheat.warp(block.timestamp - 1 hours);
        GBMFacet(address(diamond)).claim(erc1155Auction);
    }

    function testAuctionCancellation() public {
        //initialize a new auction for erc721
        uint256 erc721Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 2),
            address(erc721),
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
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC721), 2),
            address(erc721),
            0
        );

        //initialize a new auction for erc1155
        erc1155Auction2 = GBMFacet(address(diamond)).createAuction(
            InitiatorInfo(uint80(block.timestamp), uint80(block.timestamp) + 3 days, uint56(1), 0, bytes4(ERC1155), 0),
            address(erc1155),
            0
        );
        //bidder2 bids 100
        bytes memory sig = constructSig(bidder2, erc721Auction2, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        erc20.approve(address(diamond), 100000e18);
        GBMFacet(address(diamond)).commitBid(erc721Auction2, 100e18, 0, address(erc721), 2, 1, sig);
        cheat.stopPrank();
        //outbid by bidder 3
        sig = constructSig(bidder3, erc721Auction2, 150e18, 100e18, bidder2priv);
        cheat.startPrank(bidder3);
        erc20.approve(address(diamond), 100000e18);
        GBMFacet(address(diamond)).commitBid(erc721Auction2, 150e18, 100e18, address(erc721), 2, 1, sig);

        //FOR ERC1155
        //bidder2 bids 100ghst
        cheat.stopPrank();
        sig = constructSig(bidder2, erc1155Auction2, 100e18, 0, bidder2priv);
        cheat.startPrank(bidder2);
        GBMFacet(address(diamond)).commitBid(erc1155Auction2, 100e18, 0, address(erc1155), 0, 1, sig);
        cheat.stopPrank();
        //outbid by bidder 3
        sig = constructSig(bidder3, erc1155Auction2, 150e18, 100e18, bidder2priv);
        cheat.startPrank(bidder3);

        GBMFacet(address(diamond)).commitBid(erc1155Auction2, 150e18, 100e18, address(erc1155), 0, 1, sig);

        cheat.stopPrank();

        GBMFacet(address(diamond)).getAuctionEndTime(erc721Auction2);
        cheat.warp(block.timestamp + 3 days + 3601);
        //can't cancel auction after cancellation time
        cheat.expectRevert(GBMFacet.CancellationTimeExceeded.selector);
        GBMFacet(address(diamond)).cancelAuction(erc721Auction2);

        //jump to a time between endTime+ cancellation time
        cheat.warp(block.timestamp - 1400);

        //  cheat.stopPrank();
        GBMFacet(address(diamond)).cancelAuction(erc721Auction2);
        cheat.prank(bidder3);
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc721Auction2);

        //test for erc1155 auction cancellations too

        GBMFacet(address(diamond)).cancelAuction(erc1155Auction2);
        cheat.prank(bidder3);
        cheat.expectRevert(GBMFacet.AuctionClaimed.selector);
        GBMFacet(address(diamond)).claim(erc1155Auction2);
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

    function generateSelectors(string memory _facetName) internal returns (bytes4[] memory selectors) {
        string[] memory cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "scripts/genSelectors.js";
        cmd[2] = _facetName;
        bytes memory res = cheat.ffi(cmd);
        selectors = abi.decode(res, (bytes4[]));
    }
}
