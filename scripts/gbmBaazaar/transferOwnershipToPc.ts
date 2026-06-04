import { ethers } from "hardhat";
import {
  DefenderRelayProvider,
  DefenderRelaySigner,
} from "defender-relay-client/lib/ethers";

const hre = require("hardhat");

const CONTRACT_NAME = "GBM Auction (Baazaar)";
const DIAMOND_ADDRESS = "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31";
const OLD_OWNER = "0xf52398257A254D541F392667600901f710a006eD";
const NEW_OWNER = "0x01F010a5e001fe9d6940758EA5e8c777885E351e";

async function getBaseRelayerSigner() {
  if (["hardhat", "localhost"].includes(hre.network.name)) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [OLD_OWNER],
    });
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [OLD_OWNER, "0x100000000000000000000000"],
    });
    return ethers.provider.getSigner(OLD_OWNER);
  }

  if (hre.network.name !== "base") {
    throw new Error(`Expected hardhat, localhost, or base. Got ${hre.network.name}`);
  }

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

async function main() {
  const signer = await getBaseRelayerSigner();
  const signerAddress = await signer.getAddress();
  const ownershipFacet = await ethers.getContractAt(
    "OwnershipFacet",
    DIAMOND_ADDRESS,
    signer
  );

  const currentOwner = await ownershipFacet.owner();
  console.log(`${CONTRACT_NAME}: ${DIAMOND_ADDRESS}`);
  console.log(`Current owner: ${currentOwner}`);
  console.log(`New owner: ${NEW_OWNER}`);
  console.log(`Signer: ${signerAddress}`);

  if (currentOwner.toLowerCase() !== OLD_OWNER.toLowerCase()) {
    throw new Error(`Unexpected current owner for ${CONTRACT_NAME}`);
  }

  if (signerAddress.toLowerCase() !== OLD_OWNER.toLowerCase()) {
    throw new Error("Signer is not the current owner relayer");
  }

  const txRequest = await ownershipFacet.populateTransaction.transferOwnership(
    NEW_OWNER
  );
  const gasEstimate = await ownershipFacet.estimateGas.transferOwnership(
    NEW_OWNER
  );

  console.log(`Calldata: ${txRequest.data}`);
  console.log(`Gas estimate: ${gasEstimate.toString()}`);

  const execute = process.env.EXECUTE_OWNERSHIP_TRANSFER === "true";
  const liveConfirmed =
    process.env.CONFIRM_BASE_MAINNET_OWNERSHIP_TRANSFER === NEW_OWNER;

  if (!execute) {
    console.log("Dry run only. Set EXECUTE_OWNERSHIP_TRANSFER=true to send.");
    return;
  }

  if (hre.network.name === "base" && !liveConfirmed) {
    throw new Error(
      "Live Base transfer requires CONFIRM_BASE_MAINNET_OWNERSHIP_TRANSFER to equal the new owner address"
    );
  }

  const tx = await ownershipFacet.transferOwnership(NEW_OWNER);
  console.log(`Submitted tx: ${tx.hash}`);
  await tx.wait();

  const updatedOwner = await ownershipFacet.owner();
  console.log(`Updated owner: ${updatedOwner}`);

  if (updatedOwner.toLowerCase() !== NEW_OWNER.toLowerCase()) {
    throw new Error(`Ownership transfer failed for ${CONTRACT_NAME}`);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
