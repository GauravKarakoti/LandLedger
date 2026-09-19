import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Hardhat v3: 'ethers' must be extracted from the active network connection
  const { ethers } = await hre.network.create();
  
  // 'artifacts' remains globally available on hre
  const { artifacts } = hre;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying LandLedger with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy the contract
  const LandLedger = await ethers.getContractFactory("LandLedger");
  const landLedger = await LandLedger.deploy();
  await landLedger.waitForDeployment();

  const contractAddress = await landLedger.getAddress();
  console.log("LandLedger deployed successfully to:", contractAddress);

  // Export artifacts to the frontend - MUST BE AWAITED
  await saveFrontendFiles(contractAddress, artifacts);
}

// Converted to async to support Hardhat v3's Promise-based artifacts
async function saveFrontendFiles(contractAddress: string, artifacts: any) {
  const frontendDir = path.join(__dirname, "..", "src", "lib", "contracts");

  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }

  // Save the Contract Address
  fs.writeFileSync(
    path.join(frontendDir, "address.json"),
    JSON.stringify({ LandLedger: contractAddress }, null, 2)
  );

  // Await the artifact reading process
  const LandLedgerArtifact = await artifacts.readArtifact("LandLedger");
  
  fs.writeFileSync(
    path.join(frontendDir, "LandLedger.json"),
    JSON.stringify(LandLedgerArtifact, null, 2)
  );

  console.log(`✅ ABI and Address saved to ${frontendDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});