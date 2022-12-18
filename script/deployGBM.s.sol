// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import {GBMDiamond} from "../contracts/GBMDiamond.sol";
import {DiamondInit} from "../contracts/upgradeInitializers/DiamondInit.sol";
import {GBMFacet} from "../contracts/facets/GBMFacet.sol";
import {DiamondCutFacet} from "../contracts/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../contracts/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../contracts/facets/OwnershipFacet.sol";
import {IDiamondCut} from "../contracts/interfaces/IDiamondCut.sol";
import {Preset} from "../contracts/libraries/AppStorage.sol";

contract GBMDeploy is Script, IDiamondCut {
    // struct Preset {
    //     uint64 incMin;
    //     uint64 incMax;
    //     uint64 bidMultiplier;
    //     uint64 stepMin;
    //     uint256 bidDecimals;
    // }

    address ERC20 = 0xc93A55a39356BddA580036Ce50044C106Dd211c8;
    address ERC721 = 0xdE492281AF1Eee056CaC72Ae139003506e02255d;
    address ERC1155 = 0x7d78a7371F09844d42F51d7121457555D98A05d1;
    address DiamondOwner = 0x6d63dC5A225A4563D8Dcb941e312151b651EDB0e;
    address GBMDiamondAddress = 0xd6F59C1bE030Af4a9b7Fbf44e01bD2f2A0d54488;
    bytes pubKey =
        hex"8a173f740878128ee63e08f8f05bbbd1627a57261aff5645333dbdd637723c10c46a6d77be6e766c84f21035988eeac9a37c20f189bf63e218786f83989520bd";

    DiamondCutFacet dcut;
    GBMFacet gFacet;
    GBMDiamond diamond;
    DiamondInit dInit;
    DiamondLoupeFacet dLoupe;
    OwnershipFacet ownerF;

    function setUp() public {}

    function run() public {
        bytes4[] memory GBMSELECTORS = generateSelectors("GBMFacet");
        bytes4[] memory OWNERSHIP_SELECTORS = generateSelectors("OwnershipFacet");
        bytes4[] memory LOUPE_SELECTORS = generateSelectors("DiamondLoupeFacet");
        vm.startBroadcast();
        // dcut = new DiamondCutFacet();
        // diamond = new GBMDiamond(DiamondOwner, address(dcut), 20 minutes, 1 hours);
        // //deploy diamondInit
        // dInit = new DiamondInit();
        // gFacet = new GBMFacet();

        // //deploy other facets
        // dLoupe = new DiamondLoupeFacet();
        // ownerF = new OwnershipFacet();

        // //generate init payload
        // bytes memory payload = abi.encodeWithSelector(
        //     dInit.init.selector,
        //     pubKey,
        //     address(0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64),
        //     ERC20,
        //     address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098),
        //     address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098),
        //     address(0x27DF5C6dcd360f372e23d5e63645eC0072D0C098)
        // );

        // //upgrade diamond with facets
        // //GBM
        // FacetCut[] memory cut = new FacetCut[](3);
        // cut[0] = FacetCut({facetAddress: address(gFacet), action: FacetCutAction.Add, functionSelectors: GBMSELECTORS});
        // cut[1] = FacetCut({facetAddress: address(dLoupe), action: FacetCutAction.Add, functionSelectors: LOUPE_SELECTORS});
        // cut[2] = FacetCut({facetAddress: address(ownerF), action: FacetCutAction.Add, functionSelectors: OWNERSHIP_SELECTORS});
        // IDiamondCut(address(diamond)).diamondCut(cut, address(dInit), payload);

        // set presets
        GBMFacet(GBMDiamondAddress).setAuctionPresets(0, Preset(500, 1000, 500, 10000, 100000));
        GBMFacet(GBMDiamondAddress).setAuctionPresets(1, Preset(500, 5000, 4970, 5000, 100000));
        GBMFacet(GBMDiamondAddress).setAuctionPresets(2, Preset(1000, 10000, 11000, 10000, 100000));

        //enable NFT addresses
        GBMFacet(GBMDiamondAddress).toggleContractWhitelist(ERC721, true);
        GBMFacet(GBMDiamondAddress).toggleContractWhitelist(ERC1155, true);

        //allow bidding
        GBMFacet(GBMDiamondAddress).setBiddingAllowed(ERC721, true);
        GBMFacet(GBMDiamondAddress).setBiddingAllowed(ERC1155, true);

        vm.stopBroadcast();
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
