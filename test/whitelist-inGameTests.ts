import { BigNumber } from "ethers";
import { BytesLike } from "ethers/lib/utils";

import { ethers, network } from "hardhat";

import {
  getCurrentTime,
  impersonate,
  InitiatorInfo,
  getEvent,
  toEther,
  warp,
} from "../scripts/helperFunctions";
import { deployTestGBMUpgrade } from "../scripts/gbmBaazaar/upgrade-testGBMFacet";
import { deployUpgrade } from "../scripts/gbmBaazaar/upgrade-inGameBidding";
import { GBMFacet, TestGBMFacet } from "../typechain";
import { maticGBMDiamond } from "../scripts/constants";
import { expect } from "chai";
import { WhitelistFacet } from "../typechain/WhitelistFacet";

//constants for testing
let auctionID = "13977";
let whiteListId;
let initiatorInfo: InitiatorInfo;
let tokenContract;
let tokenID;
let bid1 = "20";

let gbmFacet: GBMFacet;
let mockGBMFacet: TestGBMFacet;
let whitelistFacet: WhitelistFacet;
let auctionOwner: string;

let placeHolderTime: BigNumber;

const erc721typeID: BytesLike = "0x73ad2146";
const bidder1 = "0x1BdEbAf12ec0CE61bCfc4c8e2bB15f1286fbfE2A";

describe("Test GBM Auction In-Game Bidding and Whitelists ", async function () {
  before(async function () {
    this.timeout(300000);
    await deployUpgrade();
    await deployTestGBMUpgrade();

    gbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      maticGBMDiamond
    )) as GBMFacet;

    mockGBMFacet = (await ethers.getContractAt(
      "TestGBMFacet",
      maticGBMDiamond
    )) as TestGBMFacet;

    whitelistFacet = (await ethers.getContractAt(
      "WhitelistFacet",
      maticGBMDiamond
    )) as WhitelistFacet;
    placeHolderTime = getCurrentTime();
  });
  it("Can create gotchiverse-gated auctions", async function () {
    //cancel existing onchain auction
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID)).owner;
    tokenID = await (await gbmFacet.getAuctionInfo(auctionID)).info.tokenID;

    tokenContract = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).tokenContract;

    gbmFacet = await impersonate(auctionOwner, gbmFacet, ethers, network);

    await gbmFacet.cancelAuction(auctionID);

    //create a new auction with gotchiverse-only bidding
    initiatorInfo = {
      startTime: placeHolderTime.add("10"),
      endTime: placeHolderTime.add("3610"),
      tokenAmount: 1,
      category: 4,
      tokenKind: erc721typeID,
      tokenID: tokenID,
    };

    const tx1 = await gbmFacet.createAuctionWithModifiers(
      initiatorInfo,
      tokenContract,
      1,
      1,
      0
    );
    const tx = await tx1.wait();
    auctionID = getEvent(tx, "Auction__InitialiazedWithModifiers")._auctionID;
  });

  it("Cannot bid if not in game", async function () {
    mockGBMFacet = await impersonate(bidder1, mockGBMFacet, ethers, network);
    await warp(100);
    await expect(
      mockGBMFacet.mockCommitBid(
        auctionID,
        toEther(bid1),
        0,
        tokenContract,
        tokenID,
        1,
        false
      )
    ).to.be.revertedWith("Must be in-game to bid");
  });

  it("Can bid if in game", async function () {
    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid1),
      0,
      tokenContract,
      tokenID,
      1,
      true
    );

    const highestBidder = await gbmFacet.getAuctionHighestBidder(auctionID);
    const highestBid = await gbmFacet.getAuctionHighestBid(auctionID);
    expect(highestBidder).to.equal(bidder1);
    expect(highestBid).to.equal(toEther(bid1));
  });

  it("Cannot use non-existent whitelists", async function () {
    //cancel existing onchain auction during cancellation period
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID)).owner;
    tokenID = await (await gbmFacet.getAuctionInfo(auctionID)).info.tokenID;
    tokenContract = await (
      await gbmFacet.getAuctionInfo(auctionID)
    ).tokenContract;
    await warp(4700);
    gbmFacet = await impersonate(auctionOwner, gbmFacet, ethers, network);

    await gbmFacet.cancelAuction(auctionID);

    //create a new auction with gotchiverse-only bidding
    initiatorInfo = {
      startTime: placeHolderTime.add("10000"),
      endTime: placeHolderTime.add("96400"),
      tokenAmount: 1,
      category: 4,
      tokenKind: erc721typeID,
      tokenID: tokenID,
    };
    await expect(
      gbmFacet.createAuctionWithModifiers(initiatorInfo, tokenContract, 1, 2, 0)
    ).to.be.revertedWith("NonExistentWhitelist");
  });

  it("Can create a whitelist", async function () {
    whitelistFacet = await impersonate(
      auctionOwner,
      whitelistFacet,
      ethers,
      network
    );

    const tx = await whitelistFacet.createWhitelist("Sample", [bidder1]);
    const tx1 = await tx.wait();
    whiteListId = getEvent(tx1, "WhitelistCreated").whitelistId;
    const whitelistLength = await whitelistFacet.getWhitelistsLength();
    const whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);
    const isWhitelisted = await whitelistFacet.isWhitelisted(
      whiteListId,
      bidder1
    );
    expect(whitelistLength).to.equal(1);
    expect(whitelistDetails.name).to.equal("Sample");

    expect(whitelistDetails.addresses.length).to.equal(1);
    expect(whitelistDetails.owner).to.equal(auctionOwner);
    expect(whitelistDetails.addresses[0]).to.equal(bidder1);
    expect(isWhitelisted).to.be.true;
  });

  it("Can mutate a whitelist", async function () {
    await whitelistFacet.removeAddressesFromWhitelist(whiteListId, [bidder1]);
    const isWhitelisted = await whitelistFacet.isWhitelisted(
      whiteListId,
      bidder1
    );
    const whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);

    expect(isWhitelisted).to.be.false;
    expect(whitelistDetails.addresses.length).to.equal(0);
  });

  it("Cannot bid if not whitelisted", async function () {
    initiatorInfo = {
      startTime: placeHolderTime.add("10000"),
      endTime: placeHolderTime.add("86400"),
      tokenAmount: 1,
      category: 4,
      tokenKind: erc721typeID,
      tokenID: tokenID,
    };

    const tx1 = await gbmFacet.createAuctionWithModifiers(
      initiatorInfo,
      tokenContract,
      1,
      2,
      whiteListId
    );

    await warp(12000);
    gbmFacet = await impersonate(bidder1, gbmFacet, ethers, network);
    const tx = await tx1.wait();
    auctionID = getEvent(tx, "Auction__InitialiazedWithModifiers")._auctionID;

    await expect(
      mockGBMFacet.mockCommitBid(
        auctionID,
        toEther(bid1),
        0,
        tokenContract,
        tokenID,
        1,
        true
      )
    ).to.be.revertedWith("NotWhitelisted");
  });

  it("Can bid if whitelisted", async function () {
    //whitelist bidder1
    await whitelistFacet.updateWhitelist(whiteListId, [bidder1]);
    const whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);
    expect(whitelistDetails.addresses.length).to.equal(1);
    expect(whitelistDetails.addresses[0]).to.equal(bidder1);

    await mockGBMFacet.mockCommitBid(
      auctionID,
      toEther(bid1),
      0,
      tokenContract,
      tokenID,
      1,
      true
    );
    const highestBidder = await gbmFacet.getAuctionHighestBidder(auctionID);
    const highestBid = await gbmFacet.getAuctionHighestBid(auctionID);
    expect(highestBidder).to.equal(bidder1);
    expect(highestBid).to.equal(toEther(bid1));
  });

  it("Can transfer whitelist ownership", async function () {
    //whitelist bidder1
    await whitelistFacet.transferOwnershipOfWhitelist(whiteListId, bidder1);
    const whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);
    expect(whitelistDetails.owner).to.equal(bidder1);
  });

  it("other misc whitelist actions", async function () {
    const bidder2 = "0x585E06CA576D0565a035301819FD2cfD7104c1E8";
    const randAddress = "0xd5543237c656f25eea69f1e247b8fa59ba353306";
    const tx = await whitelistFacet.createWhitelist("Sample2", [
      bidder1,
      bidder2,
    ]);
    const tx1 = await tx.wait();
    whiteListId = getEvent(tx1, "WhitelistCreated").whitelistId;
    let whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);

    expect(whitelistDetails.addresses[0]).to.equal(bidder1);
    expect(whitelistDetails.addresses[1]).to.equal(bidder2);
    expect(whitelistDetails.addresses.length).to.equal(2);

    await whitelistFacet.removeAddressesFromWhitelist(whiteListId, [
      randAddress,
    ]);
    expect(
      await (
        await whitelistFacet.getWhitelist(whiteListId)
      ).addresses.length
    ).to.equal(2);

    await whitelistFacet.removeAddressesFromWhitelist(whiteListId, [bidder1]);

    whitelistDetails = await whitelistFacet.getWhitelist(whiteListId);
    expect(whitelistDetails.addresses[0]).to.equal(bidder2);

    expect(whitelistDetails.addresses.length).to.equal(1);
  });
});
