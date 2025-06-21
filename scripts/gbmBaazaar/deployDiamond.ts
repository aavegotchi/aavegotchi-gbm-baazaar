/* global ethers hre */
/* eslint prefer-const: "off" */

import { BigNumberish, BytesLike } from "ethers";
import { ethers } from "hardhat";
const hre = require("hardhat");

import { GBMFacet } from "../../typechain";

import { getSelectors, FacetCutAction } from "../libraries/diamond";
import {
  varsForNetwork,
  GbmBaazaarDeployment,
  saveGbmBaazaarDeployment,
  Preset,
} from "../../helpers/constants";
import { getRelayerSigner, verifyContract } from "../helperFunctions";

// Init GBM

// const pixelcraft = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";
// const DAO = "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
// const GBM = "0xA7427d0D45e8dd969049872F9cDE383716A39B23";
// const rarityFarming = "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098";
// const GHST = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";

// const realmParcels = "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11";
// const tiles = "0x9216c31d8146bCB3eA5a9162Dc1702e8AEDCa355";
// const installations = "0x19f870bD94A34b3adAa9CaA439d333DA18d6812A";
// const aavegotchi = "0x86935F11C86623deC8a25696E1C19a8659CbF95d";
// const tokens = [realmParcels, tiles, installations, aavegotchi];

const lowPreset: Preset = {
  incMin: 500,
  incMax: 1000,
  bidMultiplier: 500,
  stepMin: 1000,
  bidDecimals: 100000,
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
  // const accounts = await ethers.getSigners();
  // const contractOwner = accounts[0];

  //use relayer

  const signer = await getRelayerSigner(hre);
  const contractOwner = await signer.getAddress();

  const vars = await varsForNetwork(ethers);

  const tokens = [
    vars.aavegotchiDiamond,
    vars.forgeDiamond,
    vars.realmDiamond,
    vars.tileDiamond,
    vars.installationDiamond,
    vars.aavegotchiDiamond,
    vars.fakeGotchiCardDiamond,
    vars.fakeGotchiArtDiamond,
    vars.ggSkinsDiamond,
    vars.ggProfilesDiamond,
  ];

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory(
    "DiamondCutFacet",
    signer
  );
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.deployed();
  console.log("DiamondCutFacet deployed:", diamondCutFacet.address);

  await verifyContract(diamondCutFacet.address, false);

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("GBMDiamond", signer);
  const diamond = await Diamond.deploy(
    contractOwner,
    diamondCutFacet.address,
    1200,
    3600
  );
  await diamond.deployed();
  console.log("Diamond deployed:", diamond.address);

  await verifyContract(diamond.address, true, [
    contractOwner,
    diamondCutFacet.address,
    1200,
    3600,
  ]);

  // deploy DiamondInit
  const DiamondInit = await ethers.getContractFactory("DiamondInit", signer);
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);
  await verifyContract(diamondInit.address, false);

  // deploy facets
  console.log("");
  console.log("Deploying facets");
  const FacetNames = ["DiamondLoupeFacet", "OwnershipFacet", "GBMFacet"];
  const cut = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName, signer);
    const facet = await Facet.deploy();
    await facet.deployed();

    console.log(`${FacetName} deployed: ${facet.address}`);
    await verifyContract(facet.address, false);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  // upgrade diamond with facets
  console.log("Diamond Cut:", cut);
  const diamondCut = await ethers.getContractAt(
    "IDiamondCut",
    diamond.address,
    signer
  );
  let tx;
  let receipt;

  // const PK = ethers.utils.toUtf8Bytes(process.env.SECRET_2);
  //Use Matic PK
  let backendSigner = new ethers.Wallet(process.env.SECRET_2); // PK should start with '0x'

  let functionCall = diamondInit.interface.encodeFunctionData("init", [
    ethers.utils.hexDataSlice(backendSigner.publicKey, 1),
    vars.pixelcraft,
    vars.ghst,
    vars.GBM,
    vars.rarityFarming,
    vars.DAO,
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
    diamond.address,
    signer
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

  //enable bidding for all tokens
  for (let i = 0; i < tokens.length; i++) {
    await gbm.setBiddingAllowed(tokens[i], true);
    console.log(`enabled bidding for token with address ${tokens[i]} `);
  }

  const gbmBaazaarDeployment: GbmBaazaarDeployment = {
    gbmDiamond: diamond.address,
    presets: presets,
    whitelistedTokens: tokens,
  };
  const chainId = await hre.network.config.chainId;
  if (chainId) {
    saveGbmBaazaarDeployment(chainId, gbmBaazaarDeployment);
  } else {
    console.log("Chain ID not found. Skipping saving deployment details.");
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
