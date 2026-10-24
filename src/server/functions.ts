"use server";

import { createServerFn } from "@tanstack/react-start";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "./db";
import { properties, transfers, disputes, events } from "./db/schema";

/**
 * Maps a raw database event row to the LedgerEvent interface expected by <HistoryTimeline />
 */
function toLedgerEvent(e: typeof events.$inferSelect, fallbackActor = "0x0000000000000000000000000000000000000000") {
  const actorMatch = e.description.match(/0x[a-fA-F0-9]{40}/);
  return {
    id: e.id,
    propertyId: e.propertyId,
    type: e.type,
    timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
    blockNumber: 0,
    detail: e.description,
    actor: actorMatch ? actorMatch[0] : fallbackActor,
    txHash: e.transactionHash || "0x",
  };
}

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const rawEvents = await db.query.events.findMany({
    orderBy: [desc(events.timestamp)],
    limit: 8,
  });

  const openDisputes = await db.query.disputes.findMany({
    where: eq(disputes.status, "Pending"),
    orderBy: [desc(disputes.createdAt)],
    limit: 5,
  });

  const recentTransfers = await db.query.transfers.findMany({
    orderBy: [desc(transfers.createdAt)],
    limit: 5,
  });

  const allProperties = await db.query.properties.findMany({
    orderBy: [desc(properties.registeredDate)],
  });

  return {
    recentEvents: rawEvents.map((e) => toLedgerEvent(e)),
    openDisputes,
    recentTransfers,
    properties: allProperties,
    propertiesCount: allProperties.length,
  };
});

export const getUserProperties = createServerFn({ method: "GET" })
  .validator((address: string) => {
    const cleaned = (address || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(cleaned)) {
      return "";
    }
    return cleaned;
  })
  .handler(async ({ data: ownerAddress }: { data: string }) => {
    if (!ownerAddress) return [];
    return await db.query.properties.findMany({
      where: eq(properties.currentOwner, ownerAddress),
      orderBy: [desc(properties.registeredDate)],
    });
  });

export const getRegistryProperties = createServerFn({ method: "GET" }).handler(async () => {
  return await db.query.properties.findMany({
    orderBy: [desc(properties.registeredDate)],
  });
});

export const getRecentTransfers = createServerFn({ method: "GET" }).handler(async () => {
  return await db.query.transfers.findMany({
    orderBy: [desc(transfers.createdAt)],
    limit: 15,
  });
});

export const getDisputesData = createServerFn({ method: "GET" }).handler(async () => {
  const allDisputes = await db.query.disputes.findMany({
    orderBy: [desc(disputes.createdAt)],
  });
  const allProperties = await db.query.properties.findMany({
    orderBy: [desc(properties.registeredDate)],
  });
  return { disputes: allDisputes, properties: allProperties };
});

export const getPropertyData = createServerFn({ method: "GET" })
  .validator((id: string) => (id || "").trim())
  .handler(async ({ data: id }: { data: string }) => {
    if (!id) return null;

    const property = await db.query.properties.findFirst({
      where: eq(properties.id, id),
    });

    if (!property) return null;

    const propertyEvents = await db.query.events.findMany({
      where: eq(events.propertyId, id),
      orderBy: [desc(events.timestamp)],
    });

    const propertyTransfers = await db.query.transfers.findMany({
      where: eq(transfers.propertyId, id),
      orderBy: [desc(transfers.createdAt)],
    });

    const propertyDisputes = await db.query.disputes.findMany({
      where: eq(disputes.propertyId, id),
      orderBy: [desc(disputes.createdAt)],
    });

    return {
      property,
      events: propertyEvents.map((e) => toLedgerEvent(e, property.currentOwner)),
      transfers: propertyTransfers,
      disputes: propertyDisputes,
    };
  });

export const searchProperties = createServerFn({ method: "GET" })
  .validator((query: string) => (query || "").trim())
  .handler(async ({ data: query }: { data: string }) => {
    if (!query) {
      return await db.query.properties.findMany({
        orderBy: [desc(properties.registeredDate)],
        limit: 25,
      });
    }

    return await db
      .select()
      .from(properties)
      .where(
        or(
          ilike(properties.id, `%${query}%`),
          ilike(properties.legalIdentifier, `%${query}%`),
          ilike(properties.location, `%${query}%`),
          ilike(properties.currentOwner, `%${query}%`),
          ilike(properties.ownerName, `%${query}%`)
        )
      )
      .orderBy(desc(properties.registeredDate))
      .limit(25);
  });