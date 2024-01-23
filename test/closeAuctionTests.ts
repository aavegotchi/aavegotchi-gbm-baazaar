import {BigNumberish} from "ethers";
import { ethers, network } from "hardhat";
import { impersonate } from "../scripts/helperFunctions";
import { deployUpgrade } from "../scripts/gbmBaazaar/upgrade-closeAuction";
import {ERC1155Generic, ERC20Generic, GBMFacet} from "../typechain";
import {ghstAddress, maticGBMDiamond} from "../scripts/constants";
import { expect } from "chai";

// constants for testing
let auctionID = "19516";
// let auctionID = "19518";

let gbmFacet: GBMFacet;
let diamondOwner: string;

let auctionOwner: string;
let stuckedBidder: string;
let bidAmount: BigNumberish;
let tokenID: BigNumberish;
let tokenContract: string;
let token: ERC1155Generic;
let ghst: ERC20Generic;

describe("Test Close Auction", async function () {
  before(async function () {
    this.timeout(300000);
    console.log("deploying upgrades ");
    await deployUpgrade();

    diamondOwner = await (await ethers.getContractAt("OwnershipFacet", maticGBMDiamond)).owner()
    gbmFacet = (await ethers.getContractAt(
        "GBMFacet",
        maticGBMDiamond
    )) as GBMFacet;
    gbmFacet = await impersonate(diamondOwner, gbmFacet, ethers, network);
    ghst = await ethers.getContractAt("ERC20Generic", ghstAddress);
  });

  it("Force close stucked auctions", async function () {
    auctionOwner = await (await gbmFacet.getAuctionInfo(auctionID)).owner;
    const auction = await gbmFacet.getAuctionInfo(auctionID)
    tokenID = auction.info.tokenID;
    stuckedBidder = auction.highestBidder;
    bidAmount = auction.highestBid;
    tokenContract = auction.tokenContract;
    token = (await ethers.getContractAt(
        "ERC1155Generic",
        tokenContract
    )) as ERC1155Generic;

    const balanceBefore = await token.balanceOf(auctionOwner, tokenID);
    const ghstBalanceBefore = await ghst.balanceOf(stuckedBidder);

    await (await gbmFacet.closeAuction(auctionID)).wait();

    const balanceAfter = await token.balanceOf(auctionOwner, tokenID);
    const ghstBalanceAfter = await ghst.balanceOf(stuckedBidder);

    expect(balanceAfter).equal(balanceBefore.add(1));
    expect(ghstBalanceAfter.sub(ghstBalanceBefore)).equal(bidAmount.mul(96).div(100));
  });
});
