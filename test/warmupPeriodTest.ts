//import { BytesLike, ethers } from "ethers";

import { BigNumber, Signer } from "ethers";
import { BytesLike } from "ethers/lib/utils";
//@ts-ignore
import { ethers, network } from "hardhat";
//import { network } from "hardhat";
import * as dotenv from "dotenv";

//import {deployDiamond} from "../tasks/"
import {
  getCurrentTime,
  impersonate,
  InitiatorInfo,
  getEvent,
  getBalance,
  toEther,
  getGHSTBalance,
  warp,
} from "../scripts/helperFunctions";
import { deployUpgrade } from "../scripts/upgrades/upgrade-testGBMFacet";
import { deployWarmupUpgrade } from "../scripts/upgrades/upgrade-warmUp";
import {
  ERC1155Generic,
  ERC20Generic,
  ERC721Generic,
  GBMFacet,
  TestGBMFacet,
} from "../typechain";
import { maticGBMDiamond } from "../scripts/constants";
import { assert, expect } from "chai";

dotenv.config({ path: __dirname + "/.env" });

//constants for testing
let auctionID = "4418";
let warmupTime = 300;
let initiatorInfo: InitiatorInfo;
let tokenContract;
let tokenID;
let bid1 = "20";
let bid2 = "40";
let bid3 = "50";
let bid4 = "100";

async function toSigner(address: string) {
  const genericSigner = await ethers.getSigner(address);
  return genericSigner;
}
let ownerSigner: Signer;

let ghst: ERC20Generic;
let erc1155: ERC1155Generic;
let erc721: ERC721Generic;
let owner: string;
let gbmFacet: GBMFacet;
let mockGBMFacet: TestGBMFacet;
let erc1155auctionId1: string;
let erc1155auctionId2: string;
let erc721auctionId1: string;
let erc721auctionId2: string;

let currentHighestBid;
const erc1155ContractID = 1010;
const erc721ContractID = 1111;
let auctionOwner: string;

const erc1155typeID: BytesLike = "0x973bb640";
const erc721typeID: BytesLike = "0x73ad2146";
const bidder1 = "0x1BdEbAf12ec0CE61bCfc4c8e2bB15f1286fbfE2A";
const bidder2 = "0x6c127b8ff818d1bbbf6015c327fde5ca73a78a91";
const ghstAddress = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";

describe("Test Auction WarmUp Duration ", async function () {
  before(async function () {
    this.timeout(300000);
    console.log("deploying upgrades ");
    await deployUpgrade();
    await deployWarmupUpgrade();

    gbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      maticGBMDiamond
    )) as GBMFacet;

    mockGBMFacet = (await ethers.getContractAt(
      "TestGBMFacet",
      maticGBMDiamond
    )) as TestGBMFacet;
  });
  it("Cannot create auctions with a warmup period less than 5 minutes", async function () {
    //cancel existing onchain auction
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID)).owner;
    tokenID = await (await gbmFacet.getAuctionInfo(auctionID)).info.tokenID;

    tokenContract = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).tokenContract;

    gbmFacet = await impersonate(auctionOwner, gbmFacet, ethers, network);

    await gbmFacet.cancelAuction(auctionID);

    //create a new auction with warmup period of 4 minutes
    initiatorInfo = {
      startTime: getCurrentTime(),
      endTime: getCurrentTime().add("86400"),
      tokenAmount: 1,
      category: 4,
      tokenKind: erc721typeID,
      tokenID: tokenID,
    };

    await expect(
      gbmFacet.createAuction(initiatorInfo, tokenContract, 1, true, 100)
    ).to.revertedWith("MinimumWarmupPeriodNotReached");
  });

  it("Can create an auction with a warmup period", async function () {
    const tx = await (
      await gbmFacet.createAuction(
        initiatorInfo,
        tokenContract,
        1,
        true,
        warmupTime
      )
    ).wait();

    auctionID = getEvent(tx, "Auction_Initialized")._auctionID;
    expect(await gbmFacet.getAuctionWarmupEndTime(auctionID)).to.equal(
      await (await gbmFacet.getAuctionStartTime(auctionID)).add(warmupTime)
    );
  });

  it("bids in warmup time do not have incentives", async function () {
    const bidder1BalanceBefore = await getGHSTBalance(bidder1);
    const bidder2BalanceBefore = await getGHSTBalance(bidder2);
    mockGBMFacet = await impersonate(bidder1, mockGBMFacet, ethers, network);
    await warp(10);
    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid1),
      0,
      tokenContract,
      tokenID,
      1
    );

    //bidder 2 outbids bidder 1
    mockGBMFacet = await impersonate(bidder2, mockGBMFacet, ethers, network);
    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid2),
      toEther(bid1),
      tokenContract,
      tokenID,
      1
    );
    const bidder1balanceAfter = await getGHSTBalance(bidder1);
    //no incentives paid out
    expect(bidder1BalanceBefore).to.equal(bidder1balanceAfter);

    //warmup time is extended by 5minutes if bids are made towards end of warmup time
    const warmupTimeEnd1 = await gbmFacet.getAuctionWarmupEndTime(auctionID);
    await warp(100);
    mockGBMFacet = await impersonate(bidder1, mockGBMFacet, ethers, network);
    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid3),
      toEther(bid2),
      tokenContract,
      tokenID,
      1
    );
    const bidder2balanceAfter = await getGHSTBalance(bidder2);
    //no incentives paid out
    expect(bidder2BalanceBefore).to.equal(bidder2balanceAfter);
    //warmupTime extended
    const warmupTimeEnd2 = await gbmFacet.getAuctionWarmupEndTime(auctionID);
    assert.isAtMost(
      Number(warmupTimeEnd2),
      Number(warmupTimeEnd1.add(warmupTime))
    );
  });

  it("incentives should be paid out after auctions leave the warmup period", async function () {
    await warp(2000);
    const bidder1BalanceBefore = await getGHSTBalance(bidder1);
    const incentive = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).dueIncentives;
    mockGBMFacet = await impersonate(bidder2, mockGBMFacet, ethers, network);
    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid4),
      toEther(bid3),
      tokenContract,
      tokenID,
      1
    );
    const bidder1BalanceAfter = await getGHSTBalance(bidder1);
    expect(bidder1BalanceAfter).to.equal(
      bidder1BalanceBefore.add(toEther(bid3).add(incentive))
    );
  });
});
