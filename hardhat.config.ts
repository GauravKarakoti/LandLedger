import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import "dotenv/config";

export default defineConfig({
  plugins: [
    hardhatToolboxMochaEthersPlugin,
    hardhatEthersPlugin
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
      },
      production: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});