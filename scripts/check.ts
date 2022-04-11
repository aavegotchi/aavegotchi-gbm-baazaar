//require("./libraries/diamond.ts");
import { getSelectors } from "./libraries/diamond";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { BigNumber } from "ethers/lib/ethers";
//import { BigNumber } from "ethers";
dotenv.config({ path: __dirname + "/.env" });

async function main() {
  // bidder: string,
  // auctionID: string | BigNumber,
  // bidAmount: BigNumber | string,
  // lastHighestBid: string | BigNumber
  let sel;
  let facet = await ethers.getContractFactory("GBMFacet");

  sel = getSelectors(facet);
  console.log(sel);
  //@ts-ignore
  // const key: string = process.env.SECRET;
  // let backendSigner = new ethers.Wallet(key);

  // const messageHash = ethers.utils.solidityKeccak256(
  //   ["address", "uint256", "uint256", "uint256"],
  //   [bidder, auctionID, bidAmount, lastHighestBid]
  // );
  // console.log(messageHash);
  // const signedMessage = await backendSigner.signMessage(
  //   ethers.utils.arrayify(messageHash)
  // );
  // console.log(backendSigner.publicKey);
  // const Sig = ethers.utils.arrayify(signedMessage);

  // // console.log(await ethers.utils.splitSignature(Sig));
  // // console.log(signedMessage);
  // return Sig;
}

main();
// "0x07AdeA2EdC30d04f46448E3159aD7aAF0222dB13",
// "65345667531147760570479042252650777837779084492069682554145350071307732057187",
// "100000000000000000000",
// "0"
