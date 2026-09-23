import { defineConfig } from "hardhat/config";
import "dotenv/config";

// 1. Import the plugin object
import hardhatMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  // 2. Explicitly register it so Hardhat knows how to execute Mocha and .ts files
  plugins: [hardhatMochaEthers],
  
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: process.env["BASE_SEPOLIA_RPC_URL"] || "",
      accounts: process.env["PRIVATE_KEY"] ? [process.env["PRIVATE_KEY"]] : [],
    },
  },
});