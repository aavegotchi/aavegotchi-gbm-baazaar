import { ethers } from "hardhat";
import { maticGBMDiamond } from "../constants";

async function fetchAffectedAuctions() {
  const GBM = await ethers.getContractAt("GBMFacet", maticGBMDiamond);

  // check affected auctions
  const startAuctionId = 20910;
  const lastAuctionId = 21328;
  const auctionIds: number[][] = [[], [], []]; // high, medium, low
  for (let auctionId = startAuctionId; auctionId < lastAuctionId; auctionId++) {
    const auction = await GBM.getAuctionInfo(auctionId);
    console.log(auctionId);
    if(!auction.claimed) {
      const bidMultiplier = auction.presets.bidMultiplier.toNumber()
      if (bidMultiplier === 11000) auctionIds[0].push(auctionId); // high preset
      else if (bidMultiplier === 4970) auctionIds[1].push(auctionId); // medium preset
      else if (bidMultiplier === 500) auctionIds[2].push(auctionId); // low preset
    }
  }
  console.log(auctionIds);
  // results
  // [
  //   [ // high
  //     20912, 20913, 20914, 20916,
  //     21031, 21032, 21062, 21202,
  //     21206, 21234, 21240, 21282,
  //     21283, 21292, 21298, 21299,
  //     21300, 21301, 21302, 21303,
  //     21304, 21305, 21307, 21308,
  //     21309, 21310, 21311, 21312,
  //     21319, 21321, 21324, 21327
  //   ],
  //   [ // medium
  //     20915, 20918, 20919, 20921,
  //     20940, 21008, 21014, 21030,
  //     21187, 21200, 21208, 21209,
  //     21227, 21228, 21230, 21251,
  //     21253, 21264, 21275, 21276,
  //     21277, 21278, 21279, 21284,
  //     21289, 21290, 21291, 21325
  //   ],
  //   [ // low
  //     21067, 21094, 21105, 21136,
  //     21137, 21138, 21174, 21236,
  //     21287, 21293, 21294, 21295,
  //     21296, 21297, 21313, 21314,
  //     21315, 21316, 21317, 21326
  //   ]
  // ]
}

if (require.main === module) {
  fetchAffectedAuctions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
