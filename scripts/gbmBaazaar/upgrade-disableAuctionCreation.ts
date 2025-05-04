//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function upgradeAddClaimAll() {

    //upgrade also handles the splitting of GBMFacet

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function toggleCreateAuctionAllowed() external onlyOwner`,
      ],
      removeSelectors: [
        `function getAuctionPresets(uint256)`,
        `function getAuctionInfo(uint256)`,
        `function getAuctionHighestBidder(uint256)`,
        `function getAuctionHighestBid(uint256)`,
        `function getAuctionDebt(uint256)`,
        `function getAuctionDueIncentives(uint256)`,
        `function getTokenKind(uint256)`,
        `function getTokenId(uint256)`,
        `function getContractAddress(uint256)`,
        `function getAuctionStartTime(uint256)`,
        `function getAuctionEndTime(uint256)`,
        `function getAuctionHammerTimeDuration()`,
        `function getAuctionBidDecimals(uint256)`,
        `function getAuctionStepMin(uint256)`,
        `function getAuctionIncMin(uint256)`,
        `function getAuctionIncMax(uint256)`,
        `function getAuctionBidMultiplier(uint256)`,
        `function getBuyItNowInvalidationThreshold()`,
        `function isBiddingAllowed(address)`,
        `function getAllUnclaimedAuctions()`,
      ],
    },
    {
      facetName: "GBMViewFacet",
      addSelectors: [
        `function getAuctionPresets(uint256)`,
        `function getAuctionInfo(uint256)`,
        `function getAuctionHighestBidder(uint256)`,
        `function getAuctionHighestBid(uint256)`,
        `function getAuctionDebt(uint256)`,
        `function getAuctionDueIncentives(uint256)`,
        `function getTokenKind(uint256)`,
        `function getTokenId(uint256)`,
        `function getContractAddress(uint256)`,
        `function getAuctionStartTime(uint256)`,
        `function getAuctionEndTime(uint256)`,
        `function getAuctionHammerTimeDuration()`,
        `function getAuctionBidDecimals(uint256)`,
        `function getAuctionStepMin(uint256)`,
        `function getAuctionIncMin(uint256)`,
        `function getAuctionIncMax(uint256)`,
        `function getAuctionBidMultiplier(uint256)`,
        `function getBuyItNowInvalidationThreshold()`,
        `function isBiddingAllowed(address)`,
        `function getAllUnclaimedAuctions()`,
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  upgradeAddClaimAll()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
