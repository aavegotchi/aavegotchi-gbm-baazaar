import { expect } from "chai";
import { BigNumber, Contract, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import { varsForNetwork } from "../helpers/constants";
import { upgradeAddSwapFns } from "../scripts/gbmBaazaar/upgrade-addSwapFns";
import { impersonate } from "../scripts/helperFunctions";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

const ADDRESSES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDC_WHALE: "0x1985EA6E9c68E1C272d8209f3B478AC2Fdb25c87",
  Z_ROUTER: "0x0000000000404FECAf36E6184245475eE1254835",
};

const AUCTION_ID = 802;

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

async function fetchLatestAuctionId(hasBuyNow: boolean): Promise<number> {
  const endpoint =
    "https://subgraph.satsuma-prod.com/tWYl5n5y04oz/aavegotchi/aavegotchi-gbm-baazaar-base/api";
  const where = hasBuyNow
    ? "cancelled: false, claimed: false, buyNowPrice_gt: 0"
    : "cancelled: false, claimed: false, buyNowPrice_gte: 0";
  const query = `query LatestAuction { auctions(where: { ${where} } first: 1 orderBy: id orderDirection: desc) { id buyNowPrice } }`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json?.errors?.length)
    throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);
  const idStr = json?.data?.auctions?.[0]?.id;
  if (!idStr) throw new Error("No auction id returned by subgraph");
  return Number(idStr);
}

async function fetchLatestBuyNowAuction(): Promise<{
  id: number;
  buyNowPrice: BigNumber;
}> {
  const endpoint =
    "https://subgraph.satsuma-prod.com/tWYl5n5y04oz/aavegotchi/aavegotchi-gbm-baazaar-base/api";
  const query = `query LatestBuyNow { auctions(where: { cancelled: false, claimed: false, buyNowPrice_gt: 0 } first: 1 orderBy: id orderDirection: desc) { id buyNowPrice } }`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json?.errors?.length)
    throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);
  const row = json?.data?.auctions?.[0];
  if (!row?.id) throw new Error("No buyNow auction returned by subgraph");
  return {
    id: Number(row.id),
    buyNowPrice: BigNumber.from(row.buyNowPrice || 0),
  };
}

describe("GBM: swapAndCommitBid on Base fork", function () {
  let diamond: string;
  let gbm: Contract;
  let gbmExt: Contract;
  let ghst: Contract;
  let usdc: Contract;
  let backend: Wallet;
  let bidder: any;

  before(async function () {
    await mine();
    await upgradeAddSwapFns();
    // Get signers
    [bidder] = await ethers.getSigners();
    const c = await varsForNetwork(ethers);
    diamond = c.gbmDiamond!;
    gbm = await ethers.getContractAt("GBMFacet", diamond);
    gbm = await impersonate(bidder.address, gbm, ethers, network);
    gbmExt = await ethers.getContractAt("GBMExtendedFacet", diamond);
    ghst = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      c.ghst
    );
    usdc = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      ADDRESSES.USDC
    );
    usdc = await impersonate(ADDRESSES.USDC_WHALE, usdc, ethers, network);
  });

  describe("swapAndCommitBid using USDC on latest auction from subgraph", function () {
    it("swaps and places a bid 10% above highest bid", async function () {
      const AUCTION_ID = await fetchLatestAuctionId(false);
      console.log("Using auctionId for bid:", AUCTION_ID);
      const info = await gbmExt.getAuctionInfo(AUCTION_ID);
      const highestBefore: BigNumber = await gbmExt.getAuctionHighestBid(
        AUCTION_ID
      );

      // Desired bid = +10%
      const bidAmount = highestBefore.mul(110).div(100);

      // Compute USDC needed from 0.46 USDC/GHST, with 20% buffer
      const usdcNeeded = bidAmount
        .mul(46)
        .mul(BigNumber.from(10).pow(6))
        .div(100)
        .div(BigNumber.from(10).pow(18));
      const swapAmount = usdcNeeded.mul(120).div(100); // +20% buffer
      backend = new Wallet(process.env.GBM_PK);

      // Fund bidder with USDC from whale and approve diamond (avoid shared state)
      const usdcWhale = await impersonate(
        ADDRESSES.USDC_WHALE,
        usdc,
        ethers,
        network
      );
      await usdcWhale.transfer(bidder.address, swapAmount);
      const usdcBidder = await impersonate(
        bidder.address,
        usdc,
        ethers,
        network
      );
      await usdcBidder.approve(diamond, swapAmount);

      // Build random sig
      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [await bidder.getAddress(), AUCTION_ID, bidAmount, highestBefore]
      );
      const signature = await backend.signMessage(
        ethers.utils.arrayify(messageHash)
      );

      // Build ctx struct
      const ctx = {
        tokenIn: ADDRESSES.USDC,
        swapAmount,
        minGhstOut: bidAmount,
        swapDeadline: nowTs() + 3600,
        recipient: await bidder.getAddress(),
        auctionID: AUCTION_ID,
        bidAmount,
        highestBid: highestBefore,
        tokenContract: info.tokenContract,
        _tokenID: info.info.tokenID,
        _amount: info.info.tokenAmount,
        _signature: signature,
      };

      const diamondGhstBefore = await ghst.balanceOf(diamond);
      const recipientGhstBefore = await ghst.balanceOf(bidder.address);

      const tx = await gbm.connect(bidder).swapAndCommitBid(ctx);
      const receipt = await tx.wait();

      const diamondGhstAfter = await ghst.balanceOf(diamond);
      const recipientGhstAfter = await ghst.balanceOf(bidder.address);

      // Decode TokenSwapped and Auction events from receipt logs
      const libSwapIface = new ethers.utils.Interface([
        "event TokenSwapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed recipient)",
      ]);
      const erc20Iface = new ethers.utils.Interface([
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ]);
      const gbmIface = new ethers.utils.Interface([
        "event Auction_BidPlaced(uint256 indexed _auctionID, address _bidder, uint256 _bidAmount)",
        "event Auction_BidRemoved(uint256 indexed _auctionID, address _previousBidder, uint256 _previousBid)",
        "event Auction_IncentivePaid(uint256 indexed _auctionID, address indexed _recipient, uint256 _amount)",
      ]);

      const swapTopic = libSwapIface.getEventTopic("TokenSwapped");
      const transferTopic = erc20Iface.getEventTopic("Transfer");
      const bidPlacedTopic = gbmIface.getEventTopic("Auction_BidPlaced");
      const bidRemovedTopic = gbmIface.getEventTopic("Auction_BidRemoved");
      const incentivePaidTopic = gbmIface.getEventTopic(
        "Auction_IncentivePaid"
      );

      let decodedSwap: any | undefined;
      let decodedRefund: any | undefined;
      const decodedBidPlaced: any[] = [];
      const decodedBidRemoved: any[] = [];
      const decodedIncentives: any[] = [];

      for (const log of receipt.logs) {
        if (log.topics[0] === swapTopic) {
          try {
            decodedSwap = libSwapIface.parseLog(log);
          } catch {}
        } else if (
          log.topics[0] === transferTopic &&
          log.address.toLowerCase() === ghst.address.toLowerCase()
        ) {
          try {
            const ev = erc20Iface.parseLog(log);
            if (
              ev.args.from.toLowerCase() === diamond.toLowerCase() &&
              ev.args.to.toLowerCase() ===
                (await bidder.getAddress()).toLowerCase()
            ) {
              decodedRefund = ev;
            }
          } catch {}
        } else if (log.topics[0] === bidPlacedTopic) {
          try {
            decodedBidPlaced.push(gbmIface.parseLog(log));
          } catch {}
        } else if (log.topics[0] === bidRemovedTopic) {
          try {
            decodedBidRemoved.push(gbmIface.parseLog(log));
          } catch {}
        } else if (log.topics[0] === incentivePaidTopic) {
          try {
            decodedIncentives.push(gbmIface.parseLog(log));
          } catch {}
        }
      }

      // Console logs for visibility
      if (decodedSwap) {
        const usdcIn = decodedSwap.args.amountIn as BigNumber;
        const ghstOut = decodedSwap.args.amountOut as BigNumber;
        console.log("Swap details:");
        console.log("  tokenIn:", decodedSwap.args.tokenIn);
        console.log("  tokenOut (GHST):", decodedSwap.args.tokenOut);
        console.log("  amountIn (USDC):", ethers.utils.formatUnits(usdcIn, 6));
        console.log(
          "  amountOut (GHST):",
          ethers.utils.formatUnits(ghstOut, 18)
        );
        console.log("  recipient:", decodedSwap.args.recipient);
      }

      console.log(
        "GHST needed to bid:",
        ethers.utils.formatUnits(bidAmount, 18)
      );
      if (typeof decodedRefund !== "undefined") {
        console.log(
          "GHST refunded:",
          ethers.utils.formatUnits(decodedRefund.args.value, 18)
        );
      } else {
        console.log("GHST refunded: 0");
      }

      if (decodedBidPlaced.length > 0) {
        const e = decodedBidPlaced[decodedBidPlaced.length - 1];
        console.log(
          "Bid placed:",
          e.args._auctionID.toString(),
          e.args._bidder,
          ethers.utils.formatUnits(e.args._bidAmount, 18)
        );
      }
      if (decodedBidRemoved.length > 0) {
        const e = decodedBidRemoved[decodedBidRemoved.length - 1];
        console.log(
          "Previous bid removed:",
          e.args._auctionID.toString(),
          e.args._previousBidder,
          ethers.utils.formatUnits(e.args._previousBid, 18)
        );
      }
      if (decodedIncentives.length > 0) {
        const e = decodedIncentives[decodedIncentives.length - 1];
        console.log(
          "Incentive paid:",
          e.args._auctionID.toString(),
          e.args._recipient,
          ethers.utils.formatUnits(e.args._amount, 18)
        );
      }

      const highestAfter: BigNumber = await gbmExt.getAuctionHighestBid(
        AUCTION_ID
      );
      const highestBidderAfter: string = await gbmExt.getAuctionHighestBidder(
        AUCTION_ID
      );
      console.log("On-chain:", {
        newHighestBid: ethers.utils.formatUnits(highestAfter, 18),
        newHighestBidder: highestBidderAfter,
      });
      expect(highestAfter).to.equal(bidAmount);
      expect(highestAfter).to.equal(highestBefore.mul(110).div(100));
    }).timeout(240000);
  });

  describe("swapAndBuyNow using USDC on latest buyNow auction from subgraph", function () {
    it("swaps USDC and buys now at buyNowPrice", async function () {
      const latest = await fetchLatestBuyNowAuction();
      const AUCTION_ID = latest.id;
      console.log("Using auctionId for buyNow:", AUCTION_ID);
      const info = await gbmExt.getAuctionInfo(AUCTION_ID);
      const buyNowPrice: BigNumber = latest.buyNowPrice.gt(0)
        ? latest.buyNowPrice
        : BigNumber.from(info.buyItNowPrice || info.info.buyItNowPrice);

      // Compute USDC needed from 0.46 USDC/GHST, with 20% buffer
      const usdcNeeded = buyNowPrice
        .mul(46)
        .mul(BigNumber.from(10).pow(6))
        .div(100)
        .div(BigNumber.from(10).pow(18));
      const swapAmount = usdcNeeded.mul(120).div(100);

      // Fund bidder and approve (impersonate whale explicitly)
      const usdcWhale2 = await impersonate(
        ADDRESSES.USDC_WHALE,
        usdc,
        ethers,
        network
      );
      await usdcWhale2.transfer(bidder.address, swapAmount);
      const usdcBidder2 = await impersonate(
        bidder.address,
        usdc,
        ethers,
        network
      );
      await usdcBidder2.approve(diamond, swapAmount);

      const diamondGhstBefore = await ghst.balanceOf(diamond);
      const recipientGhstBefore = await ghst.balanceOf(bidder.address);

      const minGhstOut = buyNowPrice.mul(110).div(100);

      // Gather on-chain state for logging
      const highestBefore = await gbmExt.getAuctionHighestBid(AUCTION_ID);
      const bidderBefore = await gbmExt.getAuctionHighestBidder(AUCTION_ID);
      const dueIncentivesBefore = await gbmExt.getAuctionDueIncentives(
        AUCTION_ID
      );

      console.log("swapAndBuyNow params:");
      console.log("  auctionID:", AUCTION_ID);
      console.log(
        "  buyNowPrice (GHST):",
        ethers.utils.formatUnits(buyNowPrice, 18)
      );
      console.log(
        "  highestBid (GHST):",
        ethers.utils.formatUnits(highestBefore, 18)
      );
      console.log("  highestBidder:", bidderBefore);
      console.log(
        "  dueIncentives (GHST):",
        ethers.utils.formatUnits(dueIncentivesBefore, 18)
      );
      console.log(
        "  usdcNeeded (est):",
        ethers.utils.formatUnits(usdcNeeded, 6)
      );
      console.log(
        "  swapAmount (USDC):",
        ethers.utils.formatUnits(swapAmount, 6)
      );
      console.log(
        "  minGhstOut (GHST):",
        ethers.utils.formatUnits(minGhstOut, 18)
      );
      console.log("  recipient:", await bidder.getAddress());
      console.log("  deadline:", nowTs() + 3600);

      const ctx = {
        tokenIn: ADDRESSES.USDC,
        swapAmount,
        // ensure we have at least 10% over buyNow to guarantee success and have refund
        minGhstOut,
        swapDeadline: nowTs() + 3600,
        recipient: await bidder.getAddress(),
        auctionID: AUCTION_ID,
      };

      const tx = await gbm.connect(bidder).swapAndBuyNow(ctx);
      const receipt = await tx.wait();

      const diamondGhstAfter = await ghst.balanceOf(diamond);
      const recipientGhstAfter = await ghst.balanceOf(bidder.address);

      const libSwapIface = new ethers.utils.Interface([
        "event TokenSwapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed recipient)",
      ]);
      const erc20Iface2 = new ethers.utils.Interface([
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ]);
      const gbmIface = new ethers.utils.Interface([
        "event Auction_BoughtNow(uint256 indexed _auctionID, address _buyer)",
        "event Auction_BidRemoved(uint256 indexed _auctionID, address _previousBidder, uint256 _previousBid)",
        "event Auction_IncentivePaid(uint256 indexed _auctionID, address indexed _recipient, uint256 _amount)",
      ]);
      const swapTopic = libSwapIface.getEventTopic("TokenSwapped");
      const transferTopic2 = erc20Iface2.getEventTopic("Transfer");
      const boughtNowTopic = gbmIface.getEventTopic("Auction_BoughtNow");
      const bidRemovedTopic = gbmIface.getEventTopic("Auction_BidRemoved");
      const incentivePaidTopic = gbmIface.getEventTopic(
        "Auction_IncentivePaid"
      );

      let decodedSwap: any | undefined;
      let decodedBoughtNow: any | undefined;
      let decodedRefund2: any | undefined;
      const decodedBidRemoved: any[] = [];
      const decodedIncentives: any[] = [];
      for (const log of receipt.logs) {
        if (log.topics[0] === swapTopic) {
          try {
            decodedSwap = libSwapIface.parseLog(log);
          } catch {}
        } else if (
          log.topics[0] === transferTopic2 &&
          log.address.toLowerCase() === ghst.address.toLowerCase()
        ) {
          try {
            const ev = erc20Iface2.parseLog(log);
            if (
              ev.args.from.toLowerCase() === diamond.toLowerCase() &&
              ev.args.to.toLowerCase() ===
                (await bidder.getAddress()).toLowerCase()
            ) {
              decodedRefund2 = ev;
            }
          } catch {}
        } else if (log.topics[0] === boughtNowTopic) {
          try {
            decodedBoughtNow = gbmIface.parseLog(log);
          } catch {}
        } else if (log.topics[0] === bidRemovedTopic) {
          try {
            decodedBidRemoved.push(gbmIface.parseLog(log));
          } catch {}
        } else if (log.topics[0] === incentivePaidTopic) {
          try {
            decodedIncentives.push(gbmIface.parseLog(log));
          } catch {}
        }
      }

      if (decodedSwap) {
        console.log("Swap details:");
        console.log(
          "  amountIn (USDC):",
          ethers.utils.formatUnits(decodedSwap.args.amountIn, 6)
        );
        console.log(
          "  amountOut (GHST):",
          ethers.utils.formatUnits(decodedSwap.args.amountOut, 18)
        );
      }
      console.log(
        "GHST needed to buyNow:",
        ethers.utils.formatUnits(buyNowPrice, 18)
      );
      if (typeof decodedRefund2 !== "undefined") {
        console.log(
          "GHST refunded:",
          ethers.utils.formatUnits(decodedRefund2.args.value, 18)
        );
      } else {
        console.log("GHST refunded: 0");
      }
      if (decodedBoughtNow) {
        console.log(
          "Bought Now:",
          decodedBoughtNow.args._auctionID.toString(),
          decodedBoughtNow.args._buyer
        );
      }

      // Post-conditions: auction should be claimed and bidding disabled
      const updated = await gbmExt.getAuctionInfo(AUCTION_ID);
      expect(updated.claimed).to.equal(true);
      expect(updated.biddingAllowed).to.equal(false);
    }).timeout(240000);
  });
});
