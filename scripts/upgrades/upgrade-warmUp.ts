//@ts-ignore
import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { GBMFacet__factory } from "../../typechain";
import { GBMFacetInterface } from "../../typechain/GBMFacet";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

import { maticDiamondAddress, maticDiamondUpgrader } from "../helperFunctions";

export async function deployWarmupUpgrade() {
  const IniatorInfo =
    "tuple(uint80 startTime,uint80 endTime,uint56 tokenAmount,uint8 category,bytes4 tokenKind,uint256 tokenID)";
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        "function getAuctionWarmupEndTime(uint256 _auctionID) public view returns (uint256)",
        "function getDefaultAuctionWarmUpDuration() public view returns (uint256)",
        "function setDefaultAuctionWarmupDuration(uint256 _newDefaultWarmupDuration) public",
        `function createAuction(${IniatorInfo} calldata _info,address _tokenContract,uint256 _auctionPresetID,bool _withWarmup,uint256 _warmupPeriodInSeconds)`,
      ],
      removeSelectors: [
        //"function createAuction((uint80 startTime,uint80 endTime,uint56 tokenAmount,uint8 category,bytes4 tokenKind,uint256 tokenID),address _tokenContract,uint256 _auctionPresetID",
      ],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);
  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;

  //2 minutes default warmup duration
  const calldata = iface.encodeFunctionData("setDefaultAuctionWarmupDuration", [
    120,
  ]);
  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: maticGBMDiamond,
    initCalldata: calldata,
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployWarmupUpgrade()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
