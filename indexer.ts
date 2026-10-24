import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { db } from "./src/server/db";
import { properties, events, transfers, disputes } from "./src/server/db/schema";
import { LANDLEDGER_CONTRACT } from "./src/lib/web3";
import { and, eq } from "drizzle-orm";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  pollingInterval: 4_000,
});

const propertyRegisteredEvent = parseAbiItem(
  "event PropertyRegistered(string propertyId, address indexed owner, string legalIdentifier, string metadataUri)"
);

const propertyTransferredEvent = parseAbiItem(
  "event PropertyTransferred(string propertyId, address indexed previousOwner, address indexed newOwner)"
);

const transferInitiatedEvent = parseAbiItem(
  "event TransferInitiated(uint256 indexed transferId, string propertyId, address indexed seller, address indexed buyer)"
);

const disputeRaisedEvent = parseAbiItem(
  "event DisputeRaised(uint256 indexed disputeId, string propertyId, address indexed claimant, string reason)"
);

const disputeResolvedEvent = parseAbiItem(
  "event DisputeResolved(uint256 indexed disputeId, string propertyId, uint8 status)"
);

const metadataUpdatedEvent = parseAbiItem(
  "event MetadataUpdated(string propertyId, string newMetadataUri, address indexed updatedBy)"
);

function parseMetadataSafely(metadataUri: string) {
  try {
    const parsed = JSON.parse(metadataUri);
    return {
      location: parsed.location || "Unknown Location",
      areaSqm: Number(parsed.areaSqm ?? parsed.area ?? 0),
      valuationInr: Number(parsed.valuationInr ?? parsed.valuation ?? 0),
      ownerName: parsed.ownerName || "Verified Title Holder",
    };
  } catch {
    return {
      location: metadataUri.startsWith("ipfs://") ? `IPFS Record (${metadataUri.slice(0, 16)}...)` : "On-Chain Parcel",
      areaSqm: 100,
      valuationInr: 0,
      ownerName: "Verified Title Holder",
    };
  }
}

console.log(`[Indexer] Started listening for LandLedger events on ${LANDLEDGER_CONTRACT}...`);

// --- 1. REGISTRATION LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: propertyRegisteredEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, owner, legalIdentifier, metadataUri } = log.args;
        if (!propertyId || !owner || !metadataUri) continue;

        const metadata = parseMetadataSafely(metadataUri);
        console.log(`[Indexer] PropertyRegistered: ${propertyId} -> ${owner}`);

        await db
          .insert(properties)
          .values({
            id: propertyId,
            currentOwner: owner.toLowerCase(),
            legalIdentifier: legalIdentifier ?? propertyId,
            location: metadata.location,
            areaSqm: metadata.areaSqm,
            valuationInr: metadata.valuationInr,
            status: "Active",
            ownerName: metadata.ownerName,
            metadataUri,
          })
          .onConflictDoUpdate({
            target: properties.id,
            set: {
              currentOwner: owner.toLowerCase(),
              metadataUri,
              status: "Active",
            },
          });

        await db.insert(events).values({
          propertyId,
          type: "PropertyRegistered",
          description: `Registered to ${owner}`,
          transactionHash: log.transactionHash,
        });
      } catch (err) {
        console.error("[Indexer] Failed to index PropertyRegistered:", err);
      }
    }
  },
});

// --- 2. TRANSFER INITIATED (MULTI-SIG) LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: transferInitiatedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { transferId, propertyId, seller, buyer } = log.args;
        if (!propertyId || !seller || !buyer) continue;

        await db.insert(events).values({
          propertyId,
          type: "TransferInitiated",
          description: `Multi-sig transfer #${transferId} initiated from ${seller} to ${buyer}`,
          transactionHash: log.transactionHash,
        });
      } catch (err) {
        console.error("[Indexer] Failed to index TransferInitiated:", err);
      }
    }
  },
});

// --- 3. TRANSFER COMPLETED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: propertyTransferredEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, previousOwner, newOwner } = log.args;
        if (!propertyId || !previousOwner || !newOwner) continue;

        console.log(`[Indexer] PropertyTransferred: ${propertyId} -> ${newOwner}`);

        await db
          .update(properties)
          .set({ currentOwner: newOwner.toLowerCase(), status: "Active" })
          .where(eq(properties.id, propertyId));

        await db.insert(events).values({
          propertyId,
          type: "PropertyTransferred",
          description: `Transferred from ${previousOwner} to ${newOwner}`,
          transactionHash: log.transactionHash,
        });

        await db.insert(transfers).values({
          propertyId,
          previousOwner: previousOwner.toLowerCase(),
          newOwner: newOwner.toLowerCase(),
          transactionHash: log.transactionHash ?? "0x",
          status: "COMPLETED",
        });
      } catch (err) {
        console.error("[Indexer] Failed to index PropertyTransferred:", err);
      }
    }
  },
});

// --- 4. DISPUTE RAISED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: disputeRaisedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { disputeId, propertyId, claimant, reason } = log.args;
        if (!propertyId || !claimant || disputeId === undefined) continue;

        console.log(`[Indexer] DisputeRaised #${disputeId} on ${propertyId}`);

        await db
          .update(properties)
          .set({ status: "InDispute" })
          .where(eq(properties.id, propertyId));

        await db.insert(events).values({
          propertyId,
          type: "DisputeRaised",
          description: `Dispute #${disputeId} raised by ${claimant}: ${reason}`,
          transactionHash: log.transactionHash,
        });

        await db
          .insert(disputes)
          .values({
            id: Number(disputeId),
            propertyId,
            claimant: claimant.toLowerCase(),
            reason: reason ?? "Unspecified dispute",
            status: "Pending",
          })
          .onConflictDoUpdate({
            target: disputes.id,
            set: { status: "Pending", reason: reason ?? "Unspecified dispute" },
          });
      } catch (err) {
        console.error("[Indexer] Failed to index DisputeRaised:", err);
      }
    }
  },
});

// --- 5. DISPUTE RESOLVED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: disputeResolvedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { disputeId, propertyId, status } = log.args;
        if (!propertyId || disputeId === undefined) continue;

        const resolution = status === 1 ? "Resolved" : "Dismissed";
        console.log(`[Indexer] DisputeResolved #${disputeId} (${resolution}) for ${propertyId}`);

        await db
          .update(disputes)
          .set({ status: resolution, resolvedAt: new Date() })
          .where(eq(disputes.id, Number(disputeId)));

        // Check if any other disputes remain Pending for this property
        const remainingPending = await db
          .select()
          .from(disputes)
          .where(and(eq(disputes.propertyId, propertyId), eq(disputes.status, "Pending")));

        if (remainingPending.length === 0) {
          await db
            .update(properties)
            .set({ status: "Active" })
            .where(eq(properties.id, propertyId));
        }

        await db.insert(events).values({
          propertyId,
          type: "DisputeResolved",
          description: `Dispute #${disputeId} was ${resolution}`,
          transactionHash: log.transactionHash,
        });
      } catch (err) {
        console.error("[Indexer] Failed to index DisputeResolved:", err);
      }
    }
  },
});

// --- 6. METADATA UPDATED LISTENER ---
client.watchEvent({
  address: LANDLEDGER_CONTRACT,
  event: metadataUpdatedEvent,
  onLogs: async (logs) => {
    for (const log of logs) {
      try {
        const { propertyId, newMetadataUri, updatedBy } = log.args;
        if (!propertyId || !newMetadataUri) continue;

        const metadata = parseMetadataSafely(newMetadataUri);
        await db
          .update(properties)
          .set({
            metadataUri: newMetadataUri,
            location: metadata.location,
            areaSqm: metadata.areaSqm,
            valuationInr: metadata.valuationInr,
          })
          .where(eq(properties.id, propertyId));

        await db.insert(events).values({
          propertyId,
          type: "MetadataUpdated",
          description: `Metadata updated by ${updatedBy}`,
          transactionHash: log.transactionHash,
        });
      } catch (err) {
        console.error("[Indexer] Failed to index MetadataUpdated:", err);
      }
    }
  },
});