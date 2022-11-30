/* global ethers hre */
/* eslint prefer-const: "off" */

import { BigNumberish, BytesLike } from "ethers";
import { ethers } from "hardhat";

import { GBMFacet } from "../../typechain";

import { getSelectors, FacetCutAction } from "../libraries/diamond";

// Init GBM

const pixelcraft = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";
const DAO = "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
const GBM = "0xA7427d0D45e8dd969049872F9cDE383716A39B23";
const rarityFarming = "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098";
const GHST = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";

const realmParcels = "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11";
const tiles = "0x9216c31d8146bCB3eA5a9162Dc1702e8AEDCa355";
const installations = "0x19f870bD94A34b3adAa9CaA439d333DA18d6812A";
const aavegotchi = "0x86935F11C86623deC8a25696E1C19a8659CbF95d";
const tokens = [realmParcels, tiles, installations, aavegotchi];

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

export async function deployFullDiamond() {
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
  const PK = ethers.utils.toUtf8Bytes(process.env.SECRET);
  //Use Matic PK
  let backendSigner = new ethers.Wallet(PK); // PK should start with '0x'

  let functionCall = diamondInit.interface.encodeFunctionData("init", [
    ethers.utils.hexDataSlice(backendSigner.publicKey, 1),
    pixelcraft,
    GHST,
    GBM,
    rarityFarming,
    DAO,
  ]);

  console.log(
    "using pubkey:",
    ethers.utils.hexDataSlice(backendSigner.publicKey, 1)
  );

  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall, {
    gasPrice: gasPrice,
  });
  console.log("Diamond cut tx: ", tx.hash);
  receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  console.log("Completed diamond cut");

  //set presets
  console.log("setting presets");
  const gbm: GBMFacet = (await ethers.getContractAt(
    "GBMFacet",
    diamond.address
  )) as GBMFacet;
  await gbm.setAuctionPresets(0, presets[0]);
  await gbm.setAuctionPresets(1, presets[1]);
  await gbm.setAuctionPresets(2, presets[2]);

  console.log("all presets set");

  console.log("enabling secondary markets");
  for (let i = 0; i < tokens.length; i++) {
    await gbm.toggleContractWhitelist(tokens[i], true);
    console.log(`enabled token with address ${tokens[i]} `);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployFullDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployFullDiamond = deployFullDiamond;
