import { ethers } from "hardhat";
import { deployDiamond, presets } from "./deployDiamond";
import { GBMFacet } from "../../typechain/GBMFacet";
import { ERC1155Generic, ERC20Generic, ERC721Generic } from "../../typechain";

async function initPresets() {
  let gbm: GBMFacet;

  let sampleERC721: ERC721Generic;
  let sampleERC1155: ERC1155Generic;
  const gbmDiamondAddress = await deployDiamond();
  gbm = (await ethers.getContractAt("GBMFacet", gbmDiamondAddress)) as GBMFacet;

  //initialize presets
  //0--low preset
  //1--medium preset
  //2-- high preset
  console.log("setting presets");
  await gbm.setAuctionPresets(0, presets[0]);
  await gbm.setAuctionPresets(1, presets[1]);
  await gbm.setAuctionPresets(2, presets[2]);

  //deploy mock tokens

  //ERC721
  const erc721 = await ethers.getContractFactory("ERC721Generic");
  sampleERC721 = await erc721.deploy();
  await sampleERC721.deployed();
  console.log("ERC721 deployed to", sampleERC721.address);

  //ERC1155
  const erc1155 = await ethers.getContractFactory("ERC1155Generic");
  sampleERC1155 = await erc1155.deploy();
  await sampleERC1155.deployed();
  console.log("ERC1155 deployed to", sampleERC1155.address);

  //enable a secondary market for both NFTs
  console.log("enabling secondary markets");
  //market id--10--erc721
  //market id--11--erc1155
  await gbm.enableContract(10, sampleERC721.address);
  await gbm.enableContract(111, sampleERC1155.address);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  initPresets()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
