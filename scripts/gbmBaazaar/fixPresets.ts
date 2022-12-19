import { LedgerSigner } from "@anders-t/ethers-ledger";
import { ethers } from "hardhat";
import { gasPrice } from "../helperFunctions";
import { presets } from "./deployDiamond";
export const GBMDiamond = "0xD5543237C656f25EEA69f1E247b8Fa59ba353306";
async function fixPreset() {
  const signer = new LedgerSigner(ethers.provider);
  const GBM = await ethers.getContractAt("GBMFacet", GBMDiamond, signer);
  console.log("Setting preset");
  const tx = await GBM.setAuctionPresets(0, presets[0], { gasPrice: gasPrice });
  console.log("Preset corrected successfully at hash", tx.hash);
}

if (require.main === module) {
  fixPreset()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
