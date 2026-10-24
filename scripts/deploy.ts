import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Hardhat 3: Connect to the target network (defaults or explicit 'baseSepolia')
  const connection = await hre.network.connect("baseSepolia");
  const { ethers } = connection;
  const { artifacts } = hre;

  const [deployer] = await ethers.getSigners();
  console.log("--------------------------------------------------");
  console.log("🚀 Deploying LandLedger Contract to:", connection.networkName);
  console.log("📦 Deployer Wallet Address:", deployer!.address);
  
  const balance = await ethers.provider.getBalance(deployer!.address);
  console.log("💰 Account Balance:", ethers.formatEther(balance), "ETH");
  console.log("--------------------------------------------------");

  // Deploy the LandLedger smart contract
  const LandLedger = await ethers.getContractFactory("LandLedger");
  console.log("⏳ Deploying LandLedger...");
  const landLedger = await LandLedger.deploy();
  
  await landLedger.waitForDeployment();
  const contractAddress = await landLedger.getAddress();

  console.log("--------------------------------------------------");
  console.log("✅ LandLedger deployed successfully!");
  console.log("📍 Contract Address:", contractAddress);
  console.log(`🔍 BaseScan Explorer: https://sepolia.basescan.org/address/${contractAddress}`);
  console.log("--------------------------------------------------");

  // Export artifacts and address to the frontend lib directory
  await saveFrontendFiles(contractAddress, artifacts);
}

/**
 * Exports contract ABI and deployed address to src/lib/contracts/ for Wagmi/Viem integration
 */
async function saveFrontendFiles(contractAddress: string, artifacts: any) {
  const frontendDir = path.join(__dirname, "..", "src", "lib", "contracts");

  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
    console.log(`📁 Created directory: ${frontendDir}`);
  }

  // 1. Save the deployed contract address
  const addressPath = path.join(frontendDir, "address.json");
  fs.writeFileSync(
    addressPath,
    JSON.stringify({ LandLedger: contractAddress }, null, 2)
  );
  console.log(`📄 Saved contract address to ${addressPath}`);

  // 2. Read and save the contract artifact (ABI)
  const LandLedgerArtifact = await artifacts.readArtifact("LandLedger");
  const artifactPath = path.join(frontendDir, "LandLedger.json");
  
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(LandLedgerArtifact, null, 2)
  );
  console.log(`📄 Saved contract ABI artifact to ${artifactPath}`);
  console.log("✨ Frontend contract bindings successfully updated!");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});