import { expect } from "chai";
import { ethers } from "hardhat";
import { varsForNetwork } from "../helpers/constants";
import { upgradeAddSwapFns } from "../scripts/gbmBaazaar/upgrade-addSwapFns";

describe("Upgrade: remove getAllUnclaimedAuctions selector", function () {
  it("removes getAllUnclaimedAuctions() from the diamond", async function () {
    this.timeout(1_000_000);

    const vars = await varsForNetwork(ethers as any);
    const diamond = vars.gbmDiamond!;

    const loupe = await ethers.getContractAt("DiamondLoupeFacet", diamond);
    const selector = new ethers.utils.Interface([
      "function getAllUnclaimedAuctions() view returns (uint256[])",
    ]).getSighash("getAllUnclaimedAuctions()");

    const before = await loupe.facetAddress(selector);
    expect(
      before,
      "expected selector to exist pre-upgrade; base diamond may have changed"
    ).to.not.eq(ethers.constants.AddressZero);

    await upgradeAddSwapFns();

    const after = await loupe.facetAddress(selector);
    expect(after).to.eq(ethers.constants.AddressZero);
  });
});

