/* global task ethers */
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer";
import { task } from "hardhat/config";
import * as dotenv from "dotenv";

import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
require("./tasks/createBatchERC1155Auctions");

dotenv.config({ path: __dirname + "/.env" });
// require("./tasks/generateDiamondABI.js");
// require("./tasks/verifyFacet.js");
// require("./tasks/massRegisterERC721.ts");
// require("./tasks/deployUpgrade");
// require("./tasks/transferOwnership");

// This is a sample Buidler task. To learn how to create your own go to
// https://buidler.dev/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.getAddress());
  }
});

// You have to export an object to set up your config
// This object can have the following optional entries:
// defaultNetwork, networks, solc, and paths.
// Go to https://buidler.dev/config/ to learn more
module.exports = {
  etherscan: {
    apiKey: process.env.POLYGON_API_KEY,
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.MATIC_URL,
        accounts: [process.env.SECRET],
        // timeout: 1200000,
        // blockNumber: 26200790,
        // blockNumber: 13024371
      },
      blockGasLimit: 200000000,
      timeout: 120000,
      gas: "auto",
    },
    localhost: {
      timeout: 800000,
    },
    matic: {
      url: process.env.MATIC_URL,
      // url: 'https://rpc-mainnet.maticvigil.com/',
      accounts: [process.env.ITEM_MANAGER],
      // blockGasLimit: 20000000,
      blockGasLimit: 20000000,
      gasPrice: 10000000000,
      //   timeout: 90000
    },
    // kovan: {
    //   url: process.env.KOVAN_URL,
    //   // url: 'https://rpc-mainnet.maticvigil.com/',
    //   accounts: [process.env.SECRET],
    //   // blockGasLimit: 20000000,
    //   blockGasLimit: 12000000,
    //   gasPrice: 100000000000,
    //   //   timeout: 90000
    // },
    // mumbai: {
    //   url: process.env.MUMBAI,
    //   // url: 'https://rpc-mainnet.maticvigil.com/',
    //   accounts: [
    //     process.env.SECRET,
    //     process.env.SECRET_2,
    //     process.env.SECRET_3,
    //   ],
    //   // blockGasLimit: 20000000,
    //   // blockGasLimit: 12000000,
    //   // gasPrice: 100000000000,
    //   //   timeout: 90000
    // },
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 100,
    enabled: false,
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: true,
  },
  // This is a sample solc configuration that specifies which version of solc to use
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.7.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
};
