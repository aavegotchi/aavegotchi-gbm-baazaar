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
        // "function modifyAuction(uint256 _auctionID,uint80 _newEndTime,uint64 _newTokenAmount,bytes4 _tokenKind) external",
      ],
      removeSelectors: [],
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
