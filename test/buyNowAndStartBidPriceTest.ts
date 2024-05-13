/* global describe it before ethers network */
/* eslint prefer-const: "off" */

//@ts-ignore
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { impersonate } from "../scripts/helperFunctions";
import {
  ERC20Generic,
  ERC721Generic,
  GBMFacet,
  OwnershipFacet,
} from "../typechain";
import {
  ghstAddress,
  gotchiDiamondAddress,
  maticGBMDiamond,
} from "../scripts/constants";
import { upgradeBuyNowFor } from "../scripts/gbmBaazaar/upgrade-buyNowFor";

describe("Testing start bid price and buy now logic", async function () {
  this.timeout(30000000);

  const gotchiHolderAddress = "0x03b16Ab6e23BdBeEAB719d8e4C49D63674876253";
  const bidderAddress = "0x8CbF96319b3C56d50a7C82EFb6d3c46bD6f889Ba";
  let gbmFacet: GBMFacet;
  let gbmFacetWithGotchiHolder: GBMFacet;
  let gbmFacetWithBidder: GBMFacet;
  let ghstERC20: ERC20Generic;
  let gotchiDiamond: ERC721Generic;

  let snapshot: any;
  let auctionId: any;
  let gotchiHolder: any;
  let bidder: any;

  const gotchiId = 13230;
  const auctionPresetId = 1;
  const backendSigner = new ethers.Wallet(process.env.SECRET);
  const startBidPrice = ethers.utils.parseEther("10");
  const buyItNowPrice = ethers.utils.parseEther("10");
  const buyItNowPriceHigh = buyItNowPrice.add(ethers.utils.parseEther("2"));
  const buyItNowPriceLow = buyItNowPrice.sub(ethers.utils.parseEther("2"));
  const bidAmount = ethers.utils.parseEther("15");
  const bidAmountOverThreshold = buyItNowPrice
    .mul(70)
    .div(100)
    .add(ethers.utils.parseEther("1"));

  const auctionInfoData = {
    // startTime: Math.floor(Date.now() / 1000 + 200),
    // endTime: Math.floor(Date.now() / 1000) + 8640,
    tokenAmount: 1,
    tokenKind: "0x73ad2146", //ERC721
    tokenID: gotchiId,
    category: 3,
    startingBid: startBidPrice,
    buyItNowPrice: buyItNowPrice,
  };

  let auctionInfo;
  const ghstHolderAddress = "0x434b09Cf6864451606F27eD34609e35ef5D38c50";
  let ghstHolder;

  before(async function () {
    await upgradeBuyNowFor();

    const ownershipFacet = (await ethers.getContractAt(
      "OwnershipFacet",
      maticGBMDiamond
    )) as OwnershipFacet;
    gbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      maticGBMDiamond
    )) as GBMFacet;
    ghstERC20 = (await ethers.getContractAt(
      "ERC20Generic",
      ghstAddress
    )) as ERC20Generic;
    gotchiDiamond = (await ethers.getContractAt(
      "ERC721Generic",
      gotchiDiamondAddress
    )) as ERC721Generic;

    ghstHolder = await ethers.getSigner(ghstHolderAddress);
    const ghstHolderBalance = await ghstERC20.balanceOf(ghstHolderAddress);

    console.log("GHST Holder Balance: ", ghstHolderBalance.toString());
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ghstHolderAddress],
    });
    await ghstERC20
      .connect(ghstHolder)
      .transfer(gotchiHolderAddress, ethers.utils.parseEther("100"));
    await ghstERC20
      .connect(ghstHolder)
      .transfer(bidderAddress, ethers.utils.parseEther("100"));

    console.log("HERE WORKED");

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [bidderAddress],
    });
    bidder = await ethers.getSigner(bidderAddress);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [gotchiHolderAddress],
    });
    gotchiHolder = await ethers.getSigner(gotchiHolderAddress);

    const currentOwner = await ownershipFacet.owner();
    const gbmFacetWithOwner = await impersonate(
      currentOwner,
      gbmFacet,
      ethers,
      network
    );
    gbmFacetWithGotchiHolder = await impersonate(
      gotchiHolderAddress,
      gbmFacet,
      ethers,
      network
    );
    gbmFacetWithBidder = await impersonate(
      bidderAddress,
      gbmFacet,
      ethers,
      network
    );
    gotchiDiamond = await impersonate(
      gotchiHolderAddress,
      gotchiDiamond,
      ethers,
      network
    );

    await gbmFacetWithOwner.setPubkey(
      ethers.utils.hexDataSlice(backendSigner.publicKey, 1)
    );
    await (
      await ghstERC20.connect(bidder)
    ).approve(maticGBMDiamond, ethers.utils.parseEther("100"));
    await (
      await ghstERC20.connect(gotchiHolder)
    ).approve(maticGBMDiamond, ethers.utils.parseEther("100"));
    await gotchiDiamond.approve(maticGBMDiamond, gotchiId);
  });

  describe("Testing previous logic (without start bid price and buy it now)", async function () {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
      };
    });
    it("Should succeed in creating auction", async function () {
      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_Initialized"
      );
      expect(event!.args!._tokenID).to.equal(gotchiId);
      auctionId = event!.args!._auctionID;
    });
    it("Should succeed in bid", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const highestBid = await gbmFacet.getAuctionHighestBid(auctionId);
      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [bidderAddress, auctionId, bidAmount, highestBid]
      );
      const signedMessage = await backendSigner.signMessage(
        ethers.utils.arrayify(messageHash)
      );
      const signature = ethers.utils.arrayify(signedMessage);

      const receipt = await (
        await gbmFacetWithBidder.commitBid(
          auctionId,
          bidAmount,
          highestBid,
          gotchiDiamondAddress,
          gotchiId,
          1,
          signature
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BidPlaced"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);
    });
    it("Should succeed in claim", async function () {
      await ethers.provider.send("evm_increaseTime", [100000]);
      await ethers.provider.send("evm_mine", []);

      const auctionOwnerGhstBalanceBefore = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );

      const receipt = await (await gbmFacetWithBidder.claim(auctionId)).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_ItemClaimed"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(gotchiId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );
      expect(
        auctionOwnerGhstBalanceAfter.sub(auctionOwnerGhstBalanceBefore)
      ).to.equal(bidAmount.mul(96).div(100));
    });
  });

  describe("Testing start bid price logic", async function () {
    before(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
      };
    });
    it("Should succeed in creating auction and 4% logic", async function () {
      const auctionOwnerGhstBalanceBefore = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );

      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_StartingPriceUpdated"
      );
      expect(event!.args!._startPrice).to.equal(startBidPrice);
      auctionId = event!.args!._auctionId;

      const auctionOwnerGhstBalanceAfter = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );
      expect(
        auctionOwnerGhstBalanceBefore.sub(auctionOwnerGhstBalanceAfter)
      ).to.equal(startBidPrice.mul(4).div(100));
    });
    it("Should revert if bid amount is less than start bid", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const smallBidAmount = startBidPrice.sub(ethers.utils.parseEther("1"));
      const highestBid = await gbmFacet.getAuctionHighestBid(auctionId);
      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [bidderAddress, auctionId, smallBidAmount, highestBid]
      );
      const signedMessage = await backendSigner.signMessage(
        ethers.utils.arrayify(messageHash)
      );
      const signature = ethers.utils.arrayify(signedMessage);

      await expect(
        gbmFacetWithBidder.commitBid(
          auctionId,
          smallBidAmount,
          highestBid,
          gotchiDiamondAddress,
          gotchiId,
          1,
          signature
        )
      ).to.be.revertedWith("BidAmountBelowStartingBid");
    });
    it("Should succeed in bid", async function () {
      const highestBid = await gbmFacet.getAuctionHighestBid(auctionId);
      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [bidderAddress, auctionId, bidAmount, highestBid]
      );
      const signedMessage = await backendSigner.signMessage(
        ethers.utils.arrayify(messageHash)
      );
      const signature = ethers.utils.arrayify(signedMessage);

      const receipt = await (
        await gbmFacetWithBidder.commitBid(
          auctionId,
          bidAmount,
          highestBid,
          gotchiDiamondAddress,
          gotchiId,
          1,
          signature
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BidPlaced"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);
    });
    it("Should succeed in claim and calculate prepaid fee for start bid price", async function () {
      await ethers.provider.send("evm_increaseTime", [100000]);
      await ethers.provider.send("evm_mine", []);

      const auctionOwnerGhstBalanceBefore = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );
      const receipt = await (await gbmFacetWithBidder.claim(auctionId)).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_ItemClaimed"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(gotchiId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );
      expect(
        auctionOwnerGhstBalanceAfter.sub(auctionOwnerGhstBalanceBefore)
      ).to.equal(bidAmount.mul(96).div(100).add(startBidPrice.mul(4).div(100)));
    });
  });

  describe("Testing buy now logic (without bid)", async function () {
    before(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
      };
    });
    it("Should succeed in creating auction and additional event", async function () {
      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BuyItNowUpdated"
      );
      expect(event!.args!._buyItNowPrice).to.equal(buyItNowPrice);
      auctionId = event!.args!._auctionId;
    });
    it("Should revert if new buy it now price is higher than current buy it now price", async function () {
      await expect(
        gbmFacetWithGotchiHolder.setBuyNow(auctionId, buyItNowPriceHigh)
      ).to.be.revertedWith("CanOnlyLowerBuyNow");
    });
    it("Should succeed in set lower buy it now price", async function () {
      const receipt = await (
        await gbmFacetWithGotchiHolder.setBuyNow(auctionId, buyItNowPriceLow)
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BuyItNowUpdated"
      );
      expect(event!.args!._auctionId).to.equal(auctionId);
    });
    it("Should succeed in buy now", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const auctionOwnerGhstBalanceBefore = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );

      const receipt = await (await gbmFacetWithBidder.buyNow(auctionId)).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BoughtNow"
      );
      expect(event!.args!._auctionId).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(gotchiId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );

      expect(
        auctionOwnerGhstBalanceAfter.sub(auctionOwnerGhstBalanceBefore)
      ).to.equal(buyItNowPriceLow.mul(96).div(100));
    });
  });

  describe("Testing buy now logic (without zero buy it now price)", async function () {
    before(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
        buyItNowPrice: 0,
      };
      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_Initialized"
      );
      auctionId = event!.args!._auctionID;
    });
    it("Should revert if buy it now price is 0", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      await expect(gbmFacetWithBidder.buyNow(auctionId)).to.be.revertedWith(
        "NoBuyItNowPrice"
      );
    });
  });

  describe("Testing buy now logic (with bid)", async function () {
    before(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
      };
      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_Initialized"
      );
      auctionId = event!.args!._auctionID;

      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const highestBid = await gbmFacet.getAuctionHighestBid(auctionId);
      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [bidderAddress, auctionId, bidAmountOverThreshold, highestBid]
      );
      const signedMessage = await backendSigner.signMessage(
        ethers.utils.arrayify(messageHash)
      );
      const signature = ethers.utils.arrayify(signedMessage);
      await (
        await gbmFacetWithBidder.commitBid(
          auctionId,
          bidAmountOverThreshold,
          highestBid,
          gotchiDiamondAddress,
          gotchiId,
          1,
          signature
        )
      ).wait();
    });
    it("Should revert if bid price is higher than threshold of buy it now", async function () {
      await expect(
        gbmFacetWithGotchiHolder.setBuyNow(auctionId, buyItNowPriceLow)
      ).to.be.revertedWith("HighestBidTooHighToBuyNow");
      await expect(gbmFacetWithBidder.buyNow(auctionId)).to.be.revertedWith(
        "HighestBidTooHighToBuyNow"
      );
    });
  });

  describe("Testing buy now logic with specified recipient (buyNowFor)", async function () {
    before(async function () {
      // Reset the environment
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      // Define auction info with a buy it now price
      auctionInfo = {
        ...auctionInfoData,
        startTime: Math.floor(Date.now() / 1000) + 200,
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: startBidPrice,
        buyItNowPrice: buyItNowPrice,
      };

      // Create the auction
      const receipt = await (
        await gbmFacetWithGotchiHolder.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();

      // Extract auction ID from the creation event
      const createEvent = receipt.events.find(
        (e) => e.event === "Auction_Initialized"
      );
      auctionId = createEvent.args._auctionID;

      // wait for auction started
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);
    });
    it("Should revert if the recipient address is invalid", async function () {
      await expect(
        gbmFacetWithBidder.buyNowFor(auctionId, ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid recipient address");
    });
    it("Should allow buying an NFT for a specified recipient", async function () {
      const recipient = "0xAd0CEb6Dc055477b8a737B630D6210EFa76a2265";

      const auctionOwnerGhstBalanceBefore = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );

      // Ensure the recipient can receive the NFT
      await expect(gbmFacetWithBidder.buyNowFor(auctionId, recipient))
        .to.emit(gbmFacetWithBidder, "Auction_BoughtNow")
        .withArgs(auctionId, recipient);

      // Check that the recipient now owns the NFT
      const newOwner = await gotchiDiamond.ownerOf(gotchiId);
      expect(newOwner).to.equal(recipient);

      // Check if funds were correctly transferred
      const auctionOwnerGhstBalanceAfter = await ghstERC20.balanceOf(
        gotchiHolderAddress
      );
      expect(
        auctionOwnerGhstBalanceAfter.sub(auctionOwnerGhstBalanceBefore)
      ).to.equal(buyItNowPrice.mul(96).div(100).add(startBidPrice.mul(4).div(100))); // assuming the buy now price is taken at 96%
    });
  });
});
