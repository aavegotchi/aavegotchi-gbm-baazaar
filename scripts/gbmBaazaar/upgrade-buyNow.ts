//@ts-ignore
import {run, ethers, network} from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import {gasPrice, impersonate} from "../helperFunctions";

export async function upgradeBuyNow() {
  const gbmDiamond = "0xD5543237C656f25EEA69f1E247b8Fa59ba353306";
  const gbmDiamondOwner = "0x585E06CA576D0565a035301819FD2cfD7104c1E8";
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function buyNow(uint256 _auctionID) public`,
        `function setBuyNow(uint256 _auctionID, uint96 _buyItNowPrice) external`,
        `function setBuyItNowInvalidationThreshold(uint256 _invalidationThreshold) external`,
        `function getBuyItNowInvalidationThreshold() external view`,
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: gbmDiamondOwner,
    diamondAddress: gbmDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);

  let gbmFacet = await ethers.getContractAt("GBMFacet", gbmDiamond);
  gbmFacet = await impersonate(gbmDiamondOwner, gbmFacet, ethers, network);
  const tx = await gbmFacet.setBuyItNowInvalidationThreshold(70, { gasPrice: gasPrice });
  console.log("Preset corrected successfully at hash", tx.hash);
  console.log("BuyItNowInvalidationThreshold:", await gbmFacet.getBuyItNowInvalidationThreshold());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  upgradeBuyNow()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
