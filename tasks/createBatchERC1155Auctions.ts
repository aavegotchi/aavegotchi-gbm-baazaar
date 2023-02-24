/* global ethers hre task */

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
// @ts-ignore
import { AuctionPreset } from "../types";
import { gasPrice, getSigner } from "../scripts/helperFunctions";
import { BigNumber } from "ethers";

export interface BatchERC1155AuctionsTaskArgs {
  gbmDiamondAddress: string;
  deployer: string;
  tokenContractAddress: string;
  tokenIds: string;
  tokenAmounts: string;
  startTimes: string;
  endTimes: string;
  preset: string;
  categories: string;
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
  .addParam("categories", "Categories of the auctions")
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

      const startTimes = taskArgs.startTimes
        .split(",")
        .filter((str) => str.length > 0);

      const endTimes = taskArgs.endTimes
        .split(",")
        .filter((str) => str.length > 0);

      const categories = taskArgs.categories
        .split(",")
        .filter((str) => str.length > 0);

      const signer = await getSigner(hre, deployer);
      const erc1155 = await hre.ethers.getContractAt(
        "ERC1155Generic",
        tokenContractAddress,
        signer
      );
      //
      // console.log("Approving:");

      // const tx = await erc1155.setApprovalForAll(gbmDiamondAddress, true, {
      //   gasPrice: gasPrice,
      // });
      // await tx.wait();

      // console.log("Approved");

      const gbm = await hre.ethers.getContractAt(
        "GBMFacet",
        gbmDiamondAddress,
        signer
      );

      const batchSize = 25;

      const skip = 0;

      const remainingTokenIds = tokenIds.slice(skip);
      const remainingStartTimes = startTimes.slice(skip);
      const remainingEndTimes = endTimes.slice(skip);
      const remainingCategories = categories.slice(skip);

      const numBatches = Math.ceil(remainingTokenIds.length / batchSize);

      for (let i = 0; i < numBatches; i++) {
        const batchTokenIds = remainingTokenIds.slice(
          i * batchSize,
          (i + 1) * batchSize
        );

        const batchStartTimes = remainingStartTimes.slice(
          i,
          (i + 1) * batchSize
        );
        const batchEndTimes = remainingEndTimes.slice(
          i * batchSize,
          (i + 1) * batchSize
        );
        const batchCategories = remainingCategories.slice(
          i * batchSize,
          (i + 1) * batchSize
        );

        const finalAuctionDetails = [];
        const finalAddresses = [];
        const finalPresetIds = [];

        //prevent undefined
        for (let j = 0; j < batchSize; j++) {
          if (batchTokenIds[j]) {
            finalAddresses.push(tokenContractAddress);
            finalPresetIds.push(preset);
            finalAuctionDetails.push({
              startTime: batchStartTimes[j],
              endTime: batchEndTimes[j],
              tokenAmount: 1,
              tokenKind: "0x973bb640", //ERC1155
              tokenID: batchTokenIds[j],
              category: batchCategories[j],
            });
          }
        }

        let currentGasPrice = await signer.provider.getGasPrice();

        const gwei300 = hre.ethers.utils.parseUnits("300", "gwei");
        const gwei1000 = hre.ethers.utils.parseUnits("500", "gwei");

        console.log("current:", currentGasPrice);

        if (currentGasPrice.gt(gwei300) && currentGasPrice.lt(gwei1000)) {
          console.log("Gas is in a nice range. Continue.");
        } else if (currentGasPrice.lt(gwei300)) {
          currentGasPrice = gwei300;
          console.log("Gas is below 300. Setting to 300");
        } else {
          throw new Error("Gas is too high!");
        }

        console.log(`Deploying batch: ${i} of ${numBatches}`);

        console.log("batch token ids:", batchTokenIds);
        // console.log("final addresses:", finalAddresses);
        // console.log("final presets:", finalPresetIds);

        const finalGasPrice = currentGasPrice.toString();

        if (BigNumber.from(finalGasPrice).gt(gwei1000)) {
          throw new Error("Gas is too high!");
        }

        console.log("Final gas price:", finalGasPrice.toString());

        // const gasFee = await signer.provider.getFeeData();

        // console.log("gas fee:", gasFee.mul(2).toString());

        const tx = await gbm.batchCreateAuctions(
          finalAuctionDetails,
          finalAddresses,
          finalPresetIds,
          {
            gasPrice: finalGasPrice,
          }
        );

        const txReceipt = await tx.wait();

        // const event = txReceipt.events.find(
        //   (event) => event.event === "Auction_Initialized"
        // );
        // console.log(`Auction initialized with ID: ${event.args._auctionID}`);
      }
    }
  );
