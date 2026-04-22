import { ethers, network } from "hardhat";
import {
  DefenderRelayProvider,
  DefenderRelaySigner,
} from "defender-relay-client/lib/ethers";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner, impersonate } from "../helperFunctions";
const hre = require("hardhat");

const NEW_GBM_FEE_RECIPIENT =
  "0x980D0D096a63A52480c9a2A903F41867Cb428132";

const STORAGE_SLOT_PIXELCRAFT = 0;
const STORAGE_SLOT_DAO = 1;
const STORAGE_SLOT_GBM = 2;
const STORAGE_SLOT_RARITY_FARMING = 3;

interface FeeRecipients {
  pixelcraft: string;
  dao: string;
  gbm: string;
  rarityFarming: string;
}

function slotToAddress(slotValue: string): string {
  return ethers.utils.getAddress(`0x${slotValue.slice(-40)}`);
}

function useDefenderRelay(): boolean {
  return process.env.GBM_USE_DEFENDER === "true";
}

function getDirectDefenderSigner() {
  const credentials = {
    apiKey: process.env.DEFENDER_APIKEY!,
    apiSecret: process.env.DEFENDER_SECRET!,
  };
  const provider = new DefenderRelayProvider(credentials);
  return new DefenderRelaySigner(credentials, provider, {
    speed: "safeLow",
    validForSeconds: 7200,
  });
}

async function readFeeRecipients(
  diamondAddress: string,
  provider = ethers.provider
): Promise<FeeRecipients> {
  const [pixelcraft, dao, gbm, rarityFarming] = await Promise.all([
    provider.getStorageAt(diamondAddress, STORAGE_SLOT_PIXELCRAFT),
    provider.getStorageAt(diamondAddress, STORAGE_SLOT_DAO),
    provider.getStorageAt(diamondAddress, STORAGE_SLOT_GBM),
    provider.getStorageAt(diamondAddress, STORAGE_SLOT_RARITY_FARMING),
  ]);

  return {
    pixelcraft: slotToAddress(pixelcraft),
    dao: slotToAddress(dao),
    gbm: slotToAddress(gbm),
    rarityFarming: slotToAddress(rarityFarming),
  };
}

async function getDiamondOwner(diamondAddress: string): Promise<string> {
  const ownershipFacet = await ethers.getContractAt(
    "OwnershipFacet",
    diamondAddress
  );
  return ownershipFacet.owner();
}

export async function updateGbmFeeRecipient(
  nextGbmFeeRecipient = NEW_GBM_FEE_RECIPIENT
) {
  const vars = await varsForNetwork(ethers);
  if (!vars.gbmDiamond) {
    throw new Error("GBM diamond address not configured for this network");
  }

  const diamondAddress = vars.gbmDiamond;
  const nextRecipient = ethers.utils.getAddress(nextGbmFeeRecipient);
  let provider = ethers.provider;
  let gbmDiamond = await ethers.getContractAt("GBMExtendedFacet", diamondAddress);
  const testing = ["hardhat", "localhost"].includes(network.name) && !useDefenderRelay();

  if (testing) {
    const owner = await getDiamondOwner(diamondAddress);
    gbmDiamond = await impersonate(owner, gbmDiamond, ethers, network);
  } else if (useDefenderRelay()) {
    const signer = getDirectDefenderSigner();
    provider = signer.provider;
    gbmDiamond = gbmDiamond.connect(signer);
  } else if (network.name === "base" || network.name === "matic") {
    const signer = await getRelayerSigner(hre);
    provider = signer.provider;
    gbmDiamond = gbmDiamond.connect(signer);
  } else {
    throw new Error(`Unsupported network: ${network.name}`);
  }

  const currentRecipients = await readFeeRecipients(diamondAddress, provider);
  console.log("Current fee recipients:", currentRecipients);

  if (currentRecipients.gbm === nextRecipient) {
    console.log("GBM fee recipient already set. No update required.");
    return;
  }

  const tx = await gbmDiamond.setAddresses(
    currentRecipients.pixelcraft,
    currentRecipients.dao,
    nextRecipient,
    currentRecipients.rarityFarming
  );
  console.log(`Submitted setAddresses tx: ${tx.hash}`);
  await tx.wait();

  const updatedRecipients = await readFeeRecipients(diamondAddress, provider);
  console.log("Updated fee recipients:", updatedRecipients);

  if (updatedRecipients.gbm !== nextRecipient) {
    throw new Error(
      `GBM fee recipient update failed: expected ${nextRecipient}, got ${updatedRecipients.gbm}`
    );
  }
}

if (require.main === module) {
  updateGbmFeeRecipient()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
