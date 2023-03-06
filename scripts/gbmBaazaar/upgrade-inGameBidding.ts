//@ts-ignore
import { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";

export async function deployUpgrade() {
  const InitiatorInfo =
    "tuple(uint80 startTime, uint80 endTime, uint56 tokenAmount, uint8 category, bytes4 tokenKind, uint256 tokenID)";
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        "function commitBid(uint256 _auctionID,uint256 _bidAmount,uint256 _highestBid,address _tokenContract,uint256 _tokenID,uint256 _amount,bytes memory _signature,bool _inGame) external",
        `function createAuction(${InitiatorInfo} calldata _info,address _tokenContract,uint256 _auctionPresetID,bool _inGameBiddingOnly) public returns (uint256)`,
        `function batchCreateAuctions(${InitiatorInfo}[] calldata _info,address[] calldata _tokenContracts,uint256[] calldata _auctionPresetIDs,bool[] calldata _inGameBiddingOnly) external`,
      ],
      removeSelectors: [
        "function commitBid(uint256 _auctionID,uint256 _bidAmount,uint256 _highestBid,address _tokenContract,uint256 _tokenID,uint256 _amount,bytes memory _signature) external",
        `function createAuction(${InitiatorInfo} calldata _info,address _tokenContract,uint256 _auctionPresetID) public returns (uint256)`,
        `function batchCreateAuctions(${InitiatorInfo}[] calldata _info,address[] calldata _tokenContracts,uint256[] calldata _auctionPresetIDs) external`,
      ],
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
  deployUpgrade()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
