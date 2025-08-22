/* global task ethers */
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer";
import * as dotenv from "dotenv";

import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
// require("./tasks/createBatchERC1155Auctions");

dotenv.config({ path: __dirname + "/.env" });
require("./tasks/generateDiamondABI.js");
// require("./tasks/verifyFacet.js");
// require("./tasks/massRegisterERC721.ts");
// require("./tasks/deployUpgrade");
// require("./tasks/transferOwnership");

// You have to export an object to set up your config
// This object can have the following optional entries:
// defaultNetwork, networks, solc, and paths.
// Go to https://buidler.dev/config/ to learn more
module.exports = {
  etherscan: {
    apiKey: {
      // matic: process.env.POLYGON_API_KEY,
      // polter: "empty",
      // geist: "empty",
      baseSepolia: process.env.BASE_API_KEY,
      base: process.env.BASE_API_KEY,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.BASE_RPC_URL,
        accounts: [process.env.SECRET],
        blockNumber: 34524730,
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
    base: {
      url: process.env.BASE_RPC_URL,
      accounts: [process.env.SECRET],
      chainId: 8453,
    },
    // baseSepolia: {
    //   url: process.env.BASE_SEPOLIA_RPC_URL,
    //   accounts: [process.env.SECRET],
    //   chainId: 84532,
    // },

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
