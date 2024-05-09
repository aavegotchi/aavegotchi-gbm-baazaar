//@ts-ignore
import { run, ethers, network } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { gasPrice, impersonate } from "../helperFunctions";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function upgradeBuyNowFor() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function buyNowFor(uint256 _auctionID, address _recepient) public`,
        `function _buyNowImplementation(uint256 _auctionID, address _recipient) internal`,
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

  let gbmFacet = await ethers.getContractAt("GBMFacet", maticGBMDiamond);
  gbmFacet = await impersonate(
    maticGBMDiamondUpgrader,
    gbmFacet,
    ethers,
    network
  );
  const tx = await gbmFacet.setBuyItNowInvalidationThreshold(70, {
    gasPrice: gasPrice,
  });
  console.log("Preset corrected successfully at hash", tx.hash);
  console.log(
    "BuyItNowInvalidationThreshold:",
    await gbmFacet.getBuyItNowInvalidationThreshold()
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  upgradeBuyNowFor()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
