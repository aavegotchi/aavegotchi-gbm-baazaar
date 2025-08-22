/* global ethers hre */
/* eslint prefer-const: "off" */

import { ethers } from "hardhat";
const hre = require("hardhat");

import { GBMFacet } from "../../typechain";
import { getRelayerSigner } from "../helperFunctions";
import { varsForNetwork, GbmBaazaarDeployment } from "../../helpers/constants";
import * as fs from "fs";
import * as path from "path";

/**
 * Script to toggle contract whitelist status for tokens using relayerSigner
 * This allows enabling or disabling auction creation for specific token contracts
 *
 * Usage:
 * 1. To run the full script with predefined tokens:
 *    npx hardhat run scripts/gbmBaazaar/toggleContractWhitelist.ts --network <network>
 *
 * 2. To enable a specific token programmatically:
 *    import { enableContractWhitelist } from './toggleContractWhitelist';
 *    await enableContractWhitelist('0x...', 'Token Description');
 *
 * 3. To disable a specific token programmatically:
 *    import { disableContractWhitelist } from './toggleContractWhitelist';
 *    await disableContractWhitelist('0x...', 'Token Description');
 *
 * Requirements:
 * - The GBM Diamond must be deployed and the deployment details saved
 * - Proper environment variables for the relayer must be set
 * - The script uses the relayerSigner which requires owner permissions on the contract
 */

interface WhitelistConfig {
  tokenAddress: string;
  enabled: boolean;
  description?: string;
}

export async function toggleContractWhitelist() {
  console.log("Starting contract whitelist toggle script...");

  // Get the relayer signer
  const signer = await getRelayerSigner(hre);
  const signerAddress = await signer.getAddress();
  console.log(`Using relayer signer: ${signerAddress}`);

  // Get network variables
  const chainId = hre.network.config.chainId;

  // Get the deployed GBM diamond address

  const gbmDiamondAddress = "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31";
  console.log(`Using GBM Diamond at: ${gbmDiamondAddress}`);

  // Connect to the GBM contract
  const gbm: GBMFacet = (await ethers.getContractAt(
    "GBMFacet",
    gbmDiamondAddress,
    signer
  )) as GBMFacet;

  // Define the tokens you want to whitelist/unwhitelist
  const tokensToToggle: WhitelistConfig[] = [
    {
      tokenAddress: "0xF6c1b83977DE3dEffC476f5048A0a84d3375d498",
      enabled: true,
      description: "Unstoppable Domains",
    },

    // Add more tokens as needed
  ];

  console.log(`Processing ${tokensToToggle.length} token contracts...`);

  // Process each token contract
  for (const config of tokensToToggle) {
    try {
      console.log(
        `\n${config.enabled ? "Enabling" : "Disabling"} whitelist for ${
          config.description || config.tokenAddress
        }...`
      );

      const tx = await gbm.setBiddingAllowed(config.tokenAddress, true);
      console.log(`Transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(
          `✅ Successfully ${config.enabled ? "enabled" : "disabled"} ${
            config.tokenAddress
          }`
        );
      } else {
        console.log(`❌ Failed to toggle whitelist for ${config.tokenAddress}`);
      }
    } catch (error) {
      console.error(
        `❌ Error toggling whitelist for ${config.tokenAddress}:`,
        error
      );
    }
  }

  console.log("\n✅ Contract whitelist toggle script completed!");
}

/**
 * Helper function to enable a single contract on the whitelist
 */
export async function enableContractWhitelist() {
  const baseGbmDiamondAddress = "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31";
  const tokenAddress = "0x898d0F54d8CF60698972a75be7Ea1B45aAb66e59";

  console.log(`Enabling bidding for ${tokenAddress}...`);

  const signer = await getRelayerSigner(hre);

  const gbm: GBMFacet = (await ethers.getContractAt(
    "GBMFacet",
    baseGbmDiamondAddress,
    signer
  )) as GBMFacet;

  const tx = await gbm.toggleContractWhitelist(tokenAddress, true);
  console.log(`Transaction hash: ${tx.hash}`);

  const receipt = await tx.wait();
  if (receipt.status === 1) {
    console.log(`✅ Successfully enabled ${tokenAddress}`);
  } else {
    console.log(`❌ Failed to enable ${tokenAddress}`);
  }
}

// Run the script when called directly
if (require.main === module) {
  toggleContractWhitelist()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Script execution failed:", error);
      process.exit(1);
    });
}

// Export functions for use in other scripts
export { WhitelistConfig };
("");
