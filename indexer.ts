import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { db } from "./src/server/db";
import { properties, events } from "./src/server/db/schema";
import { LANDLEDGER_CONTRACT } from "./src/lib/web3";

// 1. Setup Viem Client to read from Base Sepolia
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
});

const propertyRegisteredEvent = parseAbiItem(
  "event PropertyRegistered(string propertyId, address indexed owner, string legalIdentifier, string metadataUri)"
);

console.log("Indexer started. Listening for LandLedger events...");

// 3. Listen for new blocks and capture emitted events
client.watchEvent({
  address: LANDLEDGER_CONTRACT as `0x${string}`,
  event: propertyRegisteredEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, owner, legalIdentifier, metadataUri } = log.args;
        if (!propertyId || !owner || !metadataUri) continue;

        // Parse the simulated IPFS metadata you sent from the frontend
        const metadata = JSON.parse(metadataUri);

        console.log(`New property registered on-chain: ${propertyId}. Saving to database...`);

        await db.insert(properties).values({
          id: propertyId,
          currentOwner: owner.toLowerCase(),
          legalIdentifier: legalIdentifier!,
          location: metadata.location,
          areaSqm: metadata.areaSqm,
          valuationInr: metadata.valuationInr,
          status: "Active",
          // Provide a fallback since ownerName wasn't in the frontend form
          ownerName: metadata.ownerName || "Unknown", 
          // Save the raw IPFS string to match your schema
          metadataUri: metadataUri 
        });

        // 5. Append the global ledger event
        await db.insert(events).values({
          propertyId: propertyId,
          type: "PropertyRegistered",
          description: `Registered to ${owner}`,
          transactionHash: log.transactionHash,
        });

        console.log(`Successfully indexed ${propertyId}!`);
      } catch (err) {
        console.error("Failed to index event:", err);
      }
    }
  },
});