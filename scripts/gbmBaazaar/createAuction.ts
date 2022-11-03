import { BigNumber, Signer, utils, Wallet } from "ethers";
import { ethers } from "hardhat";
import { ERC721Generic } from "../../typechain";
import { GBMFacet } from "../../typechain/GBMFacet";
let digest: Uint8Array;
let messageHash;
async function constructSig(
  bidder: string,
  auctionID: string,
  bidAmount: string,
  lastHighestBid: string,
  signer: Wallet
) {
  messageHash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [bidder, auctionID, bidAmount, lastHighestBid]
  );
  digest = ethers.utils.arrayify(messageHash);
  let signedMessage = await signer.signMessage(digest);
  const Sig = ethers.utils.arrayify(signedMessage);
  return Sig;
}

function toBN(No: string) {
  return BigNumber.from(No);
}

async function createAndBid() {
  const GBMDiamondAddress = "0xd6F59C1bE030Af4a9b7Fbf44e01bD2f2A0d54488";
  let gbm: GBMFacet;
  let id: BigNumber;
  let erc721: ERC721Generic;
  const PK1 = process.env.SECRET;
  const PK2 = process.env.SECRET_2;
  const acc = new ethers.Wallet(PK1);
  const signers = await ethers.getSigners();

  // //CREATE
  gbm = (await ethers.getContractAt(
    "GBMFacet",
    GBMDiamondAddress,
    signers[0]
  )) as GBMFacet;

  erc721 = (await ethers.getContractAt(
    "ERC721Generic",
    "0xdE492281AF1Eee056CaC72Ae139003506e02255d",
    signers[0]
  )) as ERC721Generic;

  const auctionDetails = {
    startTime: Math.floor(Date.now() / 1000 + 200),
    endTime: Math.floor(Date.now() / 1000) + 8640,
    tokenAmount: 1,
    tokenKind: "0x73ad2146", //ERC721
    tokenID: "14",
  };

  // const auctionDetails2 = {
  //   startTime: Math.floor(Date.now() / 1000 + 200),
  //   endTime: Math.floor(Date.now() / 1000) + 8640,
  //   tokenAmount: 1,
  //   tokenKind: "0x73ad2146", //ERC721
  //   tokenID: "14",
  // };

  // //create an auction
  console.log("creating auction");
  await erc721.setApprovalForAll(GBMDiamondAddress, true);
  const tx1 = await gbm.createAuction(auctionDetails, 10, 2);
  //get auction id
  const txResolved = await tx1.wait();
  const events = txResolved.events.find(
    (event) => event.event === "Auction_Initialized"
  );
  let [_auctionID, _tokenID, _tokenAmount, _contractAddress, _tokenKind] =
    events.args;
  id = _auctionID;
  console.log("auction ID to claim in 2hours", _auctionID.toString());

  // //second auction
  // const tx4 = await gbm.createAuction(auctionDetails2, 10, 2);
  // //get auction id
  // const txResolved2 = await tx4.wait();
  // const events2 = txResolved2.events.find(
  //   (event) => event.event === "Auction_Initialized"
  // );
  // [
  //   _auctionID,
  //   _tokenID,
  //   _tokenAmount,
  //   _contractAddress,
  //   _tokenKind,
  // ] = events2.args;
  // console.log("auction ID to cancel in 2hours", _auctionID.toString());

  // //MODIFY
  // console.log("modifying");
  // const tx2 = await gbm.modifyAuction(
  //   id.toString(),
  //   Math.floor(Date.now() / 1000) + 8641,
  //   1,
  //   "0x73ad2146"
  // );
  // console.log("auction modified in txn", tx2.hash);

  // //BIDDING
  // // bid with a second account
  // const bidAmount = "1000000000000000000";
  // const outBidAmount = "10000000000000000000";
  // const signer2 = new ethers.Wallet(PK2);
  // const sig = await constructSig(
  //   signers[1].address,
  //   id.toString(),
  //   bidAmount,
  //   "0",
  //   acc
  // );
  // id = BigNumber.from(
  //   "43148439529833925993239019604143256993101919946179241450736054784227302974423"
  // );
  // const sig2 = await constructSig(
  //   signers[2].address,
  //   id.toString(),
  //   outBidAmount,
  //   bidAmount,
  //   acc
  // );
  // // console.log(sig);

  // gbm = (await ethers.getContractAt(
  //   "GBMFacet",
  //   GBMDiamondAddress,
  //   signers[1]
  // )) as GBMFacet;
  // console.log("bidding with", signers[1].address);

  // const tx = await gbm.commitBid(
  //   id,
  //   toBN(bidAmount),
  //   toBN("0"),
  //   10,
  //   "13",
  //   1,
  //   sig
  // );
  // console.log("bid added successfully in txn", tx.hash);

  // gbm = (await ethers.getContractAt(
  //   "GBMFacet",
  //   GBMDiamondAddress,
  //   signers[2]
  // )) as GBMFacet;
  // console.log("outbidding with", signers[2].address);

  // const tx3 = await gbm.commitBid(
  //   id,
  //   toBN(outBidAmount),
  //   toBN(bidAmount),
  //   10,
  //   "13",
  //   1,
  //   sig2
  // );
  // console.log("outbidded successfully in txn", tx3.hash);

  //CANCEL
  // gbm = (await ethers.getContractAt(
  //   "GBMFacet",
  //   GBMDiamondAddress,
  //   signers[1]
  // )) as GBMFacet;

  //cannot cancel until an auction is over
  // const tx = await gbm.claim(id);
  // console.log(tx.hash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  createAndBid()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
