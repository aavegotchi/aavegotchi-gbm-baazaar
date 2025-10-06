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

  // Get current timestamp to filter for active auctions
  const currentTime = Math.floor(Date.now() / 1000);

  // Query for buyNow auctions (we'll check endTime on-chain)
  const query = `query LatestBuyNow { auctions(where: { cancelled: false, claimed: false, buyNowPrice_gt: 0 } first: 1 orderBy: id orderDirection: desc) { id buyNowPrice highestBid } }`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json?.errors?.length)
    throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);

  const auctions = json?.data?.auctions || [];
  if (auctions.length === 0)
    throw new Error("No buyNow auctions returned by subgraph");

  // Find the first auction that has suitable bid threshold
  for (const row of auctions) {
    if (!row?.id) continue;

    const buyNowPrice = BigNumber.from(row.buyNowPrice || 0);
    const highestBid = BigNumber.from(row.highestBid || 0);

    // Found suitable auction
    console.log(`Using auction ${row.id} for buyNow test`);
    return {
      id: Number(row.id),
      buyNowPrice,
    };
  }

  throw new Error(
    "No suitable buyNow auction found (all ended or highest bid too high)"
  );
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
      console.log("\n=== SWAP AND COMMIT BID TEST ===");
      console.log("Auction ID:", AUCTION_ID);

      const info = await gbmExt.getAuctionInfo(AUCTION_ID);
      const highestBefore: BigNumber = await gbmExt.getAuctionHighestBid(
        AUCTION_ID
      );

      console.log("\n--- Auction State ---");
      console.log(
        "  Highest Bid Before:",
        ethers.utils.formatUnits(highestBefore, 18),
        "GHST"
      );
      console.log(
        "  Starting Bid:",
        ethers.utils.formatUnits(
          info.startingBid || info.info.startingBid || 0,
          18
        ),
        "GHST"
      );

      // Desired bid = +10% above highest, but ensure minimum bid
      const minBidAmount = BigNumber.from(10).pow(18); // 1 GHST minimum
      const startingBid = BigNumber.from(
        info.startingBid || info.info.startingBid || 0
      );
      let bidAmount = highestBefore.gt(0)
        ? highestBefore.mul(110).div(100)
        : minBidAmount.gt(startingBid)
        ? minBidAmount
        : startingBid;

      // Ensure bidAmount is never 0
      if (bidAmount.eq(0)) {
        bidAmount = minBidAmount;
        console.log(
          "  WARNING: bidAmount was 0, using minimum:",
          ethers.utils.formatUnits(bidAmount, 18),
          "GHST"
        );
      }

      console.log(
        "  Calculated Bid Amount:",
        ethers.utils.formatUnits(bidAmount, 18),
        "GHST"
      );

      // Compute USDC needed from 0.46 USDC/GHST, with 20% buffer
      const usdcNeeded = bidAmount
        .mul(46)
        .mul(BigNumber.from(10).pow(6))
        .div(100)
        .div(BigNumber.from(10).pow(18));
      const swapAmount = usdcNeeded.mul(120).div(100); // +20% buffer

      // Ensure minimum swap amount to avoid rounding to 0
      const minSwapAmount = BigNumber.from(10).pow(6); // 1 USDC minimum
      const finalSwapAmount = swapAmount.gt(0) ? swapAmount : minSwapAmount;

      console.log("\n--- Bid Calculation ---");
      console.log(
        "  Bid Amount:",
        ethers.utils.formatUnits(bidAmount, 18),
        "GHST"
      );
      console.log(
        "  USDC Needed:",
        ethers.utils.formatUnits(usdcNeeded, 6),
        "USDC"
      );
      console.log(
        "  Swap Amount:",
        ethers.utils.formatUnits(swapAmount, 6),
        "USDC"
      );
      console.log(
        "  Final Swap Amount:",
        ethers.utils.formatUnits(finalSwapAmount, 6),
        "USDC"
      );
      backend = new Wallet(process.env.GBM_PK);

      // Fund bidder with USDC from whale and approve diamond (avoid shared state)
      const usdcWhale = await impersonate(
        ADDRESSES.USDC_WHALE,
        usdc,
        ethers,
        network
      );
      await usdcWhale.transfer(bidder.address, finalSwapAmount);
      const usdcBidder = await impersonate(
        bidder.address,
        usdc,
        ethers,
        network
      );
      await usdcBidder.approve(diamond, finalSwapAmount);

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
        swapAmount: finalSwapAmount,
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
      const allTransferEvents: any[] = [];

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
            allTransferEvents.push(ev);
            console.log("Transfer event:", {
              from: ev.args.from,
              to: ev.args.to,
              value: ethers.utils.formatUnits(ev.args.value, 18),
              diamond: diamond,
              bidder: await bidder.getAddress(),
            });
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

      console.log("\n--- Transaction Execution ---");
      if (decodedSwap) {
        const usdcIn = decodedSwap.args.amountIn as BigNumber;
        const ghstOut = decodedSwap.args.amountOut as BigNumber;
        console.log("Swap Details:");
        console.log("  Token In:", decodedSwap.args.tokenIn);
        console.log("  Token Out:", decodedSwap.args.tokenOut);
        console.log(
          "  Amount In:",
          ethers.utils.formatUnits(usdcIn, 6),
          "USDC"
        );
        console.log(
          "  Amount Out:",
          ethers.utils.formatUnits(ghstOut, 18),
          "GHST"
        );
        console.log("  Recipient:", decodedSwap.args.recipient);
      }

      console.log("\n--- Financial Summary ---");
      console.log(
        "  GHST Needed to Bid:",
        ethers.utils.formatUnits(bidAmount, 18),
        "GHST"
      );
      if (decodedSwap) {
        const ghstOut = decodedSwap.args.amountOut as BigNumber;
        console.log(
          "  GHST Received from Swap:",
          ethers.utils.formatUnits(ghstOut, 18),
          "GHST"
        );
        console.log(
          "  GHST Used for Bid:",
          ethers.utils.formatUnits(bidAmount, 18),
          "GHST"
        );
      }
      if (typeof decodedRefund !== "undefined") {
        console.log(
          "  GHST Refunded (from Transfer event):",
          ethers.utils.formatUnits(decodedRefund.args.value, 18),
          "GHST"
        );
      } else {
        console.log("  GHST Refunded (from Transfer event): 0 GHST");
      }

      console.log("\n--- Auction State After ---");
      if (decodedBidPlaced.length > 0) {
        const e = decodedBidPlaced[decodedBidPlaced.length - 1];
        console.log(
          "  New Highest Bid:",
          ethers.utils.formatUnits(e.args._bidAmount, 18),
          "GHST"
        );
        console.log("  New Highest Bidder:", e.args._bidder);
      }
      if (decodedBidRemoved.length > 0) {
        const e = decodedBidRemoved[decodedBidRemoved.length - 1];
        console.log(
          "  Previous Bid Removed:",
          ethers.utils.formatUnits(e.args._previousBid, 18),
          "GHST"
        );
        console.log("  Previous Bidder:", e.args._previousBidder);
      }
      if (decodedIncentives.length > 0) {
        const e = decodedIncentives[decodedIncentives.length - 1];
        console.log(
          "  Incentive Paid:",
          ethers.utils.formatUnits(e.args._amount, 18),
          "GHST"
        );
        console.log("  Incentive Recipient:", e.args._recipient);
      }

      const highestAfter: BigNumber = await gbmExt.getAuctionHighestBid(
        AUCTION_ID
      );
      const highestBidderAfter: string = await gbmExt.getAuctionHighestBidder(
        AUCTION_ID
      );
      console.log("\n--- Final Verification ---");
      console.log(
        "  Final Highest Bid:",
        ethers.utils.formatUnits(highestAfter, 18),
        "GHST"
      );
      console.log("  Final Highest Bidder:", highestBidderAfter);
      console.log("==========================================\n");
      expect(highestAfter).to.equal(bidAmount);
      if (highestBefore.gt(0)) {
        expect(highestAfter).to.equal(highestBefore.mul(110).div(100));
      } else {
        expect(highestAfter).to.equal(
          minBidAmount.gt(startingBid) ? minBidAmount : startingBid
        );
      }
    }).timeout(240000);
  });

  describe("swapAndBuyNow using USDC on latest buyNow auction from subgraph", function () {
    it("swaps USDC and buys now at buyNowPrice", async function () {
      // Use dynamic auction ID from subgraph for buyNow auctions
      const auctionData = await fetchLatestBuyNowAuction();
      const AUCTION_ID = auctionData.id;
      const buyNowPrice = auctionData.buyNowPrice;

      console.log("\n=== SWAP AND BUY NOW TEST ===");
      console.log("Auction ID:", AUCTION_ID);

      // Check if auction is still active on-chain
      const info = await gbmExt.getAuctionInfo(AUCTION_ID);
      const endTime = Number(info.info.endTime || info.endTime || 0);
      const currentTime = Math.floor(Date.now() / 1000);

      if (endTime > 0 && endTime <= currentTime) {
        console.log(
          `Skipping test: Auction ${AUCTION_ID} ended at ${endTime}, current time ${currentTime}`
        );
        return;
      }

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

      console.log("\n=== SWAP AND BUY NOW TEST ===");
      console.log("Auction ID:", AUCTION_ID);

      console.log("\n--- Auction State ---");
      console.log(
        "  Buy Now Price:",
        ethers.utils.formatUnits(buyNowPrice, 18),
        "GHST"
      );
      console.log(
        "  Highest Bid Before:",
        ethers.utils.formatUnits(highestBefore, 18),
        "GHST"
      );
      console.log("  Highest Bidder Before:", bidderBefore);
      console.log(
        "  Due Incentives Before:",
        ethers.utils.formatUnits(dueIncentivesBefore, 18),
        "GHST"
      );

      console.log("\n--- Transaction Parameters ---");
      console.log(
        "  USDC Needed (estimated):",
        ethers.utils.formatUnits(usdcNeeded, 6),
        "USDC"
      );
      console.log(
        "  Swap Amount:",
        ethers.utils.formatUnits(swapAmount, 6),
        "USDC"
      );
      console.log(
        "  Min GHST Out:",
        ethers.utils.formatUnits(minGhstOut, 18),
        "GHST"
      );
      console.log("  Recipient:", await bidder.getAddress());
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
      const allTransferEvents2: any[] = [];

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
            allTransferEvents2.push(ev);
            console.log("Transfer event (buyNow):", {
              from: ev.args.from,
              to: ev.args.to,
              value: ethers.utils.formatUnits(ev.args.value, 18),
              diamond: diamond,
              bidder: await bidder.getAddress(),
            });
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

      console.log("\n--- Transaction Execution ---");
      if (decodedSwap) {
        console.log("Swap Details:");
        console.log(
          "  Amount In:",
          ethers.utils.formatUnits(decodedSwap.args.amountIn, 6),
          "USDC"
        );
        console.log(
          "  Amount Out:",
          ethers.utils.formatUnits(decodedSwap.args.amountOut, 18),
          "GHST"
        );
      }

      console.log("\n--- Financial Summary ---");
      console.log(
        "  GHST Needed to Buy Now:",
        ethers.utils.formatUnits(buyNowPrice, 18),
        "GHST"
      );
      if (decodedSwap) {
        const ghstOut = decodedSwap.args.amountOut as BigNumber;
        console.log(
          "  GHST Received from Swap:",
          ethers.utils.formatUnits(ghstOut, 18),
          "GHST"
        );
        console.log(
          "  GHST Used for Buy Now:",
          ethers.utils.formatUnits(buyNowPrice, 18),
          "GHST"
        );
      }
      if (typeof decodedRefund2 !== "undefined") {
        console.log(
          "  GHST Refunded (from Transfer event):",
          ethers.utils.formatUnits(decodedRefund2.args.value, 18),
          "GHST"
        );
      } else {
        console.log("  GHST Refunded (from Transfer event): 0 GHST");
      }
      console.log("\n--- Auction State After ---");
      if (decodedBoughtNow) {
        console.log("  Auction Bought Now by:", decodedBoughtNow.args._buyer);
        console.log(
          "  Auction ID:",
          decodedBoughtNow.args._auctionID.toString()
        );
      }

      console.log("\n--- Final Verification ---");
      const updated = await gbmExt.getAuctionInfo(AUCTION_ID);
      console.log("  Auction Claimed:", updated.claimed);
      console.log("  Bidding Disabled:", !updated.biddingAllowed);
      console.log("==========================================\n");

      // Post-conditions: auction should be claimed and bidding disabled
      expect(updated.claimed).to.equal(true);
      expect(updated.biddingAllowed).to.equal(false);
    }).timeout(240000);
  });
});
