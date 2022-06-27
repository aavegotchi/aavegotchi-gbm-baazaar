//@ts-ignore
import hardhat, { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { GBMFacet__factory } from "../../typechain";
import { GBMFacetInterface } from "../../typechain/GBMFacet";
import { maticDiamondAddress, maticDiamondUpgrader } from "../helperFunctions";

export async function deployUpgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        "function changePubKey(bytes calldata _newPubKey) external",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;

  const newPubKey =
    "0xd07ef95d3e31ce7d17af0bd7ecd0fe1ea82d9a0d6685411201b3b5400b232270ed834d2f207bbe085dc7ce6e1605d73de5351a65b3287bae7f540dc97ba7a1c6";
  const calldata = iface.encodeFunctionData("changePubKey", [newPubKey]);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: "0x6d63dC5A225A4563D8Dcb941e312151b651EDB0e",
    diamondAddress: "0x36819192A0c04CdC3376a1A6C0f116C13bf6e9D5",
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: "0x36819192A0c04CdC3376a1A6C0f116C13bf6e9D5",
    initCalldata: calldata,
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployUpgrade()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
