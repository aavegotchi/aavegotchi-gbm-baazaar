//@ts-ignore
import { run, ethers, network } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { maticGBMDiamond, maticGBMDiamondUpgrader } from "../constants";
import { GBMFacetInterface } from "../../typechain/GBMFacet";
import { GBMFacet__factory } from "../../typechain";

export async function upgradeBuyNow() {
  const auctionIds =
  [
    [ // high
      20912, 20913, 20914, 20916,
      21031, 21032, 21062, 21202,
      21206, 21234, 21240, 21282,
      21283, 21292, 21298, 21299,
      21300, 21301, 21302, 21303,
      21304, 21305, 21307, 21308,
      21309, 21310, 21311, 21312,
      21319, 21321, 21324, 21327
    ],
    [ // medium
      20915, 20918, 20919, 20921,
      20940, 21008, 21014, 21030,
      21187, 21200, 21208, 21209,
      21227, 21228, 21230, 21251,
      21253, 21264, 21275, 21276,
      21277, 21278, 21279, 21284,
      21289, 21290, 21291, 21325
    ],
    [ // low
      21067, 21094, 21105, 21136,
      21137, 21138, 21174, 21236,
      21287, 21293, 21294, 21295,
      21296, 21297, 21313, 21314,
      21315, 21316, 21317, 21326
    ]
  ]
  const allAuctionIds = [...auctionIds[0], ...auctionIds[1], ...auctionIds[2]]
  const presetIds = [...Array(auctionIds[0].length).fill(2), ...Array(auctionIds[1].length).fill(1), ...Array(auctionIds[2].length).fill(0)]
  let facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        `function batchFixAuctions(uint256[] calldata _auctionIds, uint256[] calldata _auctionPresetIds)`,
      ],
      removeSelectors: [],
    },
  ];

  let joined = convertFacetAndSelectorsToString(facets);

  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;
  const calldata = iface.encodeFunctionData("batchFixAuctions", [allAuctionIds, presetIds]);

  let args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: maticGBMDiamond,
    initCalldata: calldata,
  };

  await run("deployUpgrade", args);

  // check upgrade result
  const GBM = await ethers.getContractAt("GBMFacet", maticGBMDiamond);
  console.log(await GBM.getAuctionInfo(allAuctionIds[0]))

  // rollback code
  facets = [
    {
      facetName: "GBMFacet",
      addSelectors: [],
      removeSelectors: [
        `function batchFixAuctions(uint256[] calldata _auctionIds, uint256[] calldata _auctionPresetIds)`,
      ],
    },
  ];
  joined = convertFacetAndSelectorsToString(facets);

  args = {
    diamondUpgrader: maticGBMDiamondUpgrader,
    diamondAddress: maticGBMDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };
  await run("deployUpgrade", args);

  // check upgrade result again
  console.log(await GBM.getAuctionInfo(allAuctionIds[0]))
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
