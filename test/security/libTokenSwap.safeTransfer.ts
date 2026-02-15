import { expect } from "chai";
import { ethers, network } from "hardhat";

const ROUTER = "0x0000000000404FECAf36E6184245475eE1254835";

async function setCode(address: string, code: string) {
  await network.provider.send("hardhat_setCode", [address, code]);
}

async function chainNowTs(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

describe("LibTokenSwap: safe ERC20 handling", function () {
  it("reverts if transferFrom returns true but doesn't actually move tokens (prevents draining contract-held balance)", async function () {
    this.timeout(120000);

    const [user] = await ethers.getSigners();

    // Install the mock router at the constant ROUTER address
    const routerImpl = await (await ethers.getContractFactory("MockZRouter"))
      .connect(user)
      .deploy();
    await routerImpl.deployed();
    await setCode(ROUTER, await ethers.provider.getCode(routerImpl.address));

    const ghst = await (await ethers.getContractFactory("ERC20Generic"))
      .connect(user)
      .deploy();
    await ghst.deployed();

    // Fund the router so swaps can succeed if reached
    await ghst.mint(ethers.utils.parseEther("1000"), ROUTER);

    const harness = await (
      await ethers.getContractFactory("TokenSwapHarness")
    )
      .connect(user)
      .deploy();
    await harness.deployed();
    await harness.setGHST(ghst.address);

    const tokenIn = await (
      await ethers.getContractFactory("ReturnTrueNoopERC20")
    )
      .connect(user)
      .deploy();
    await tokenIn.deployed();

    const swapAmount = ethers.utils.parseEther("10");
    const minOut = ethers.utils.parseEther("1");

    // Pre-load the harness with tokenIn (simulates contract-held balance)
    await tokenIn.mint(harness.address, swapAmount);
    // Ensure user has balance + approval so transferFrom is called, but configured to be a NOOP.
    await tokenIn.mint(user.address, swapAmount);
    await tokenIn.setNoopFrom(user.address);
    await tokenIn.approve(harness.address, swapAmount);

    const deadline = (await chainNowTs()) + 3600;

    await expect(
      harness.swapForGHST(tokenIn.address, swapAmount, minOut, deadline, user.address)
    ).to.be.revertedWith("LibTokenSwap: Token transfer failed");
  });

  it("swaps successfully when transferFrom moves tokens", async function () {
    this.timeout(120000);

    const [user] = await ethers.getSigners();

    const routerImpl = await (await ethers.getContractFactory("MockZRouter"))
      .connect(user)
      .deploy();
    await routerImpl.deployed();
    await setCode(ROUTER, await ethers.provider.getCode(routerImpl.address));

    const ghst = await (await ethers.getContractFactory("ERC20Generic"))
      .connect(user)
      .deploy();
    await ghst.deployed();
    await ghst.mint(ethers.utils.parseEther("1000"), ROUTER);

    const harness = await (
      await ethers.getContractFactory("TokenSwapHarness")
    )
      .connect(user)
      .deploy();
    await harness.deployed();
    await harness.setGHST(ghst.address);

    const tokenIn = await (
      await ethers.getContractFactory("ReturnTrueNoopERC20")
    )
      .connect(user)
      .deploy();
    await tokenIn.deployed();

    const swapAmount = ethers.utils.parseEther("10");
    const minOut = ethers.utils.parseEther("3");
    await tokenIn.mint(user.address, swapAmount);
    await tokenIn.approve(harness.address, swapAmount);

    const deadline = (await chainNowTs()) + 3600;

    const ghstBefore = await ghst.balanceOf(user.address);
    const out = await harness.callStatic.swapForGHST(tokenIn.address, swapAmount, minOut, deadline, user.address);
    const tx = await harness.swapForGHST(tokenIn.address, swapAmount, minOut, deadline, user.address);
    await tx.wait();
    const ghstAfter = await ghst.balanceOf(user.address);

    expect(out).to.eq(minOut);
    expect(ghstAfter.sub(ghstBefore)).to.eq(minOut);
  });
});
