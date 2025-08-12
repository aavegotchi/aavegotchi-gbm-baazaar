import { ethers, network } from "hardhat";
import { gasPrice, impersonate, maticDiamondAddress } from "../helperFunctions";
import { LedgerSigner } from "@anders-t/ethers-ledger";
import * as fs from "fs";
import * as path from "path";
import { maticGBMDiamond } from "../constants";
import { GBMFacet } from "../../typechain";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

const BATCH_SIZE = 50; // Number of auctions to process in each batch
const PROGRESS_DIR = path.join(__dirname, "progress");
const PROGRESS_FILE = path.join(PROGRESS_DIR, "finalize_progress.json");

interface Progress {
  lastProcessedIndex: number;
  totalProcessed: number;
  failedAuctions: number[];
}

export async function finalizeAuctions() {
  let signer;
  let gbmDiamond: GBMFacet;

  const testing = ["hardhat", "localhost"].includes(network.name);

  if (testing) {
    await mine();

    const gbmDiamondOwner = await getOwner(maticGBMDiamond);
    gbmDiamond = await ethers.getContractAt("GBMFacet", maticGBMDiamond);
    gbmDiamond = await impersonate(
      gbmDiamondOwner,
      gbmDiamond,
      ethers,
      network
    );
  } else if (network.name === "matic") {
    signer = new LedgerSigner(ethers.provider, "m/44'/60'/1'/0/0");
    gbmDiamond = await ethers.getContractAt("GBMFacet", maticGBMDiamond);
    gbmDiamond = gbmDiamond.connect(signer);
  } else {
    throw Error("Incorrect network selected");
  }

  // Create progress directory if it doesn't exist
  if (!fs.existsSync(PROGRESS_DIR)) {
    fs.mkdirSync(PROGRESS_DIR, { recursive: true });
    console.log(`Created progress directory at ${PROGRESS_DIR}`);
  }

  // Load progress if exists
  let progress: Progress = {
    lastProcessedIndex: 0,
    totalProcessed: 0,
    failedAuctions: [],
  };

  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    console.log(`Resuming from index ${progress.lastProcessedIndex}`);
  }

  console.log("Fetching unclaimed auctions...");

  const omitList = [19516, 19518, 21264];

  const unclaimedAuctions = await gbmDiamond
    .getAllUnclaimedAuctions()
    .then((auctions) =>
      auctions.filter((auction) => !omitList.includes(auction.toNumber()))
    );

  for (let index = 0; index < unclaimedAuctions.length; index++) {
    const element = unclaimedAuctions[index];
    console.log(element.toString() + ",");
  }

  console.log(`Total unclaimed auctions: ${unclaimedAuctions.length}`);

  // Process auctions in batches
  for (
    let i = progress.lastProcessedIndex;
    i < unclaimedAuctions.length;
    i += BATCH_SIZE
  ) {
    const batch = unclaimedAuctions.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
        unclaimedAuctions.length / BATCH_SIZE
      )}`
    );

    try {
      const tx = await gbmDiamond.claimAll(batch, { gasPrice: gasPrice });
      await tx.wait();
      console.log(
        `Successfully claimed batch ${i / BATCH_SIZE + 1} at txn ${tx.hash}`
      );

      progress.lastProcessedIndex = i + BATCH_SIZE;
      progress.totalProcessed += batch.length;
    } catch (error) {
      console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
      // Convert BigNumber auction IDs to numbers before pushing
      progress.failedAuctions.push(...batch.map((id) => id.toNumber()));
    }

    // Save progress after each batch
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }

  console.log("Finalization complete!");
  console.log(`Total processed: ${progress.totalProcessed}`);
  console.log(`Failed auctions: ${progress.failedAuctions.length}`);
  if (progress.failedAuctions.length > 0) {
    console.log("Failed auction IDs:", progress.failedAuctions);
  }
}

async function getOwner(address: string) {
  const ownershipFacet = await ethers.getContractAt("OwnershipFacet", address);
  const owner = await ownershipFacet.owner();
  return owner;
}

if (require.main === module) {
  finalizeAuctions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
