import { ethers, run } from "hardhat";

import { varsForNetwork } from "../../helpers/constants";
import {
  FacetsAndAddSelectors,
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
} from "../../tasks/deployUpgrade";
import { diamondOwner } from "../helperFunctions";

/**
 * @notice Replace GBMFacet with the current implementation (no selector adds/removals).
 * @dev Use on Base mainnet after PR #40 (signature checks removed) is merged.
 */
export async function upgradeRemoveSignatureChecks() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const c = await varsForNetwork(ethers);
  const owner = await diamondOwner(c.gbmDiamond!, ethers);

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: owner,
    diamondAddress: c.gbmDiamond!,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
    useRelayer: false,
  };

  await run("deployUpgrade", args);
}

if (require.main === module) {
  upgradeRemoveSignatureChecks()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

