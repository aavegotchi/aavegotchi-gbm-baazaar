# GBM_Baazaar_Diamond_Aavegotchi

Working repo for the GBM Baazar auction contract

# All tests are written in solidity, to run

- Install foundry using foundryup
  Run
  ```bash
  forge update && forge test
  ```

## constants

```
const ghstAddress = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";
const \_pixelcraft = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";
const \_playerRewards = "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098";
const \_daoTreasury = "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";


let startTime = Math.floor(Date.now() / 1000);
let endTime = Math.floor(Date.now() / 1000) + 86400;
let hammerTimeDuration = 1200;
let bidDecimals = 100000;
let stepMin = 15000;
let incMax = 15000;
let incMin = 1500;
let bidMultiplier = 18270;

```
