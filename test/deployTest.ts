/* global describe it before ethers network */
/* eslint prefer-const: "off" */

//@ts-ignore
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { impersonate } from "../scripts/helperFunctions";
import { ERC721Generic, GBMFacet, OwnershipFacet } from "../typechain";
import { deployFullDiamond } from "../scripts/gbmBaazaar/deployDiamond";
import { BigNumber } from "ethers";

describe("Testing start bid price and buy now logic", async function () {
  this.timeout(30000000);

  const gotchiHolderAddress = "0x03b16Ab6e23BdBeEAB719d8e4C49D63674876253";

  const bidderAddress = "0x8CbF96319b3C56d50a7C82EFb6d3c46bD6f889Ba";
  let ownerGbmFacet: GBMFacet;
  let holderGbmFacet: GBMFacet;
  let bidderGbmFacet: GBMFacet;
  let gotchiDiamond: ERC721Generic;
  let gotchiDiamondAddress: string;

  let snapshot: any;
  let auctionId: any;
  let tokenId = 0;
  const auctionPresetId = 1;
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
    category: 3,
    buyItNowPrice: buyItNowPrice,
    startingBid: startBidPrice,
  };
  let auctionInfo;

  async function approveSpend() {
    const erc721Generic = (await ethers.getContractAt(
      "ERC721Generic",
      gotchiDiamondAddress
    )) as ERC721Generic;

    await erc721Generic
      .connect(await ethers.getImpersonatedSigner(gotchiHolderAddress))
      .setApprovalForAll(ownerGbmFacet.address, true);
  }

  before(async function () {
    const diamondAddress = await deployFullDiamond();

    const ERC721Generic = await ethers.getContractFactory("ERC721Generic");
    const erc721GenericContract =
      (await ERC721Generic.deploy()) as ERC721Generic;
    await erc721GenericContract.deployed();

    await network.provider.send("hardhat_setBalance", [
      gotchiHolderAddress,
      "0x1000000000000000000000000",
    ]);

    await network.provider.send("hardhat_setBalance", [
      bidderAddress,
      "0x1000000000000000000000000",
    ]);

    const tx = await erc721GenericContract
      .connect(await ethers.getImpersonatedSigner(gotchiHolderAddress))
      ["mint(uint256)"](10);
    const receipt = await tx.wait();
    tokenId = receipt.events![0].args._tokenId;

    gotchiDiamondAddress = await erc721GenericContract.address;

    const ownershipFacet = (await ethers.getContractAt(
      "OwnershipFacet",
      diamondAddress
    )) as OwnershipFacet;

    const currentOwner = await ownershipFacet.owner();
    ownerGbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      diamondAddress,
      await ethers.getImpersonatedSigner(currentOwner)
    )) as GBMFacet;

    gotchiDiamond = (await ethers.getContractAt(
      "ERC721Generic",
      gotchiDiamondAddress
    )) as ERC721Generic;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [gotchiHolderAddress],
    });
    holderGbmFacet = await impersonate(
      gotchiHolderAddress,
      ownerGbmFacet,
      ethers,
      network
    );
    bidderGbmFacet = await impersonate(
      bidderAddress,
      ownerGbmFacet,
      ethers,
      network
    );

    gotchiDiamond = await impersonate(
      gotchiHolderAddress,
      gotchiDiamond,
      ethers,
      network
    );

    await ownerGbmFacet.toggleContractWhitelist(gotchiDiamondAddress, true);
  });

  describe("Testing previous logic (without start bid price and buy it now)", async function () {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);

      auctionInfo = {
        ...auctionInfoData,
        tokenID: tokenId,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
      };
    });
    it("Should succeed in creating auction", async function () {
      const erc721Generic = (await ethers.getContractAt(
        "ERC721Generic",
        gotchiDiamondAddress
      )) as ERC721Generic;

      await erc721Generic
        .connect(await ethers.getImpersonatedSigner(gotchiHolderAddress))
        .setApprovalForAll(ownerGbmFacet.address, true);

      const receipt = await (
        await holderGbmFacet.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_Initialized"
      );
      expect(event!.args!._tokenID).to.equal(tokenId);
      auctionId = event!.args!._auctionID;
    });
    it("Should succeed in allowing bids", async function () {
      await ownerGbmFacet.setBiddingAllowed(gotchiDiamondAddress, true);
    });
    it("Should succeed in bid", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const highestBid = await ownerGbmFacet.getAuctionHighestBid(auctionId);

      const receipt = await (
        await bidderGbmFacet.commitBid(
          auctionId,
          bidAmount,
          highestBid,
          gotchiDiamondAddress,
          tokenId,
          1,
          { value: bidAmount }
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

      const auctionOwnerGhstBalanceBefore = await ethers.provider.getBalance(
        gotchiHolderAddress
      );
      const receipt = await (await bidderGbmFacet.claim(auctionId)).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_ItemClaimed"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(tokenId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ethers.provider.getBalance(
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

      await ownerGbmFacet.setBiddingAllowed(gotchiDiamondAddress, true);

      tokenId = Number(tokenId) + 1;

      auctionInfo = {
        ...auctionInfoData,
        tokenID: tokenId,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
      };
    });
    it("Should succeed in creating auction and 4% logic", async function () {
      const auctionOwnerGhstBalanceBefore = await ethers.provider.getBalance(
        gotchiHolderAddress
      );

      await approveSpend();

      const erc721Generic = (await ethers.getContractAt(
        "ERC721Generic",
        gotchiDiamondAddress
      )) as ERC721Generic;

      await erc721Generic;

      const receipt = await (
        await holderGbmFacet.createAuction(
          auctionInfo,
          gotchiDiamondAddress,
          auctionPresetId,
          { value: startBidPrice.mul(40).div(1000) } //4% fee
        )
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_StartingPriceUpdated"
      );
      expect(event!.args!._startPrice).to.equal(startBidPrice);
      auctionId = event!.args!._auctionId;

      const auctionOwnerGhstBalanceAfter = await ethers.provider.getBalance(
        gotchiHolderAddress
      );
      expect(
        Number(
          ethers.utils.formatEther(
            auctionOwnerGhstBalanceBefore.sub(auctionOwnerGhstBalanceAfter)
          )
        )
      ).to.approximately(
        Number(ethers.utils.formatEther(startBidPrice.mul(4).div(100))),
        0.1
      );
    });
    it("Should revert if bid amount is less than start bid", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const smallBidAmount = startBidPrice.sub(ethers.utils.parseEther("1"));
      const highestBid = await ownerGbmFacet.getAuctionHighestBid(auctionId);

      await expect(
        bidderGbmFacet.commitBid(
          auctionId,
          smallBidAmount,
          highestBid,
          gotchiDiamondAddress,
          tokenId,
          1,
          { value: smallBidAmount }
        )
      ).to.be.revertedWith("BidAmountBelowStartingBid");
    });
    it("Should succeed in bid", async function () {
      const highestBid = await ownerGbmFacet.getAuctionHighestBid(auctionId);

      const receipt = await (
        await bidderGbmFacet.commitBid(
          auctionId,
          bidAmount,
          highestBid,
          gotchiDiamondAddress,
          tokenId,
          1,
          { value: bidAmount }
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

      const auctionOwnerGhstBalanceBefore = await ethers.provider.getBalance(
        gotchiHolderAddress
      );
      const receipt = await (await bidderGbmFacet.claim(auctionId)).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_ItemClaimed"
      );
      expect(event!.args!._auctionID).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(tokenId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ethers.provider.getBalance(
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

      tokenId = Number(tokenId) + 1;

      auctionInfo = {
        ...auctionInfoData,
        tokenID: tokenId,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
      };
    });
    it("Should succeed in creating auction and additional event", async function () {
      await ownerGbmFacet.setBiddingAllowed(gotchiDiamondAddress, true);

      await approveSpend();

      const tx = await holderGbmFacet.createAuction(
        auctionInfo,
        gotchiDiamondAddress,
        auctionPresetId
      );

      const receipt = await tx.wait();

      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BuyItNowUpdated"
      );

      expect(event!.args!._buyItNowPrice).to.equal(buyItNowPrice);
      auctionId = event!.args!._auctionId;
    });
    it("Should revert if new buy it now price is higher than current buy it now price", async function () {
      const buyItNowInvalidationThreshold =
        await ownerGbmFacet.getBuyItNowInvalidationThreshold();

      console.log(
        "buyItNowInvalidationThreshold",
        buyItNowInvalidationThreshold
      );

      await expect(
        holderGbmFacet.setBuyNow(auctionId, buyItNowPriceHigh)
      ).to.be.revertedWith("CanOnlyLowerBuyNow");
    });
    it("Should succeed in set lower buy it now price", async function () {
      const receipt = await (
        await holderGbmFacet.setBuyNow(auctionId, buyItNowPriceLow)
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BuyItNowUpdated"
      );
      expect(event!.args!._auctionId).to.equal(auctionId);
    });
    it("Should succeed in buy now", async function () {
      await ethers.provider.send("evm_increaseTime", [500]);
      await ethers.provider.send("evm_mine", []);

      const auctionOwnerGhstBalanceBefore = await ethers.provider.getBalance(
        gotchiHolderAddress
      );
      const receipt = await (
        await bidderGbmFacet.buyNow(auctionId, { value: buyItNowPriceLow })
      ).wait();
      const event = receipt!.events!.find(
        (e: any) => e.event === "Auction_BoughtNow"
      );
      expect(event!.args!._auctionId).to.equal(auctionId);

      const gotchiOwnerAfter = await gotchiDiamond.ownerOf(tokenId);
      expect(gotchiOwnerAfter).equal(bidderAddress);

      const auctionOwnerGhstBalanceAfter = await ethers.provider.getBalance(
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

      await approveSpend();

      console.log("token id:", tokenId + 1);

      auctionInfo = {
        ...auctionInfoData,
        tokenID: tokenId + 1,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
        buyItNowPrice: 0,
      };
      const receipt = await (
        await holderGbmFacet.createAuction(
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

      await expect(bidderGbmFacet.buyNow(auctionId)).to.be.revertedWith(
        "NoBuyItNowPrice"
      );
    });
  });

  describe("Testing buy now logic (with bid)", async function () {
    before(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);

      await approveSpend();

      auctionInfo = {
        ...auctionInfoData,
        tokenID: tokenId + 1,
        startTime: Math.floor(Date.now() / 1000 + 200),
        endTime: Math.floor(Date.now() / 1000) + 8640,
        startingBid: 0,
        buyItNowPrice: buyItNowPrice,
      };

      const receipt = await (
        await holderGbmFacet.createAuction(
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

      const highestBid = await ownerGbmFacet.getAuctionHighestBid(auctionId);

      await ownerGbmFacet.setBiddingAllowed(gotchiDiamondAddress, true);

      await (
        await bidderGbmFacet.commitBid(
          auctionId,
          bidAmountOverThreshold,
          highestBid,
          gotchiDiamondAddress,
          tokenId + 1,
          1,
          { value: bidAmountOverThreshold }
        )
      ).wait();
    });
    it("Should revert if bid price is higher than threshold of buy it now", async function () {
      await expect(
        holderGbmFacet.setBuyNow(auctionId, buyItNowPriceLow)
      ).to.be.revertedWith("HighestBidTooHighToBuyNow");
      await expect(bidderGbmFacet.buyNow(auctionId)).to.be.revertedWith(
        "HighestBidTooHighToBuyNow"
      );
    });
  });
});
