import { ethers, run } from "hardhat";

import { varsForNetwork } from "../../helpers/constants";
import {
  FacetsAndAddSelectors,
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
} from "../../tasks/deployUpgrade";
import { diamondOwner } from "../helperFunctions";
import { GBMFacet__factory } from "../../typechain";
import { GBMFacetInterface } from "../../typechain/GBMFacet";

export async function upgradeAddSwapFns() {
  const gbmFacetAdds = [
    "function swapAndCommitBid((address,uint256,uint256,uint256,address,uint256,uint256,uint256,address,uint256,uint256,bytes)) external",
    "function swapAndBuyNow((address,uint256,uint256,uint256,address,uint256)) external",
  ];

  // For GBMExtendedFacet we rely on Replace of all its selectors; no need to specify addSelectors explicitly
  // Only remove selectors that historically lived on GBMFacet and were moved to GBMExtendedFacet
  const gbmFacetRemovals: string[] = [
    "function getAuctionPresets(uint256) public view returns (tuple(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint64 bidDecimals))",
    "function getAuctionInfo(uint256) external view returns (tuple(address owner,address tokenContract,tuple(uint80 startTime,uint80 endTime,uint56 tokenAmount,bytes4 tokenKind,uint256 tokenID,uint96 startingBid,uint96 buyItNowPrice,uint8 category),tuple(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint64 bidDecimals),uint96 highestBid,address highestBidder,uint88 dueIncentives,uint88 auctionDebt,bool biddingAllowed,bool claimed))",
    "function getAuctionHighestBidder(uint256) external view returns (address)",
    "function getAuctionHighestBid(uint256) external view returns (uint256)",
    "function getAuctionDebt(uint256) external view returns (uint256)",
    "function getAuctionDueIncentives(uint256) external view returns (uint256)",
    "function getTokenKind(uint256) external view returns (bytes4)",
    "function getTokenId(uint256) external view returns (uint256)",
    "function getContractAddress(uint256) external view returns (address)",
    "function getAuctionStartTime(uint256) public view returns (uint256)",
    "function getAuctionEndTime(uint256) public view returns (uint256)",
    "function getAuctionHammerTimeDuration() public view returns (uint256)",
    "function getAuctionBidDecimals(uint256) public view returns (uint256)",
    "function getAuctionStepMin(uint256) public view returns (uint64)",
    "function getAuctionIncMin(uint256) public view returns (uint64)",
    "function getAuctionIncMax(uint256) public view returns (uint64)",
    "function getAuctionBidMultiplier(uint256) public view returns (uint64)",
    "function getBuyItNowInvalidationThreshold() external view returns (uint256)",
    "function isBiddingAllowed(address) public view returns (bool)",
  ];

  const extendedFacetAdds: string[] = [
    "function getAuctionPresets(uint256) public view returns (tuple(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint64 bidDecimals))",
    "function getAuctionInfo(uint256) external view returns (tuple(address owner,address tokenContract,tuple(uint80 startTime,uint80 endTime,uint56 tokenAmount,bytes4 tokenKind,uint256 tokenID,uint96 startingBid,uint96 buyItNowPrice,uint8 category),tuple(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint64 bidDecimals),uint96 highestBid,address highestBidder,uint88 dueIncentives,uint88 auctionDebt,bool biddingAllowed,bool claimed))",
    "function getAuctionHighestBidder(uint256) external view returns (address)",
    "function getAuctionHighestBid(uint256) external view returns (uint256)",
    "function getAuctionDebt(uint256) external view returns (uint256)",
    "function getAuctionDueIncentives(uint256) external view returns (uint256)",
    "function getTokenKind(uint256) external view returns (bytes4)",
    "function getTokenId(uint256) external view returns (uint256)",
    "function getContractAddress(uint256) external view returns (address)",
    "function getAuctionStartTime(uint256) public view returns (uint256)",
    "function getAuctionEndTime(uint256) public view returns (uint256)",
    "function getAuctionHammerTimeDuration() public view returns (uint256)",
    "function getAuctionBidDecimals(uint256) public view returns (uint256)",
    "function getAuctionStepMin(uint256) public view returns (uint64)",
    "function getAuctionIncMin(uint256) public view returns (uint64)",
    "function getAuctionIncMax(uint256) public view returns (uint64)",
    "function getAuctionBidMultiplier(uint256) public view returns (uint64)",
    "function getBuyItNowInvalidationThreshold() external view returns (uint256)",
    "function isBiddingAllowed(address) public view returns (bool)",
  ];

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: gbmFacetAdds,
      removeSelectors: gbmFacetRemovals,
    },
    {
      facetName: "GBMExtendedFacet",
      addSelectors: extendedFacetAdds,
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const c = await varsForNetwork(ethers);
  const owner = await diamondOwner(c.gbmDiamond!, ethers);
  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;

  //we are setting the buyItNowInvalidationThreshold to 90%
  const calldata = iface.encodeFunctionData(
    "setBuyItNowInvalidationThreshold",
    [90]
  );
  const args: DeployUpgradeTaskArgs = {
    diamondOwner: owner,
    diamondAddress: c.gbmDiamond!,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: c.gbmDiamond!,
    initCalldata: calldata,
    useRelayer: false,
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  upgradeAddSwapFns()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
