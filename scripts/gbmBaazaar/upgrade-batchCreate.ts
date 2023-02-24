//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";

export async function upgradeBatchCreate() {
  const InitiatorInfo =
    "tuple(uint80 startTime, uint80 endTime, uint56 tokenAmount, uint8 category, bytes4 tokenKind, uint256 tokenID)";

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function batchCreateAuctions(
        ${InitiatorInfo}[] calldata _info,
        address[] calldata _tokenContracts,
        uint256[] calldata _auctionPresetIDs
    ) external`,
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: "0x585E06CA576D0565a035301819FD2cfD7104c1E8",
    diamondAddress: "0xD5543237C656f25EEA69f1E247b8Fa59ba353306",
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
  upgradeBatchCreate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
