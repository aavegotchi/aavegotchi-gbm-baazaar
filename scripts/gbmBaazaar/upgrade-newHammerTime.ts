//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";

export async function deployUpgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        // "function createAuction((uint80 startTime,uint80 endTime,uint64 tokenAmount,bytes4 tokenKind,uint256 tokenID) calldata _info, uint160 _contractID,uint256 _auctionPresetID) external",
        "function setAuctionPresets(uint256 _auctionPresetID,(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint256 bidDecimals) calldata _preset) external",
        "function getAuctionHammerTimeDuration() public view returns (uint256)",
      ],
      removeSelectors: [
        "function getAuctionHammerTimeDuration(uint256 _auctionID) public view returns (uint256)",
        "function setAuctionPresets(uint256 _auctionPresetID,(uint64 incMin,uint64 incMax,uint64 bidMultiplier,uint64 stepMin,uint240 bidDecimals,uint16 hammerTimeDuration) calldata _preset) external",
      ],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: "0x6d63dC5A225A4563D8Dcb941e312151b651EDB0e",
    diamondAddress: "0x36819192A0c04CdC3376a1A6C0f116C13bf6e9D5",
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
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
