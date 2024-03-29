import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DiamondLoupeFacet, OwnershipFacet } from "../typechain";

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
