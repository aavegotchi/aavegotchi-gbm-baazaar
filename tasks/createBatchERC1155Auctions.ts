/* global ethers hre task */

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
// @ts-ignore
import { AuctionPreset } from "../types";
import { getSigner } from "../scripts/helperFunctions";

export interface BatchERC1155AuctionsTaskArgs {
  gbmDiamondAddress: string;
  deployer: string;
  tokenContractAddress: string;
  tokenIds: string;
  tokenAmounts: string;
  startTimes: string;
  endTimes: string;
  preset: string;
  // preset: AuctionPreset;
}

task("createBatchERC1155Auctions", "Create batch ERC1155 in auction")
  .addParam("gbmDiamondAddress")
  .addParam("deployer", "The address of the deployer")
  .addParam("tokenContractAddress", "The contract address of the token")
  .addParam("preset", "Preset id")
  .addParam("tokenIds", "Comma-separated string of tokenIDs")
  .addParam("tokenAmounts", "Comma-separated string of tokenAmounts")
  .addParam("startTimes", "Comma-separated string of startTimes")
  .addParam("endTimes", "Comma-separated string of endTimes")
  .setAction(
    async (
      taskArgs: BatchERC1155AuctionsTaskArgs,
      hre: HardhatRuntimeEnvironment
    ) => {
      const gbmDiamondAddress = taskArgs.gbmDiamondAddress;
      const deployer = taskArgs.deployer;
      const tokenContractAddress = taskArgs.tokenContractAddress;
      const preset = taskArgs.preset;
      const tokenIds = taskArgs.tokenIds
        .split(",")
        .filter((str) => str.length > 0);
      const tokenAmounts = taskArgs.tokenAmounts
        .split(",")
        .filter((str) => str.length > 0);
      const startTimes = taskArgs.startTimes
        .split(",")
        .filter((str) => str.length > 0);
      const endTimes = taskArgs.endTimes
        .split(",")
        .filter((str) => str.length > 0);

      const signer = await getSigner(hre, deployer);
      const erc1155 = await hre.ethers.getContractAt(
        "ERC1155Generic",
        tokenContractAddress,
        signer
      );
      await erc1155.setApprovalForAll(gbmDiamondAddress, true);

      const gbm = await hre.ethers.getContractAt(
        "GBMFacet",
        gbmDiamondAddress,
        signer
      );

      for (let i = 0; i < tokenIds.length; i++) {
        const auctionDetails = {
          startTime: startTimes[i],
          endTime: endTimes[i],
          tokenAmount: tokenAmounts[i],
          tokenKind: "0x973bb640", //ERC1155
          tokenID: tokenIds[i],
          category: 5,
        };
        const txReceipt = await (
          await gbm.createAuction(auctionDetails, tokenContractAddress, preset)
        ).wait();
        const event = txReceipt.events.find(
          (event) => event.event === "Auction_Initialized"
        );
        console.log(
          `Auction initialized. auction id: ${event.args._auctionID}`
        );
      }
    }
  );
