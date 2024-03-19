//@ts-ignore
import { run, ethers, network } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { gasPrice, impersonate } from "../helperFunctions";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";

export async function upgradeBuyNow() {
  const OldInitiatorInfo =
    "tuple(uint80 startTime, uint80 endTime, uint56 tokenAmount, uint8 category, bytes4 tokenKind, uint256 tokenID)";
  const NewInitiatorInfo =
    "tuple(uint80 startTime, uint80 endTime, uint56 tokenAmount, uint8 category, bytes4 tokenKind, uint256 tokenID, uint96 buyItNowPrice, uint96 startingBid)";

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function buyNow(uint256 _auctionID) public`,
        `function setBuyNow(uint256 _auctionID, uint96 _buyItNowPrice) external`,
        `function setBuyItNowInvalidationThreshold(uint256 _invalidationThreshold) external`,
        `function getBuyItNowInvalidationThreshold() external view`,
        `function createAuction(${NewInitiatorInfo} calldata _info, address _tokenContract,uint256 _auctionPresetID) external`,
        `function batchCreateAuctions(${NewInitiatorInfo}[] calldata _info, address[] calldata _tokenContracts, uint256[] calldata _auctionPresetIDs) external`,
      ],
      removeSelectors: [
        `function createAuction(${OldInitiatorInfo} calldata _info, address _tokenContract, uint256 _auctionPresetID) external`,
        `function batchCreateAuctions(${OldInitiatorInfo}[] calldata _info, address[] calldata _tokenContracts, uint256[] calldata _auctionPresetIDs) external`,
      ],
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
  upgradeBuyNow()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
