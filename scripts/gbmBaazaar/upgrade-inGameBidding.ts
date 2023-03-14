//@ts-ignore
import { run, ethers } from "hardhat";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";
import { maticDiamondUpgrader } from "../helperFunctions";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { WhitelistFacetInterface } from "../../typechain/WhitelistFacet";
import { WhitelistFacet__factory } from "../../typechain/factories/WhitelistFacet__factory";

export async function deployUpgrade() {
  const InitiatorInfo =
    "tuple(uint80 startTime, uint80 endTime, uint56 tokenAmount, uint8 category, bytes4 tokenKind, uint256 tokenID)";
  const Whitelist = "tuple(address owner,string name,address[] addresses)";
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        "function commitBid(uint256 _auctionID,uint256 _bidAmount,uint256 _highestBid,address _tokenContract,uint256 _tokenID,uint256 _amount,bytes memory _signature,bool _inGame) external",
        `function createAuctionWithModifiers(${InitiatorInfo} calldata _info,address _tokenContract,uint256 _auctionPresetID,uint8 _auctionModifierType,uint256 _auctionModifierId) public`,
        `function batchCreateAuctionsWithModifiers(${InitiatorInfo}[] calldata _info,address[] calldata _tokenContracts,uint256[] calldata _auctionPresetIDs,uint8[] calldata _auctionModifierTypes,uint256[] calldata _auctionModifierId) external`,
      ],
      removeSelectors: [],
    },

    {
      facetName: "WhitelistFacet",
      addSelectors: [
        "function createWhitelist(string calldata _name, address[] calldata _whitelistAddresses) external",
        "function updateWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) external",
        "function removeAddressesFromWhitelist(uint256 _whitelistId, address[] calldata _whitelistAddresses) external",
        "function transferOwnershipOfWhitelist(uint256 _whitelistId, address _whitelistOwner) external ",
        "function whitelistExists(uint256 whitelistId) external view returns (bool exists)",
        "function getWhitelistsLength() external view returns (uint256 total_) ",
        `function getWhitelist(uint256 _whitelistId) external view returns (${Whitelist} memory)`,
        "function whitelistOwner(uint256 _whitelistId) external view returns (address)",
        "function isWhitelisted(uint256 _whitelistId, address _whitelistAddress) external view returns (bool)",
        "function setStartingId() public ",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  let iface: WhitelistFacetInterface = new ethers.utils.Interface(
    WhitelistFacet__factory.abi
  ) as WhitelistFacetInterface;

  //initialize starting whitelist id to 1
  //@ts-ignore
  const calldata = iface.encodeFunctionData("setStartingId", []);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: maticGBMDiamond,
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
