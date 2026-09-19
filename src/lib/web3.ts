import { http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem"; // Import the Abi type
import { metaMaskWallet, phantomWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
// Import the dynamically generated files from the deployment script
import landLedgerAddress from "./contracts/address.json";
import landLedgerArtifact from "./contracts/LandLedger.json";

export const web3Config = getDefaultConfig({
  appName: "LandLedger",
  projectId: import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"]!, // Obtain from cloud.walletconnect.com
  chains: [baseSepolia],
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
  },
  wallets: [
    { groupName: "Recommended", wallets: [metaMaskWallet, phantomWallet, walletConnectWallet] },
  ],
});

// Cast to 'Abi' instead of using 'as const'
export const LANDLEDGER_ABI = landLedgerArtifact.abi as Abi;

// Expose the dynamically written address
export const LANDLEDGER_CONTRACT = landLedgerAddress.LandLedger as `0x${string}`;