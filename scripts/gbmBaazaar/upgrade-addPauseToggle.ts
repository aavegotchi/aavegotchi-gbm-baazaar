//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";
import { GBMFacetInterface } from "../../typechain/GBMFacet";
import { GBMFacet__factory } from "../../typechain";

export async function upgradeAddPauseToggle() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function toggleDiamondPause(bool _pause) external onlyOwner`,
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;

  const calldata = iface.encodeFunctionData("toggleDiamondPause", [true]);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: maticGBMDiamond,
    initCalldata: calldata,
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
