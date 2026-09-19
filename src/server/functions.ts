"use server";

import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { properties, transfers, disputes, events } from "./db/schema";

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const recentEvents = await db.query.events.findMany({
    orderBy: [desc(events.timestamp)],
    limit: 5,
  });

  const openDisputes = await db.query.disputes.findMany({
    where: eq(disputes.status, "Pending"),
    limit: 5,
  });

  const recentTransfers = await db.query.transfers.findMany({
    orderBy: [desc(transfers.createdAt)],
    limit: 5,
  });

  const allProperties = await db.query.properties.findMany();

  return {
    recentEvents,
    openDisputes,
    recentTransfers,
    propertiesCount: allProperties.length,
  };
});

export const getUserProperties = createServerFn({ method: "GET" })
  .validator((address: string) => address)
  .handler(async ({ data: ownerAddress }: any) => {
    return await db.query.properties.findMany({
      where: eq(properties.currentOwner, ownerAddress.toLowerCase()),
    });
  });

export const getRegistryProperties = createServerFn({ method: "GET" }).handler(async () => {
  return await db.query.properties.findMany();
});

export const getRecentTransfers = createServerFn({ method: "GET" }).handler(async () => {
  return await db.query.transfers.findMany({
    orderBy: [desc(transfers.createdAt)],
    limit: 10,
  });
});

export const getDisputesData = createServerFn({ method: "GET" }).handler(async () => {
  const allDisputes = await db.query.disputes.findMany({
    orderBy: [desc(disputes.createdAt)],
  });
  const allProperties = await db.query.properties.findMany();
  return { disputes: allDisputes, properties: allProperties };
});

export const getPropertyData = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }: any) => {
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
    });

    const propertyDisputes = await db.query.disputes.findMany({
      where: eq(disputes.propertyId, id),
    });

    return {
      property,
      events: propertyEvents,
      transfers: propertyTransfers,
      disputes: propertyDisputes,
    };
  });