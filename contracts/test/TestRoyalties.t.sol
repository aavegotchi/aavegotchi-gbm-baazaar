import {GBMFacet} from "../facets/GBMFacet.sol";
import "../interfaces/IDiamondCut.sol";
import {OwnershipFacet} from "../facets/OwnershipFacet.sol";
import "forge-std/Test.sol";

import "../libraries/AppStorage.sol";

contract RoyaltyTests is IDiamondCut, Test {
    GBMFacet gFacet;
    address Diamond = 0xD5543237C656f25EEA69f1E247b8Fa59ba353306;
    uint256 auctionId = 264;

    bytes4[] GBMSELECTORS = generateSelectors("GBMFacet");

    function setUp() public {
        address owner = OwnershipFacet(Diamond).owner();
        vm.startPrank(owner);
        gFacet = new GBMFacet();
        FacetCut[] memory cut = new FacetCut[](1);
        cut[0] = FacetCut({facetAddress: address(gFacet), action: FacetCutAction.Replace, functionSelectors: GBMSELECTORS});
        IDiamondCut(Diamond).diamondCut(cut, address(0), "");
        vm.stopPrank();
    }

    function testRoyalties() public {
        Auction memory a = GBMFacet(Diamond).getAuctionInfo(auctionId);
        vm.startPrank(a.owner);
        vm.warp(a.info.endTime + 30);
        GBMFacet(Diamond).claim(auctionId);
    }

    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external override {}

    function generateSelectors(string memory _facetName) internal returns (bytes4[] memory selectors) {
        string[] memory cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "scripts/genSelectors.js";
        cmd[2] = _facetName;
        bytes memory res = vm.ffi(cmd);
        selectors = abi.decode(res, (bytes4[]));
    }
}
