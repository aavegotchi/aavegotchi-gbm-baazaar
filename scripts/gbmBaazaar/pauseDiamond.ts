import { ethers, network } from "hardhat";
import { impersonate } from "../helperFunctions";
import { LedgerSigner } from "@anders-t/ethers-ledger";
import { maticGBMDiamond } from "../constants";

export async function lockDiamonds() {
  let signer;

  const testing = ["hardhat", "localhost"].includes(network.name);
  let gbmDiamond;

  if (testing) {
    const gbmDiamondOwner = await getOwner(maticGBMDiamond);
    gbmDiamond = await ethers.getContractAt("GBMFacet", maticGBMDiamond);
    gbmDiamond = await impersonate(
      gbmDiamondOwner,
      gbmDiamond,
      ethers,
      network
    );
  } else if (network.name === "matic") {
    //item manager - ledger
    signer = new LedgerSigner(ethers.provider, "m/44'/60'/1'/0/0");
  } else throw Error("Incorrect network selected");

  let tx = await gbmDiamond.toggleDiamondPause();
  await tx.wait();
  console.log("GBM diamond paused at txn", tx.hash);
  console.log("Diamond paused");
}

async function getOwner(address: string) {
  const ownershipFacet = await ethers.getContractAt("OwnershipFacet", address);
  const owner = await ownershipFacet.owner();
  return owner;
}

if (require.main === module) {
  lockDiamonds()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
