import { ethers, network } from "hardhat";
import { getLedgerSigner, impersonate } from "../helperFunctions";
import { varsForNetwork } from "../../helpers/constants";

export async function whitelistTokens() {
  let signer;
  const c = await varsForNetwork(ethers);
  const testing = ["hardhat", "localhost"].includes(network.name);

  let gbmDiamond = await ethers.getContractAt("GBMFacet", c.gbmDiamond);

  if (testing) {
    const gbmDiamondOwner = await getOwner(c.gbmDiamond);

    gbmDiamond = await impersonate(
      gbmDiamondOwner,
      gbmDiamond,
      ethers,
      network
    );
  } else if (network.name === "matic" || network.name === "base") {
    signer = await getLedgerSigner(ethers);
    gbmDiamond.connect(signer);
  } else throw Error("Incorrect network selected");

  //whitelist tokens
  const tokens = [
    c.realmDiamond,
    c.installationDiamond,
    c.tileDiamond,
    c.ggSkinsDiamond,
  ];
  const bool = [true, true, true, true];

  for (let i = 0; i < 3; i++) {
    let tx = await gbmDiamond.toggleContractWhitelist(tokens[i], bool[i]);
    await tx.wait();
    console.log(`whitelisted token ${tokens[i]} at txn ${tx.hash}`);
  }

  //set bidding allowed
  for (let i = 0; i < tokens.length; i++) {
    let tx = await gbmDiamond.setBiddingAllowed(tokens[i], true);
    await tx.wait();
    console.log(`set bidding allowed for token ${tokens[i]} at txn ${tx.hash}`);
  }
}

async function getOwner(address: string) {
  const ownershipFacet = await ethers.getContractAt("OwnershipFacet", address);
  const owner = await ownershipFacet.owner();
  return owner;
}

if (require.main === module) {
  whitelistTokens()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
