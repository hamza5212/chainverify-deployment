const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ChainVerify = await hre.ethers.getContractFactory("ChainVerify");
  const contract = await ChainVerify.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("ChainVerify deployed to:", address);

  // Save the address for the frontend
  const frontendDir = path.join(__dirname, "..", "..", "frontend", "src");
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.writeFileSync(
    path.join(frontendDir, "contract-address.json"),
    JSON.stringify({ ChainVerify: address }, null, 2)
  );
  console.log("Saved to frontend/src/contract-address.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });