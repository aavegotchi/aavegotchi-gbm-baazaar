import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { varsForNetwork } from "../../helpers/constants";
import { upgradeAddSwapFns } from "../gbmBaazaar/upgrade-addSwapFns";

describe("Upgrade: add swap functions and reallocate getters (base mainnet fork)", function () {
  let diamond: string;
  let gbmFacet: Contract;
  let gbmExtended: Contract;

  before(async function () {
    const vars = await varsForNetwork(ethers as any);
    diamond = vars.gbmDiamond!;
    gbmFacet = await ethers.getContractAt("GBMFacet", diamond);
    gbmExtended = await ethers.getContractAt("GBMExtendedFacet", diamond);
    await upgradeAddSwapFns();
  });

  describe("edge cases for swap parameter validation", function () {
    it("reverts on invalid signature in swapAndCommitBid", async function () {
      const ctx = {
        tokenIn: ethers.constants.AddressZero,
        swapAmount: 1,
        minGhstOut: 1,
        swapDeadline: Math.floor(Date.now() / 1000) + 600,
        recipient: (await ethers.getSigners())[0].address,
        auctionID: 0,
        bidAmount: 1,
        highestBid: 0,
        tokenContract: ethers.constants.AddressZero,
        _tokenID: 0,
        _amount: 0,
        _signature: "0x",
      };
      await expect(gbmFacet.swapAndCommitBid(ctx)).to.be.revertedWith(
        "Invalid signature"
      );
    });

    it("reverts on expired deadline in swapAndBuyNow", async function () {
      const ctx = {
        tokenIn: ethers.constants.AddressZero,
        swapAmount: 1,
        minGhstOut: 1,
        swapDeadline: Math.floor(Date.now() / 1000) - 1,
        recipient: (await ethers.getSigners())[0].address,
        auctionID: 0,
      };
      await expect(gbmFacet.swapAndBuyNow(ctx)).to.be.revertedWith(
        "deadline expired"
      );
    });
  });
});
