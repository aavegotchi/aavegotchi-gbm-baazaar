import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function deployTestGBMUpgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "TestGBMFacet",
      addSelectors: [
        "   function mockCommitBid(uint256 _auctionID, uint256 _bidAmount, uint256 _highestBid, address _tokenContract, uint256 _tokenID,  uint256 _amount,bool _inGame) external",
        "  function mockGetAuctionHammerTimeDuration() public view returns (uint256)",
        " function mockGetAuctionBidDecimals(uint256 _auctionID) public view returns (uint256) ",
        "function mockGetAuctionStepMin(uint256 _auctionID) public view returns (uint64)",
        "function mockGetAuctionIncMin(uint256 _auctionID) public view returns (uint64)",
        " function mockGetAuctionIncMax(uint256 _auctionID) public view returns (uint64) ",
        " function mockGetAuctionBidMultiplier(uint256 _auctionID) public view returns (uint64)",
        " function mockGetAuctionEndTime(uint256 _auctionID) public view returns (uint256)",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployTestGBMUpgrade()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
