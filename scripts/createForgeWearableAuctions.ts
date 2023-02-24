import { run } from "hardhat";
import { BatchERC1155AuctionsTaskArgs } from "../tasks/createBatchERC1155Auctions";
import {
  CORE_BODY_COMMON,
  CORE_BODY_GODLIKE,
  CORE_EYES_COMMON,
  CORE_EYES_GODLIKE,
  CORE_EYES_LEGENDARY,
  CORE_EYES_UNCOMMON,
  CORE_FACE_GODLIKE,
  CORE_FACE_LEGENDARY,
  CORE_FACE_RARE,
  CORE_FACE_UNCOMMON,
  CORE_HANDS_GODLIKE,
  CORE_HEAD_GODLIKE,
  CORE_PET_COMMON,
  CORE_PET_GODLIKE,
  CORE_PET_RARE,
} from "../helpers/constants";
import { getRandomInt } from "./helperFunctions";
import { upgradeBatchCreate } from "./gbmBaazaar/upgrade-batchCreate";

async function createBatchWearableAuctions() {
  // schematic auction
  const common = [350, 351, 352, 353]; //2400
  const uncommon = [354, 356]; //600
  const rare = [355, 357]; //300
  const legendary = [358, 359, 360, 361]; //0
  const mythical = [362, 363, 364, 365]; //120
  const godlike = [366, 367, 368, 369]; //12
  const schematicIds = [common, uncommon, rare, legendary, mythical, godlike];
  const amounts = [600, 300, 150, 0, 30, 3];

  const tokenIds = [];
  const startTimes = [];
  const endTimes = [];
  const categories = [];

  const auctionDuration = 86400 * 2;

  const delayTime = 1000; //to prevent erroring

  // await upgradeBatchCreate();

  for (let i = 0; i < schematicIds.length; i++) {
    if (amounts[i] === 0) {
      continue;
    }
    for (let j = 0; j < schematicIds[i].length; j++) {
      for (let k = 0; k < amounts[i]; k++) {
        const startTime = Math.floor(Date.now() / 1000) + delayTime;
        const endTime = startTime + auctionDuration;

        tokenIds.push(schematicIds[i][j]);
        startTimes.push(startTime);
        endTimes.push(endTime);
        categories.push(8); //schematics are 8 in the baazaar
      }
    }
  }

  // core auction
  const coreIds = [
    CORE_BODY_COMMON,
    CORE_EYES_COMMON,
    CORE_PET_COMMON,
    CORE_FACE_RARE,
    CORE_FACE_UNCOMMON,
    CORE_EYES_UNCOMMON,
    CORE_PET_RARE,
    CORE_EYES_LEGENDARY,
    CORE_FACE_LEGENDARY,
    CORE_HANDS_GODLIKE,
    CORE_FACE_GODLIKE,
    CORE_HEAD_GODLIKE,
    CORE_BODY_GODLIKE,
    CORE_EYES_GODLIKE,
    CORE_PET_GODLIKE,
  ];
  const coreAmounts = [
    600,
    300,
    300,
    300,
    250,
    250,
    50,
    50,
    50,
    2,
    2,
    1,
    1,
    1,
    1,
    ,
  ]; //total = 2158

  for (let i = 0; i < coreIds.length; i++) {
    if (coreAmounts[i] === 0) {
      continue;
    }

    for (let k = 0; k < coreAmounts[i]; k++) {
      const startTime = Math.floor(Date.now() / 1000) + delayTime;

      const endTime = startTime + auctionDuration;

      tokenIds.push(coreIds[i]);
      // tokenAmounts.push(coreAmounts[i]);
      startTimes.push(startTime);
      endTimes.push(endTime);
      categories.push(11); //cores are 11 in the baazaar
    }
  }

  const args: BatchERC1155AuctionsTaskArgs = {
    gbmDiamondAddress: "0xD5543237C656f25EEA69f1E247b8Fa59ba353306",
    tokenContractAddress: "0x4fDfc1B53Fd1D80d969C984ba7a8CE4c7bAaD442", // forge diamond
    deployer: "0x8D46fd7160940d89dA026D59B2e819208E714E82",
    preset: "1",
    tokenIds: tokenIds.join(","),
    tokenAmounts: Array(tokenIds.length).fill(1).join(","),
    startTimes: startTimes.join(","),
    endTimes: endTimes.join(","),
    categories: categories.join(","),
  };

  console.log("Total number of auctions to create:", tokenIds.length);

  await run("createBatchERC1155Auctions", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  createBatchWearableAuctions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
