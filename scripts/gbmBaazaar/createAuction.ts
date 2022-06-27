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
  const GBMDiamondAddress = "0x36819192A0c04CdC3376a1A6C0f116C13bf6e9D5";
  let gbm: GBMFacet;
  let id: BigNumber;
  const PK1 = process.env.SECRET;
  const PK2 = process.env.SECRET_2;
  const acc = new ethers.Wallet(PK1);
  const signers = await ethers.getSigners();

  //CREATE
  gbm = (await ethers.getContractAt(
    "GBMFacet",
    GBMDiamondAddress,
    signers[0]
  )) as GBMFacet;

  const auctionDetails = {
    startTime: Math.floor(Date.now() / 1000 + 200),
    endTime: Math.floor(Date.now() / 1000) + 8640,
    tokenAmount: 1,
    tokenKind: "0x73ad2146", //ERC721
    tokenID: "11",
  };

  //create an auction
  console.log("creating auction");

  const tx1 = await gbm.createAuction(auctionDetails, 10, 2);
  //get auction id
  const txResolved = await tx1.wait();
  const events = txResolved.events.find(
    (event) => event.event === "Auction_Initialized"
  );
  const [
    _auctionID,
    _tokenID,
    _tokenAmount,
    _contractAddress,
    _tokenKind,
  ] = events.args;
  console.log("auction ID", _auctionID.toString());
  id = _auctionID;
  //MODIFY
  console.log("modifying");
  const tx2 = await gbm.modifyAuction(
    id.toString(),
    Math.floor(Date.now() / 1000) + 8641,
    1,
    "0x73ad2146"
  );
  console.log("auction modified in txn", tx2.hash);

  //BIDDING
  // bid with a second account
  const bidAmount = "1000000000000000000";
  const signer2 = new ethers.Wallet(PK2);
  const sig = await constructSig(
    signers[1].address,
    id.toString(),
    bidAmount,
    "0",
    acc
  );
  // console.log(sig);

  gbm = (await ethers.getContractAt(
    "GBMFacet",
    GBMDiamondAddress,
    signers[1]
  )) as GBMFacet;
  console.log("bidding with", signers[1].address);

  const tx = await gbm.commitBid(
    id,
    toBN(bidAmount),
    toBN("0"),
    10,
    "11",
    1,
    sig
  );
  console.log("bid added successfully in txn", tx.hash);

  //CANCEL
  //   gbm = (await ethers.getContractAt(
  //   "GBMFacet",
  //   GBMDiamondAddress,
  //   signers[1]
  // )) as GBMFacet;

  // //cannot cancel until an auction is over
  // await gbm.cancelAuction(123)
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
