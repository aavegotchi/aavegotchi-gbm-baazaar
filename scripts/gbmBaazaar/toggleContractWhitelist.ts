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

/**
 * Load GBM Baazaar deployment for the current network
 */
function loadGbmBaazaarDeployment(
  chainId: number
): GbmBaazaarDeployment | null {
  const DEPLOYED_DIAMONDS_PATH = path.join(
    __dirname,
    "../../helpers/deployedDiamonds.json"
  );

  if (!fs.existsSync(DEPLOYED_DIAMONDS_PATH)) {
    console.warn(
      "No deployment file found. Please deploy the diamond first or provide the address manually."
    );
    return null;
  }

  try {
    const allDeployments = JSON.parse(
      fs.readFileSync(DEPLOYED_DIAMONDS_PATH, "utf8")
    );
    return allDeployments[chainId] || null;
  } catch (error) {
    console.error("Error reading deployment file:", error);
    return null;
  }
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
  const deployment = chainId ? loadGbmBaazaarDeployment(chainId) : null;

  if (!deployment) {
    throw new Error(
      `No deployment found for chain ID ${chainId}. Please deploy the diamond first or provide the address manually.`
    );
  }

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
      tokenAddress: "0xebba5b725A2889f7f089a6cAE0246A32cad4E26b",
      enabled: true,
      description: "Installations",
    },
    {
      tokenAddress: "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372",
      enabled: true,
      description: "REALM Parcels",
    },
    {
      tokenAddress: "0x617fdB8093b309e4699107F48812b407A7c37938",
      enabled: true,
      description: "Tiles",
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

      const tx = await gbm.toggleContractWhitelist(
        config.tokenAddress,
        config.enabled
      );
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
export async function enableContractWhitelist(
  tokenAddress: string,
  description?: string
) {
  console.log(`Enabling whitelist for ${description || tokenAddress}...`);

  const signer = await getRelayerSigner(hre);
  const chainId = hre.network.config.chainId;

  const deployment = chainId ? loadGbmBaazaarDeployment(chainId) : null;
  if (!deployment) {
    throw new Error(
      `No deployment found for chain ID ${chainId}. Please deploy the diamond first.`
    );
  }

  const gbm: GBMFacet = (await ethers.getContractAt(
    "GBMFacet",
    deployment.gbmDiamond,
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

/**
 * Helper function to disable a single contract from the whitelist
 */
export async function disableContractWhitelist(
  tokenAddress: string,
  description?: string
) {
  console.log(`Disabling whitelist for ${description || tokenAddress}...`);

  const signer = await getRelayerSigner(hre);
  const chainId = hre.network.config.chainId;

  const deployment = chainId ? loadGbmBaazaarDeployment(chainId) : null;
  if (!deployment) {
    throw new Error(
      `No deployment found for chain ID ${chainId}. Please deploy the diamond first.`
    );
  }

  const gbm: GBMFacet = (await ethers.getContractAt(
    "GBMFacet",
    deployment.gbmDiamond,
    signer
  )) as GBMFacet;

  const tx = await gbm.toggleContractWhitelist(tokenAddress, false);
  console.log(`Transaction hash: ${tx.hash}`);

  const receipt = await tx.wait();
  if (receipt.status === 1) {
    console.log(`✅ Successfully disabled ${tokenAddress}`);
  } else {
    console.log(`❌ Failed to disable ${tokenAddress}`);
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
