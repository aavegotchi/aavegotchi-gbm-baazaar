/* global ethers hre */

import { ethers, network } from "hardhat";
import { gasPrice } from "../helperFunctions";
import { maticGBMDiamond } from "../constants";
import { Signer } from "@ethersproject/abstract-signer";
import { OwnershipFacet } from "../../typechain";
import { LedgerSigner } from "@anders-t/ethers-ledger";

const lowPreset = {
  incMin: 500,
  incMax: 2000,
  bidMultiplier: 500,
  stepMin: 1000,
  bidDecimals: 100000,
};

async function fixPreset() {
  let signer: Signer;
  const owner = await (
    (await ethers.getContractAt(
      "OwnershipFacet",
      maticGBMDiamond
    )) as OwnershipFacet
  ).owner();
  const testing = ["hardhat", "localhost"].includes(network.name);

  if (testing) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });
    signer = await ethers.getSigner(owner);
  } else if (network.name === "matic" || "mumbai") {
    console.log("use ledger");
    signer = new LedgerSigner(ethers.provider, "m/44'/60'/1'/0/0");
  } else {
    throw Error("Incorrect network selected");
  }

  const GBM = await ethers.getContractAt("GBMFacet", maticGBMDiamond, signer);

  console.log("Setting preset");
  const tx = await GBM.setAuctionPresets(0, lowPreset, { gasPrice: gasPrice });
  console.log("Preset corrected successfully at hash", tx.hash);

  console.log('check', await GBM.getAuctionPresets(0))
}

if (require.main === module) {
  fixPreset()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
