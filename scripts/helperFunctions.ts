import { Signer, Contract } from "ethers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DiamondLoupeFacet, OwnershipFacet } from "../typechain";

import {
  DefenderRelayProvider,
  DefenderRelaySigner,
} from "defender-relay-client/lib/ethers";

export const gasPrice = 300000000000;

export interface InitiatorInfo {
  startTime: BigNumber;
  endTime: BigNumber;
  tokenAmount: number;
  category: number; //0 = portal 1 = open portal 2 = pending 3 = aavegotchi
  tokenKind: string;
  tokenID: BigNumber;
}

export async function impersonate(
  address: string,
  contract: any,
  ethers: any,
  network: any
) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  let signer = await ethers.getSigner(address);
  contract = contract.connect(signer);
  return contract;
}

export async function resetChain(hre: any) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.MATIC_URL,
        },
      },
    ],
  });
}

export function getSighashes(selectors: string[], ethers: any): string[] {
  if (selectors.length === 0) return [];
  const sighashes: string[] = [];
  selectors.forEach((selector) => {
    if (selector !== "") sighashes.push(getSelector(selector, ethers));
  });
  return sighashes;
}

export function getSelectors(contract: Contract) {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc: string[], val: string) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, []);
  return selectors;
}

export function getSelector(func: string, ethers: any) {
  const abiInterface = new ethers.utils.Interface([func]);
  return abiInterface.getSighash(ethers.utils.Fragment.from(func));
}

export const maticDiamondUpgrader =
  "0x22262f6e7969CE2bA58238f33e717C36060F33B4";
export const maticDiamondAddress = "0xa44c8e0eCAEFe668947154eE2b803Bd4e6310EFe";

export const itemManager = "0xa370f2ADd2A9Fba8759147995d6A0641F8d7C119";

export async function diamondOwner(address: string, ethers: any) {
  return await (await ethers.getContractAt("OwnershipFacet", address)).owner();
}

export async function getFunctionsForFacet(facetAddress: string, ethers: any) {
  const Loupe = (await ethers.getContractAt(
    "DiamondLoupeFacet",
    maticDiamondAddress
  )) as DiamondLoupeFacet;
  const functions = await Loupe.facetFunctionSelectors(facetAddress);
  return functions;
}

export async function getDiamondSigner(
  hre: HardhatRuntimeEnvironment,
  override?: string,
  useLedger?: boolean
) {
  //Instantiate the Signer
  let signer: Signer;
  const owner = await (
    (await hre.ethers.getContractAt(
      "OwnershipFacet",
      maticDiamondAddress
    )) as OwnershipFacet
  ).owner();
  const testing = ["hardhat", "localhost"].includes(hre.network.name);

  if (testing) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [override ? override : owner],
    });
    return await hre.ethers.getSigner(override ? override : owner);
  } else if (hre.network.name === "matic") {
    return (await hre.ethers.getSigners())[0];
  } else {
    throw Error("Incorrect network selected");
  }
}

export async function getSigner(
  hre: HardhatRuntimeEnvironment,
  deployer: string
) {
  let testing = ["hardhat", "localhost"].includes(hre.network.name);

  if (testing) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [deployer],
    });
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [deployer, "0x100000000000000000000000"],
    });
    return await hre.ethers.getSigner(deployer);
  } else {
    const accounts = await hre.ethers.getSigners();

    return accounts[0];
  }
}

export function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function warp(timeInSeconds: number) {
  const newTime = await ethers.provider.send("evm_increaseTime", [
    timeInSeconds + 86,
  ]);
  await ethers.provider.send("evm_mine", []);
  return newTime;
}

export const xpRelayerAddress = "0xb6384935d68e9858f8385ebeed7db84fc93b1420";
export const xpRelayerAddressBaseSepolia =
  "0x9343363e8e6518ba7166ce702a7589e7bbd1fd81";
export const xpRelayerAddressBase = "";

export interface RelayerInfo {
  apiKey: string;
  apiSecret: string;
}

export async function getRelayerSigner(hre: HardhatRuntimeEnvironment) {
  const testing = ["hardhat", "localhost"].includes(hre.network.name);
  let xpRelayer;
  if (
    hre.network.config.chainId === 137 ||
    hre.network.config.chainId === 8453
  ) {
    xpRelayer = xpRelayerAddress;
  } else if (hre.network.config.chainId === 84532) {
    xpRelayer = xpRelayerAddressBaseSepolia;
  }

  if (testing) {
    if (hre.network.config.chainId !== 31337) {
      console.log("Using Hardhat");

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [xpRelayer],
      });
      await hre.network.provider.request({
        method: "hardhat_setBalance",
        params: [xpRelayerAddress, "0x100000000000000000000000"],
      });
      return await hre.ethers.provider.getSigner(xpRelayerAddress);
    } else {
      return (await hre.ethers.getSigners())[0];
    }
    //we assume same defender for base mainnet
  } else if (hre.network.name === "matic" || hre.network.name === "base") {
    console.log("USING MAINNET RELAYER");

    const credentials: RelayerInfo = {
      apiKey: process.env.DEFENDER_APIKEY!,
      apiSecret: process.env.DEFENDER_SECRET!,
    };

    const provider = new DefenderRelayProvider(credentials);
    return new DefenderRelaySigner(credentials, provider, {
      speed: "safeLow",
      validForSeconds: 7200,
    });
  } else if (hre.network.name === "baseSepolia") {
    console.log("USING BASE SEPOLIA DEFENDER");
    const credentials: RelayerInfo = {
      apiKey: process.env.DEFENDER_APIKEY_BASESEPOLIA!,
      apiSecret: process.env.DEFENDER_SECRET_BASESEPOLIA!,
    };

    const provider = new DefenderRelayProvider(credentials);
    return new DefenderRelaySigner(credentials, provider, {
      speed: "safeLow",
      validForSeconds: 180,
    });
  } else if (
    ["tenderly", "polter", "amoy", "geist"].includes(hre.network.name)
  ) {
    //impersonate
    return (await hre.ethers.getSigners())[0];
  } else {
    throw Error("Incorrect network selected");
  }
}

export async function verifyContract(
  address: string,
  withArgs: boolean = false,
  args?: any[],
  contractName?: string
) {
  //only try to verify if it is a live network

  //@ts-ignore
  if (["localhost", "hardhat"].includes(hre.network.name)) {
    console.log("Skipping verification on local network");
    return;
  }

  console.log(`Attempting to verify contract at ${address}...`);
  //wait for 3 seconds
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    const verifyArgs: any = {
      address,
    };

    if (withArgs && args) {
      verifyArgs.constructorArguments = args;
    }

    if (contractName) {
      verifyArgs.contract = contractName;
    }

    //@ts-ignore
    await hre.run("verify:verify", verifyArgs);
    console.log(`Successfully verified contract ${address}`);
  } catch (error: any) {
    const msg = error?.message || "";
    if (
      msg.includes("Already Verified") ||
      msg.includes("ContractAlreadyVerified") || // Added to catch Etherscan's newer message
      msg.includes("already verified") || // General catch
      msg.includes("Contract source code already verified") // Another Etherscan variant
    ) {
      console.log(
        `Contract ${address}${
          contractName ? " (" + contractName + ")" : ""
        } already verified on block explorer, skipping.`
      );
    } else {
      console.error(
        `Error verifying contract ${address}${
          contractName ? " (" + contractName + ")" : ""
        }:`,
        msg
      );
    }
  }
}
