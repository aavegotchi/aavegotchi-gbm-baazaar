import { HardhatEthersHelpers } from "hardhat/types";
import { BigNumberish } from "ethers";
import * as fs from "fs";
import * as path from "path";

export const WEARABLE_GAP_OFFSET = 1000000000;

// Forge asset token IDs
export const ALLOY = WEARABLE_GAP_OFFSET + 0;
export const ESSENCE = WEARABLE_GAP_OFFSET + 1;
export const GEODE_COMMON = WEARABLE_GAP_OFFSET + 2;
export const GEODE_UNCOMMON = WEARABLE_GAP_OFFSET + 3;
export const GEODE_RARE = WEARABLE_GAP_OFFSET + 4;
export const GEODE_LEGENDARY = WEARABLE_GAP_OFFSET + 5;
export const GEODE_MYTHICAL = WEARABLE_GAP_OFFSET + 6;
export const GEODE_GODLIKE = WEARABLE_GAP_OFFSET + 7;

export const CORE_BODY_COMMON = WEARABLE_GAP_OFFSET + 8;
export const CORE_BODY_UNCOMMON = WEARABLE_GAP_OFFSET + 9;
export const CORE_BODY_RARE = WEARABLE_GAP_OFFSET + 10;
export const CORE_BODY_LEGENDARY = WEARABLE_GAP_OFFSET + 11;
export const CORE_BODY_MYTHICAL = WEARABLE_GAP_OFFSET + 12;
export const CORE_BODY_GODLIKE = WEARABLE_GAP_OFFSET + 13;

export const CORE_FACE_COMMON = WEARABLE_GAP_OFFSET + 14;
export const CORE_FACE_UNCOMMON = WEARABLE_GAP_OFFSET + 15;
export const CORE_FACE_RARE = WEARABLE_GAP_OFFSET + 16;
export const CORE_FACE_LEGENDARY = WEARABLE_GAP_OFFSET + 17;
export const CORE_FACE_MYTHICAL = WEARABLE_GAP_OFFSET + 18;
export const CORE_FACE_GODLIKE = WEARABLE_GAP_OFFSET + 19;

export const CORE_EYES_COMMON = WEARABLE_GAP_OFFSET + 20;
export const CORE_EYES_UNCOMMON = WEARABLE_GAP_OFFSET + 21;
export const CORE_EYES_RARE = WEARABLE_GAP_OFFSET + 22;
export const CORE_EYES_LEGENDARY = WEARABLE_GAP_OFFSET + 23;
export const CORE_EYES_MYTHICAL = WEARABLE_GAP_OFFSET + 24;
export const CORE_EYES_GODLIKE = WEARABLE_GAP_OFFSET + 25;

export const CORE_HEAD_COMMON = WEARABLE_GAP_OFFSET + 26;
export const CORE_HEAD_UNCOMMON = WEARABLE_GAP_OFFSET + 27;
export const CORE_HEAD_RARE = WEARABLE_GAP_OFFSET + 28;
export const CORE_HEAD_LEGENDARY = WEARABLE_GAP_OFFSET + 29;
export const CORE_HEAD_MYTHICAL = WEARABLE_GAP_OFFSET + 30;
export const CORE_HEAD_GODLIKE = WEARABLE_GAP_OFFSET + 31;

export const CORE_HANDS_COMMON = WEARABLE_GAP_OFFSET + 32;
export const CORE_HANDS_UNCOMMON = WEARABLE_GAP_OFFSET + 33;
export const CORE_HANDS_RARE = WEARABLE_GAP_OFFSET + 34;
export const CORE_HANDS_LEGENDARY = WEARABLE_GAP_OFFSET + 35;
export const CORE_HANDS_MYTHICAL = WEARABLE_GAP_OFFSET + 36;
export const CORE_HANDS_GODLIKE = WEARABLE_GAP_OFFSET + 37;

export const CORE_PET_COMMON = WEARABLE_GAP_OFFSET + 38;
export const CORE_PET_UNCOMMON = WEARABLE_GAP_OFFSET + 39;
export const CORE_PET_RARE = WEARABLE_GAP_OFFSET + 40;
export const CORE_PET_LEGENDARY = WEARABLE_GAP_OFFSET + 41;
export const CORE_PET_MYTHICAL = WEARABLE_GAP_OFFSET + 42;
export const CORE_PET_GODLIKE = WEARABLE_GAP_OFFSET + 43;

function varsByChainId(chainId: number) {
  if ([137, 80001, 31337, 8453, 84532].includes(chainId))
    return networkToVars[chainId];
  else return networkToVars[137];
}

export async function varsForNetwork(ethers: HardhatEthersHelpers) {
  return varsByChainId((await ethers.provider.getNetwork()).chainId);
}

export interface Constants {
  id?: number;
  aavegotchiDiamond: string;
  realmDiamond: string;
  forgeDiamond?: string;
  installationDiamond: string;
  tileDiamond: string;
  ghst: string;
  defenderRelayer?: string;
  gbmDiamond?: string;
  //ecosystem addresses
  pixelcraft: string;
  DAO: string;
  GBM: string;
  rarityFarming: string;
  fakeGotchiCardDiamond?: string;
  fakeGotchiArtDiamond?: string;
  ggSkinsDiamond?: string;
  ggProfilesDiamond?: string;
}

interface NetworkToConstants {
  [network: number]: Constants;
}

export const maticVars: Constants = {
  aavegotchiDiamond: "0x86935F11C86623deC8a25696E1C19a8659CbF95d",
  realmDiamond: "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11",
  installationDiamond: "0x19f870bD94A34b3adAa9CaA439d333DA18d6812A",
  tileDiamond: "0x9216c31d8146bCB3eA5a9162Dc1702e8AEDCa355",
  ghst: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7",
  defenderRelayer: "0xb6384935d68e9858f8385ebeed7db84fc93b1420",
  pixelcraft: "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64",
  DAO: "0xb208f8BB431f580CC4b216826AFfB128cd1431aB",
  GBM: "0xA7427d0D45e8dd969049872F9cDE383716A39B23",
  rarityFarming: "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098",
};

export const baseSepoliaVars: Constants = {
  aavegotchiDiamond: "0x03A74B3e2DD81F5E8FFA1Fb96bb81B35cF3ed5d2",
  realmDiamond: "0x37D140074B2f771bEa7ef23288EB87064e45bF8D",
  installationDiamond: "0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609",
  forgeDiamond: "0x40742c1D9dd604889aD45D2f85bE9C9A7609C4cB",
  tileDiamond: "0x96B19Fa954d961fAD4b665e3259C72466ca4C1dA",
  ghst: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  pixelcraft: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  DAO: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  GBM: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  rarityFarming: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  gbmDiamond: "0x0f685B66D7a5E67EDC584c5FdD28E38ba05fAFbb",
  fakeGotchiCardDiamond: "0xE4E508dab5D7d98f4c06aB6D24bB225588036C9D",
  fakeGotchiArtDiamond: "0xD0dCC1d1E22D490e5270631787E1866E773b16C7",
  ggSkinsDiamond: "0xab1e7e320f02107bf2748179ed0c0bcfd5532e4a",
  ggProfilesDiamond: "0x15517138573ce459943da529c9530ef76a22b713",
};

export const localVars: Constants = {
  aavegotchiDiamond: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  realmDiamond: "0x37D140074B2f771bEa7ef23288EB87064e45bF8D",
  installationDiamond: "0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609",
  tileDiamond: "0x96B19Fa954d961fAD4b665e3259C72466ca4C1dA",
  ghst: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  pixelcraft: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  DAO: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  GBM: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
  rarityFarming: "0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F",
};

const baseVars: Constants = {
  aavegotchiDiamond: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
  realmDiamond: "",
  installationDiamond: "",
  tileDiamond: "",
  forgeDiamond: "0x50aF2d63b839aA32b4166FD1Cb247129b715186C",
  ghst: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
  pixelcraft: "0x50Def14C51123660f8768b511B93cC8c09f30356",
  DAO: "0x939b67F6F6BE63E09B0258621c5A24eecB92631c",
  GBM: "0xA7427d0D45e8dd969049872F9cDE383716A39B23",
  rarityFarming: "0x8c8E076Cd7D2A17Ba2a5e5AF7036c2b2B7F790f6",
   gbmDiamond: "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31",
  fakeGotchiCardDiamond: "0xe46B8902dAD841476d9Fee081F1d62aE317206A9",
  fakeGotchiArtDiamond: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
  ggSkinsDiamond: "",
  ggProfilesDiamond: "",
};

//add base mainnet vars here

const networkToVars: NetworkToConstants = {
  137: maticVars,
  // 63157: geistVars, //update to basevars
  8453: baseVars,
  84532: baseSepoliaVars,
  31337: localVars,
};

export interface Preset {
  incMin: BigNumberish;
  incMax: BigNumberish;
  bidMultiplier: BigNumberish;
  stepMin: BigNumberish;
  bidDecimals: BigNumberish;
}

export interface GbmBaazaarDeployment {
  gbmDiamond: string;
  presets: Preset[];
  whitelistedTokens: string[];
}

interface NetworkDeployments {
  [chainId: number]: GbmBaazaarDeployment;
}

const DEPLOYED_DIAMONDS_PATH = path.join(__dirname, "deployedDiamonds.json");

export function saveGbmBaazaarDeployment(
  chainId: number,
  deployment: GbmBaazaarDeployment
) {
  // Load existing deployments if file exists
  let allDeployments: NetworkDeployments = {};
  if (fs.existsSync(DEPLOYED_DIAMONDS_PATH)) {
    allDeployments = JSON.parse(
      fs.readFileSync(DEPLOYED_DIAMONDS_PATH, "utf8")
    );
  }

  // Update deployments for the specific chain
  allDeployments[chainId] = deployment;

  // Save back to file
  fs.writeFileSync(
    DEPLOYED_DIAMONDS_PATH,
    JSON.stringify(allDeployments, null, 2)
  );
}
