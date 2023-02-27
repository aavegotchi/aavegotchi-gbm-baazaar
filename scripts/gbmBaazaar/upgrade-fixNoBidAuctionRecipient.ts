//@ts-ignore
import { run, ethers, network } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { GBMFacet } from "../../typechain";
import { impersonate } from "../helperFunctions";

export async function deployUpgrade() {
  const auctionId = "6771";
  const gbmDiamond = "0xD5543237C656f25EEA69f1E247b8Fa59ba353306";
  const owner = "0x579361d2636152df34db1d6dfd343f5037ddc71d";

  let gbmFacet = (await ethers.getContractAt(
    "GBMFacet",
    gbmDiamond
  )) as GBMFacet;

  gbmFacet = await impersonate(owner, gbmFacet, ethers, network);

  try {
    await gbmFacet.claim(auctionId);
  } catch (error) {
    console.log("error:", error);
  }

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: "0x585E06CA576D0565a035301819FD2cfD7104c1E8",
    diamondAddress: gbmDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);

  gbmFacet = await impersonate(owner, gbmFacet, ethers, network);

  try {
    await gbmFacet.claim(auctionId);
    console.log("auction claimed");
  } catch (error) {
    console.log("error:", error);
  }
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
