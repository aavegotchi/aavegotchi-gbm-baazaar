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

describe("LibTokenSwap: reset router allowance", function () {
  it("clears leftover allowance after swap", async function () {
    this.timeout(120000);

    const [user] = await ethers.getSigners();

    const routerImpl = await (
      await ethers.getContractFactory("MockZRouterPartialSpend")
    )
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

    const tokenIn = await (await ethers.getContractFactory("ERC20Generic"))
      .connect(user)
      .deploy();
    await tokenIn.deployed();

    const swapAmount = ethers.utils.parseEther("10");
    const minOut = ethers.utils.parseEther("1");
    await tokenIn.mint(swapAmount, user.address);
    await tokenIn.approve(harness.address, swapAmount);

    const deadline = (await chainNowTs()) + 3600;

    // sanity: no allowance before
    expect(await tokenIn.allowance(harness.address, ROUTER)).to.eq(0);

    const tx = await harness.swapForGHST(
      tokenIn.address,
      swapAmount,
      minOut,
      deadline,
      user.address
    );
    await tx.wait();

    // without the fix, our partial-spend router would leave leftover allowance > 0
    expect(await tokenIn.allowance(harness.address, ROUTER)).to.eq(0);
  });
});

