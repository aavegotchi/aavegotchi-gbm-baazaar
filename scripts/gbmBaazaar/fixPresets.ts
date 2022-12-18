import { LedgerSigner } from "@ethersproject/hardware-wallets";
import { ethers } from "hardhat";
import { presets } from "./deployDiamond";
export const GBMDiamond = "0xD5543237C656f25EEA69f1E247b8Fa59ba353306";
async function fixPreset() {
  const signer = new LedgerSigner(ethers.provider);
  const GBM = await ethers.getContractAt("GBMFacet", GBMDiamond, signer);
  const tx = await GBM.setAuctionPresets(0, presets[0]);
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
