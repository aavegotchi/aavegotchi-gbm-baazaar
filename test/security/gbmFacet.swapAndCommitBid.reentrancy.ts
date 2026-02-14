import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Wallet } from "ethers";

const ROUTER = "0x0000000000404FECAf36E6184245475eE1254835";
const ERC721_KIND = "0x73ad2146";
const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

async function setCode(address: string, code: string) {
  await network.provider.send("hardhat_setCode", [address, code]);
}

async function chainNowTs(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

function getSelectors(contract: any): string[] {
  const signatures = Object.keys(contract.interface.functions);
  return signatures
    .filter((sig) => sig !== "init(bytes)")
    .map((sig) => contract.interface.getSighash(sig));
}

describe("GBMFacet: swapAndCommitBid reentrancy hardening", function () {
  it("prevents tokenIn reentering buyNow during swapAndCommitBid", async function () {
    this.timeout(180000);

    const [seller, bidder] = await ethers.getSigners();

    // Deploy a minimal diamond with GBMFacet + a small setup facet for AppStorage configuration.
    const diamondCutFacet = await (
      await ethers.getContractFactory("DiamondCutFacet")
    )
      .connect(bidder)
      .deploy();
    await diamondCutFacet.deployed();

    const diamond = await (await ethers.getContractFactory("GBMDiamond"))
      .connect(bidder)
      .deploy(bidder.address, diamondCutFacet.address, 3600, 3600);
    await diamond.deployed();

    const gbmFacetImpl = await (await ethers.getContractFactory("GBMFacet"))
      .connect(bidder)
      .deploy();
    await gbmFacetImpl.deployed();

    const setupFacetImpl = await (
      await ethers.getContractFactory("GBMReentrancySetupFacet")
    )
      .connect(bidder)
      .deploy();
    await setupFacetImpl.deployed();

    const cut = [
      {
        facetAddress: gbmFacetImpl.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(gbmFacetImpl),
      },
      {
        facetAddress: setupFacetImpl.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(setupFacetImpl),
      },
    ];

    const diamondCut = (await ethers.getContractAt(
      "IDiamondCut",
      diamond.address
    )) as any;

    const cutTx = await diamondCut
      .connect(bidder)
      .diamondCut(cut, ethers.constants.AddressZero, "0x");
    await cutTx.wait();

    const gbm = await ethers.getContractAt("GBMFacet", diamond.address);
    const setup = await ethers.getContractAt(
      "GBMReentrancySetupFacet",
      diamond.address
    );

    // Install mock router at the constant ROUTER address
    const routerImpl = await (await ethers.getContractFactory("MockZRouter"))
      .connect(bidder)
      .deploy();
    await routerImpl.deployed();
    await setCode(ROUTER, await ethers.provider.getCode(routerImpl.address));

    // Deploy GHST + fund router
    const ghst = await (await ethers.getContractFactory("ERC20Generic"))
      .connect(bidder)
      .deploy();
    await ghst.deployed();
    await ghst.mint(ethers.utils.parseEther("1000000"), ROUTER);

    // Configure AppStorage via setup facet
    await setup.connect(bidder).harnessSetGHST(ghst.address);
    await setup.connect(bidder).harnessSetFeeRecipients(
      bidder.address,
      bidder.address,
      bidder.address,
      bidder.address
    );
    await setup.connect(bidder).harnessSetBuyItNowInvalidationThreshold(90);

    // Deploy ERC721 + move token into GBM contract
    const nft = await (await ethers.getContractFactory("ERC721Generic"))
      .connect(seller)
      .deploy();
    await nft.deployed();
    await nft.connect(seller)["mint(uint256)"](1);
    const tokenId = 1;
    await nft
      .connect(seller)
      .transferFrom(seller.address, diamond.address, tokenId);

    // Init an auction in storage
    const auctionId = 0;
    const now = await chainNowTs();
    const buyNowPrice = ethers.utils.parseEther("10");
    await setup.connect(bidder).harnessInitAuction(
      auctionId,
      seller.address,
      nft.address,
      ERC721_KIND,
      tokenId,
      1,
      now - 1,
      now + 86400,
      buyNowPrice
    );
    await setup
      .connect(bidder)
      .harnessSetContractBiddingAllowed(nft.address, true);

    // Configure backend signer + pubkey
    const backend = Wallet.createRandom();
    const pubKey = backend._signingKey().publicKey; // 0x04...
    const pubKeyBytes = ethers.utils.arrayify(pubKey).slice(1);
    await setup.connect(bidder).harnessSetBackendPubKey(pubKeyBytes);

    // Deploy reentrant tokenIn + configure it to attempt buyNow during transferFrom
    const tokenIn = await (
      await ethers.getContractFactory("ReentrantBuyNowERC20")
    )
      .connect(bidder)
      .deploy();
    await tokenIn.deployed();
    await tokenIn.configure(diamond.address, auctionId, bidder.address);

    // Fund tokenIn contract with GHST to pay buyNow, and approve GBM to spend it.
    await ghst.mint(buyNowPrice, tokenIn.address);
    await tokenIn.approveGhst(ghst.address, diamond.address, buyNowPrice);

    // Fund bidder with tokenIn + approve GBM to spend it for the swap.
    const swapAmount = ethers.utils.parseEther("100");
    await tokenIn.mint(bidder.address, swapAmount);
    await tokenIn.connect(bidder).approve(diamond.address, swapAmount);

    // Build a valid commitBid signature
    const bidAmount = ethers.utils.parseEther("5");
    const highestBid = 0;
    const messageHash = ethers.utils.solidityKeccak256(
      ["address", "uint256", "uint256", "uint256"],
      [bidder.address, auctionId, bidAmount, highestBid]
    );
    const signature = await backend.signMessage(
      ethers.utils.arrayify(messageHash)
    );

    const swapDeadline = (await chainNowTs()) + 3600;

    const ctx = {
      tokenIn: tokenIn.address,
      swapAmount,
      minGhstOut: bidAmount,
      swapDeadline,
      recipient: bidder.address,
      auctionID: auctionId,
      bidAmount,
      highestBid,
      tokenContract: nft.address,
      _tokenID: tokenId,
      _amount: 1,
      _signature: signature,
    };

    await gbm.connect(bidder).swapAndCommitBid(ctx);

    // The reentrancy attempt was made, but should fail due to the auction lock.
    expect(await tokenIn.attemptedBuyNow()).to.eq(true);
    expect(await tokenIn.buyNowCallOk()).to.eq(false);

    // Auction should not be claimed and the NFT should remain escrowed in the GBM contract.
    expect(await setup.harnessGetAuctionClaimed(auctionId)).to.eq(false);
    expect(await nft.ownerOf(tokenId)).to.eq(diamond.address);
    expect(await setup.harnessGetAuctionBiddingAllowed(auctionId)).to.eq(true);
  });
});
