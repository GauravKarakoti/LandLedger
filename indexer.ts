import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { db } from "./src/server/db";
// 1. Import the transfers and disputes tables from your schema
import { properties, events, transfers, disputes } from "./src/server/db/schema";
import { LANDLEDGER_CONTRACT } from "./src/lib/web3";
import { eq } from "drizzle-orm"; 

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
});

const propertyRegisteredEvent = parseAbiItem(
  "event PropertyRegistered(string propertyId, address indexed owner, string legalIdentifier, string metadataUri)"
);

const propertyTransferredEvent = parseAbiItem(
  "event PropertyTransferred(string propertyId, address indexed previousOwner, address indexed newOwner)"
);

const disputeRaisedEvent = parseAbiItem(
  "event DisputeRaised(uint256 indexed disputeId, string propertyId, address indexed claimant, string reason)"
);

const disputeResolvedEvent = parseAbiItem(
  "event DisputeResolved(uint256 indexed disputeId, string propertyId, uint8 status)"
);

console.log("Indexer started. Listening for LandLedger events...");

// --- REGISTRATION LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT as `0x${string}`,
  event: propertyRegisteredEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, owner, legalIdentifier, metadataUri } = log.args;
        if (!propertyId || !owner || !metadataUri) continue;

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
          ownerName: metadata.ownerName || "Unknown", 
          metadataUri: metadataUri 
        });

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

// --- TRANSFER LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT as `0x${string}`,
  event: propertyTransferredEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, previousOwner, newOwner } = log.args;
        if (!propertyId || !previousOwner || !newOwner) continue;

        console.log(`Property ${propertyId} transferred to ${newOwner}. Updating database...`);

        await db.update(properties)
          .set({ currentOwner: newOwner.toLowerCase() })
          .where(eq(properties.id, propertyId));

        await db.insert(events).values({
          propertyId: propertyId,
          type: "PropertyTransferred",
          description: `Transferred from ${previousOwner} to ${newOwner}`,
          transactionHash: log.transactionHash,
        });

        // 2. Add the transfer to the dedicated transfers table
        await db.insert(transfers).values({
          propertyId: propertyId,
          previousOwner: previousOwner.toLowerCase(),
          newOwner: newOwner.toLowerCase(),
          transactionHash: log.transactionHash,
          status: "COMPLETED",
        });

        console.log(`Successfully indexed transfer for ${propertyId}!`);
      } catch (err) {
        console.error("Failed to index transfer event:", err);
      }
    }
  },
});

// --- DISPUTE RAISED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT as `0x${string}`,
  event: disputeRaisedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { disputeId, propertyId, claimant, reason } = log.args;
        if (!propertyId || !claimant) continue;

        console.log(`Dispute raised on ${propertyId} by ${claimant}. Freezing property...`);

        await db.update(properties)
          .set({ status: "InDispute" })
          .where(eq(properties.id, propertyId));

        await db.insert(events).values({
          propertyId: propertyId,
          type: "DisputeRaised",
          description: `Dispute #${disputeId} raised by ${claimant}: ${reason}`,
          transactionHash: log.transactionHash,
        });

        // 3. Add the dispute to the dedicated disputes table
        // (We cast disputeId to Number because Viem returns it as a BigInt)
        await db.insert(disputes).values({
          id: Number(disputeId),
          propertyId: propertyId,
          claimant: claimant.toLowerCase(),
          reason: reason!,
          status: "Pending",
        });

        console.log(`Successfully indexed dispute for ${propertyId}!`);
      } catch (err) {
        console.error("Failed to index dispute raised event:", err);
      }
    }
  },
});

// --- DISPUTE RESOLVED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT as `0x${string}`,
  event: disputeResolvedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { disputeId, propertyId, status } = log.args;
        if (!propertyId) continue;

        console.log(`Dispute #${disputeId} resolved for ${propertyId}. Unfreezing property...`);

        await db.update(properties)
          .set({ status: "Active" })
          .where(eq(properties.id, propertyId));

        const resolution = status === 1 ? "Resolved" : "Dismissed";

        await db.insert(events).values({
          propertyId: propertyId,
          type: "DisputeResolved",
          description: `Dispute #${disputeId} was ${resolution}`,
          transactionHash: log.transactionHash,
        });

        // 4. Update the dispute record status in the dedicated disputes table
        await db.update(disputes)
          .set({ status: resolution })
          .where(eq(disputes.id, Number(disputeId)));

        console.log(`Successfully indexed resolution for ${propertyId}!`);
      } catch (err) {
        console.error("Failed to index dispute resolved event:", err);
      }
    }
  },
});