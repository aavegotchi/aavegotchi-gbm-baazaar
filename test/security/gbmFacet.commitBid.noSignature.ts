import { expect } from "chai";
import { ethers } from "hardhat";

const ERC721_KIND = "0x73ad2146";
const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

function getSelectors(contract: any): string[] {
  const signatures = Object.keys(contract.interface.functions);
  return signatures
    .filter((sig) => sig !== "init(bytes)")
    .map((sig) => contract.interface.getSighash(sig));
}

async function chainNowTs(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

describe("GBMFacet: commitBid ignores signature", function () {
  it("allows committing a bid with an invalid signature", async function () {
    this.timeout(180000);

    const [owner, seller, bidder] = await ethers.getSigners();

    // Deploy DiamondCutFacet and diamond core.
    const diamondCutFacet = await (
      await ethers.getContractFactory("DiamondCutFacet")
    )
      .connect(owner)
      .deploy();
    await diamondCutFacet.deployed();

    const diamond = await (await ethers.getContractFactory("GBMDiamond"))
      .connect(owner)
      .deploy(owner.address, diamondCutFacet.address, 3600, 3600);
    await diamond.deployed();

    // Deploy facets.
    const gbmFacetImpl = await (await ethers.getContractFactory("GBMFacet"))
      .connect(owner)
      .deploy();
    await gbmFacetImpl.deployed();

    const gbmExtendedImpl = await (
      await ethers.getContractFactory("GBMExtendedFacet")
    )
      .connect(owner)
      .deploy();
    await gbmExtendedImpl.deployed();

    // Deploy initializer + GHST.
    const diamondInit = await (await ethers.getContractFactory("DiamondInit"))
      .connect(owner)
      .deploy();
    await diamondInit.deployed();

    const ghst = await (await ethers.getContractFactory("ERC20Generic"))
      .connect(owner)
      .deploy();
    await ghst.deployed();

    // Add facets + initialize core addresses.
    const cut = [
      {
        facetAddress: gbmFacetImpl.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(gbmFacetImpl),
      },
      {
        facetAddress: gbmExtendedImpl.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(gbmExtendedImpl),
      },
    ];

    const initCall = diamondInit.interface.encodeFunctionData("init", [
      "0x", // backendPubKey (deprecated)
      owner.address, // pixelcraft
      ghst.address,
      owner.address, // GBMAddress
      owner.address, // rarityFarming
      owner.address, // DAO
    ]);

    const diamondCut = await ethers.getContractAt("IDiamondCut", diamond.address);
    await (
      await diamondCut
        .connect(owner)
        .diamondCut(cut, diamondInit.address, initCall)
    ).wait();

    const gbm = await ethers.getContractAt("GBMFacet", diamond.address);
    const gbmExtended = await ethers.getContractAt(
      "GBMExtendedFacet",
      diamond.address
    );

    // Create an ERC721 auction.
    const nft = await (await ethers.getContractFactory("ERC721Generic"))
      .connect(seller)
      .deploy();
    await nft.deployed();
    await nft.connect(seller)["mint(uint256)"](1);
    const tokenId = 1;

    await nft.connect(seller).setApprovalForAll(diamond.address, true);

    const presetId = 0;
    await gbmExtended.connect(owner).setAuctionPresets(presetId, {
      incMin: 1,
      incMax: 1,
      bidMultiplier: 1,
      stepMin: 0,
      bidDecimals: 1,
    });
    await gbmExtended.connect(owner).toggleContractWhitelist(nft.address, true);
    await gbmExtended.connect(owner).setBiddingAllowed(nft.address, true);

    const now = await chainNowTs();
    const auctionInfo = {
      startTime: now + 10,
      endTime: now + 4000,
      tokenAmount: 1,
      category: 0,
      tokenKind: ERC721_KIND,
      tokenID: tokenId,
      buyItNowPrice: 0,
      startingBid: 0,
    };

    const receipt = await (
      await gbm.connect(seller).createAuction(auctionInfo, nft.address, presetId)
    ).wait();

    const initialized = receipt!.events!.find(
      (e: any) => e.event === "Auction_Initialized"
    );
    const auctionId = initialized!.args!._auctionID;

    // Start auction.
    await ethers.provider.send("evm_increaseTime", [20]);
    await ethers.provider.send("evm_mine", []);

    // Fund bidder with GHST and approve diamond.
    const bidAmount = ethers.utils.parseEther("1");
    await ghst.mint(ethers.utils.parseEther("10"), bidder.address);
    await ghst.connect(bidder).approve(diamond.address, bidAmount);

    const highestBid = await gbmExtended.getAuctionHighestBid(auctionId);

    // 65-byte garbage signature: this would revert with "bid: Invalid signature" before signature checks were removed.
    const invalidSignature = "0x" + "11".repeat(65);

    const bidderBalanceBefore = await ghst.balanceOf(bidder.address);

    await gbm
      .connect(bidder)
      .commitBid(
        auctionId,
        bidAmount,
        highestBid,
        nft.address,
        tokenId,
        1,
        invalidSignature
      );

    expect(await gbmExtended.getAuctionHighestBidder(auctionId)).to.eq(
      bidder.address
    );
    expect(await gbmExtended.getAuctionHighestBid(auctionId)).to.eq(bidAmount);

    const bidderBalanceAfter = await ghst.balanceOf(bidder.address);
    expect(bidderBalanceAfter).to.eq(bidderBalanceBefore.sub(bidAmount));
  });
});
