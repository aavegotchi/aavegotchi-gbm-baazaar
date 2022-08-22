/* global ethers hre */
/* eslint prefer-const: "off" */

import { BigNumberish, BytesLike } from "ethers";
import { ethers } from "hardhat";
import { ERC20Generic } from "../../typechain";

//@ts-ignore
// import hardhat, { run, ethers } from "hardhat";
// dotenv.config({ path: __dirname + "/.env" });
import { getSelectors, FacetCutAction } from "../libraries/diamond";

// Init GBM

const pixelcraft = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";
const playerRewards = "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098";
const daoTreasury = "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
const GBM = "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
let sampleGHST: ERC20Generic;

interface Preset {
  incMin: BigNumberish;
  incMax: BigNumberish;
  bidMultiplier: BigNumberish;
  stepMin: BigNumberish;
  bidDecimals: BigNumberish;
}

const lowPreset: Preset = {
  incMin: 500,
  incMax: 1000,
  bidMultiplier: 500,
  stepMin: 10000,
  bidDecimals: 1000,
};
const mediumPreset: Preset = {
  incMin: 500,
  incMax: 5000,
  bidMultiplier: 4970,
  stepMin: 5000,
  bidDecimals: 100000,
};

const highPreset: Preset = {
  incMin: 1000,
  incMax: 10000,
  bidMultiplier: 11000,
  stepMin: 10000,
  bidDecimals: 100000,
};

const gasPrice = 20000000000;

export const presets: Preset[] = [lowPreset, mediumPreset, highPreset];
export async function deployDiamond() {
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy({ gasPrice: gasPrice });
  await diamondCutFacet.deployed();
  console.log("DiamondCutFacet deployed:", diamondCutFacet.address);

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("GBMDiamond");
  const diamond = await Diamond.deploy(
    contractOwner.address,
    diamondCutFacet.address,
    1200,
    3600,
    { gasPrice: gasPrice }
  );
  await diamond.deployed();
  console.log("Diamond deployed:", diamond.address);

  // deploy DiamondInit
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy({ gasPrice: gasPrice });
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);
  //@ts-ignore
  const testing = ["hardhat", "localhost"].includes(hre.network.name);

  // deploy facets
  console.log("");
  console.log("Deploying facets");
  const FacetNames = ["DiamondLoupeFacet", "OwnershipFacet", "GBMFacet"];
  const cut = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy({ gasPrice: gasPrice });
    await facet.deployed();
    console.log(`${FacetName} deployed: ${facet.address}`);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  // upgrade diamond with facets
  console.log("Diamond Cut:", cut);
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamond.address);
  let tx;
  let receipt;
  //@ts-ignore
  const PK = ethers.utils.toUtf8Bytes(process.env.SECRET);
  //Use Matic PK
  let backendSigner = new ethers.Wallet(PK); // PK should start with '0x'

  //deploy mock ERC20/ghst
  const erc20 = await ethers.getContractFactory("ERC20Generic");
  sampleGHST = await erc20.deploy();
  await sampleGHST.deployed();
  console.log("ERC20 deployed to", sampleGHST.address);

  let functionCall = diamondInit.interface.encodeFunctionData("init", [
    ethers.utils.hexDataSlice(backendSigner.publicKey, 1),
    pixelcraft,
    sampleGHST.address,
    GBM,
  ]);

  console.log("key:", ethers.utils.hexDataSlice(backendSigner.publicKey, 1));

  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall, {
    gasPrice: gasPrice,
  });
  console.log("Diamond cut tx: ", tx.hash);
  receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  console.log("Completed diamond cut");

  return diamond.address;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
