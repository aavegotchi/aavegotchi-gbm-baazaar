import { run } from "hardhat";
import { BatchERC1155AuctionsTaskArgs } from "../tasks/createBatchERC1155Auctions";

async function createBatchWearableAuctions() {
  const common = [350, 351, 352, 353]; //
  const uncommon = [354, 356]; //
  const rare = [355, 357]; //
  const legendary = [358, 359, 360, 361]; //
  const mythical = [362, 363, 364, 365]; //
  const godlike = [366, 367, 368, 369]; //
  const ids = [common, uncommon, rare, legendary, mythical, godlike];
  const amounts = [1000, 500, 250, 100, 50, 5];

  const tokenIds = [];
  const tokenAmounts = [];
  const startTimes = [];
  const endTimes = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids[i].length; j++) {
      tokenIds.push(ids[i][j]);
      tokenAmounts.push(amounts[i]);
      startTimes.push(Math.floor(Date.now() / 1000 + 200));
      endTimes.push(Math.floor(Date.now() / 1000) + 8640);
    }
  }

  const args: BatchERC1155AuctionsTaskArgs = {
    gbmDiamondAddress: "0xD5543237C656f25EEA69f1E247b8Fa59ba353306",
    tokenContractAddress: "0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f",
    deployer: "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF",
    preset: "1",
    tokenIds: tokenIds.join(),
    tokenAmounts: tokenAmounts.join(),
    startTimes: startTimes.join(),
    endTimes: endTimes.join(),
  };

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
