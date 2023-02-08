import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractReceipt } from "@ethersproject/contracts";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DiamondLoupeFacet, IERC20, OwnershipFacet } from "../typechain";
import { ghstAddress } from "./constants";

export const gasPrice = 1664571987845;

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
  await network.provider.send("hardhat_setBalance", [
    address,
    "0x100000000000000000",
  ]);
  let signer = await ethers.getSigner(address);
  contract = contract.connect(signer);
  return contract;
}

export function getFunctionNames(contract: Contract) {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc: string[], val: string) => {
    if (val !== "init(bytes)") {
      const func = contract.interface.getFunction(val);
      acc.push(func.name);
    }
    return acc;
  }, []);
  return selectors;
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

export function getCurrentTime(): BigNumber {
  return BigNumber.from(Math.floor(Date.now() / 1000));
}
export interface InitiatorInfo {
  startTime: BigNumber;
  endTime: BigNumber;
  tokenAmount: number;
  category: number; //0 = portal 1 = open portal 2 = pending 3 = aavegotchi
  tokenKind: string;
  tokenID: BigNumber;
}

export function getEvent(receipt: ContractReceipt, eventName: string): any {
  const events = receipt!.events!.find((event) => event.event === eventName);

  return events?.args;
}

export function toEther(amount: string) {
  return ethers.utils.parseEther(amount);
}

export async function getBalance(
  tokenAddress: string,
  recipientAddress: string
) {
  const tokenContract = await ethers.getContractAt("IERC20", tokenAddress);
  return await tokenContract.balanceOf(recipientAddress);
}

export async function getGHSTBalance(recipientAddress: string) {
  const tokenContract = await ethers.getContractAt("IERC20", ghstAddress);
  return await tokenContract.balanceOf(recipientAddress);
}

export async function warp(timeInSeconds: number) {
  const newTime = await ethers.provider.send("evm_increaseTime", [
    timeInSeconds + 86,
  ]);
  await ethers.provider.send("evm_mine", []);
  return newTime;
}
