//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function upgradeAddClaimAll() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        // `function claimAll(uint256[] calldata _auctionIds) external`,
        // `function getAllUnclaimedAuctions() public view returns (uint256[] memory)`,
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
