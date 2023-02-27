import { BigNumber } from "ethers";

import { ethers, network } from "hardhat";

import { impersonate, warp } from "../scripts/helperFunctions";
import { deployUpgrade } from "../scripts/gbmBaazaar/upgrade-fixBidChecks";

import { GBMFacet } from "../typechain";
import { maticGBMDiamond } from "../scripts/constants";
import { expect } from "chai";
import { ERC721Generic } from "../typechain/ERC721Generic";

//constants for testing
let auctionID = "13166";
let auctionID2 = "13277";

let gbmFacet: GBMFacet;

let token: ERC721Generic;
let auctionOwner: string;

describe("Test Auction WarmUp Duration ", async function () {
  before(async function () {
    this.timeout(300000);
    console.log("deploying upgrades ");
    await deployUpgrade();

    gbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      maticGBMDiamond
    )) as GBMFacet;
  });
  it("For no bid auctions, tokens go back to the owner while claiming", async function () {
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID)).owner;
    const tokenID = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).info.tokenID;

    const tokenContract = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).tokenContract;
    token = (await ethers.getContractAt(
      "ERC721Generic",
      tokenContract
    )) as ERC721Generic;

    const balanceBefore = await token.balanceOf(auctionOwner);

    const currentTimeInSeconds: BigNumber = BigNumber.from(
      Math.floor(Date.now() / 1000)
    );
    const endTime = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).info.endTime;
    gbmFacet = await impersonate(auctionOwner, gbmFacet, ethers, network);
    await warp(Number(endTime.sub(currentTimeInSeconds).add(1000)));
    await gbmFacet.claim(auctionID);

    const balanceAfter = await token.balanceOf(auctionOwner);
    expect(balanceAfter).equal(balanceBefore.add(1));
  });

  it("For auctions with bids, tokens go to highest bidder", async function () {
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID2)).owner;
    const highestBidder = await (
      await gbmFacet.getAuctionInfo(auctionID2)
    ).highestBidder;
    const tokenID = await (
      await gbmFacet.getAuctionInfo(auctionID2)
    ).info.tokenID;

    const tokenContract = await (
      await gbmFacet.getAuctionInfo(auctionID2)
    ).tokenContract;
    token = (await ethers.getContractAt(
      "ERC721Generic",
      tokenContract
    )) as ERC721Generic;

    const balanceBefore = await token.balanceOf(highestBidder);

    const currentTimeInSeconds: BigNumber = BigNumber.from(
      Math.floor(Date.now() / 1000)
    );
    const endTime = await (
      await gbmFacet.getAuctionInfo(auctionID2)
    ).info.endTime;
    gbmFacet = await impersonate(auctionOwner, gbmFacet, ethers, network);
    await warp(Number(endTime.sub(currentTimeInSeconds).add(1000)));
    await gbmFacet.claim(auctionID2);

    const balanceAfter = await token.balanceOf(highestBidder);
    expect(balanceAfter).equal(balanceBefore.add(1));
  });
});
