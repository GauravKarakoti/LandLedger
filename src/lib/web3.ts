import { http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { type Abi, keccak256, toBytes } from "viem";
import { ethers } from "ethers";
import { metaMaskWallet, phantomWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import landLedgerAddress from "./contracts/address.json";
import landLedgerArtifact from "./contracts/LandLedger.json";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_HEX = "0x14a34";
export const BASE_SEPOLIA_RPC =
  import.meta.env["VITE_BASE_SEPOLIA_RPC_URL"] || "https://sepolia.base.org";

const walletConnectProjectId =
  import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"]!;

export const web3Config = getDefaultConfig({
  appName: "LandLedger",
  projectId: walletConnectProjectId,
  chains: [baseSepolia],
  ssr: true,
  transports: {
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC),
  },
  wallets: [
    { groupName: "Recommended", wallets: [metaMaskWallet, phantomWallet, walletConnectWallet] },
  ],
});

export const LANDLEDGER_ABI = landLedgerArtifact.abi as Abi;
export const LANDLEDGER_CONTRACT = landLedgerAddress.LandLedger as `0x${string}`;

/**
 * Returns a read-only Ethers contract instance connected to Base Sepolia RPC
 */
export function getReadOnlyContract() {
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
  const contract = new ethers.Contract(LANDLEDGER_CONTRACT, landLedgerArtifact.abi, provider);
  return { provider, contract };
}

/**
 * Connects to window.ethereum, enforces Base Sepolia (84532), and returns { provider, signer, contract, address }
 */
export async function getWeb3Signer() {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No Web3 wallet detected. Please install MetaMask or connect a wallet.");
  }

  const ethereum = (window as any).ethereum;
  const provider = new ethers.BrowserProvider(ethereum);
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_HEX }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BASE_SEPOLIA_HEX,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [BASE_SEPOLIA_RPC],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            },
          ],
        });
      } else {
        throw new Error("Please switch your wallet network to Base Sepolia.");
      }
    }
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const contract = new ethers.Contract(LANDLEDGER_CONTRACT, landLedgerArtifact.abi, signer);

  return { provider, signer, contract, address };
}

/**
 * Computes a deterministic Keccak-256 hash of an uploaded deed/evidence file in the browser
 */
export async function hashDocumentFile(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer();
  return keccak256(new Uint8Array(buffer));
}

export function hashMetadataString(payload: string): `0x${string}` {
  return keccak256(toBytes(payload));
}

export function getBaseScanTxUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}