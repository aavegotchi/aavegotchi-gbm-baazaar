//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function upgradeAddPauseToggle() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [`function toggleDiamondPause() external onlyOwner`],
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
  upgradeAddPauseToggle()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
