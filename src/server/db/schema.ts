import { pgTable, text, varchar, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const properties = pgTable("properties", {
  id: varchar("id", { length: 255 }).primaryKey(), // Matches the on-chain propertyId (e.g., PROP-DL-2024-001)
  currentOwner: varchar("current_owner", { length: 42 }).notNull(), // EVM Address (lowercase)
  legalIdentifier: varchar("legal_identifier", { length: 255 }).notNull(),
  location: text("location").notNull(),
  areaSqm: integer("area_sqm").notNull(),
  valuationInr: integer("valuation_inr").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("Active"), // Active, InDispute, Transferred, Frozen
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  registeredDate: timestamp("registered_date").notNull().defaultNow(),
  metadataUri: text("metadata_uri"), // IPFS link to physical documents
});

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: varchar("property_id", { length: 255 }).notNull().references(() => properties.id),
  previousOwner: varchar("previous_owner", { length: 42 }).notNull(),
  newOwner: varchar("new_owner", { length: 42 }).notNull(),
  considerationInr: integer("consideration_inr"), // Optional: if sale amount is recorded off-chain
  status: varchar("status", { length: 50 }).notNull().default("COMPLETED"),
  transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: varchar("property_id", { length: 255 }).notNull().references(() => properties.id),
  claimant: varchar("claimant", { length: 42 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("Pending"), // Pending, Resolved, Dismissed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: varchar("property_id", { length: 255 }).notNull().references(() => properties.id),
  type: varchar("type", { length: 100 }).notNull(), // e.g., "MINT", "TRANSFER", "DISPUTE_RAISED"
  description: text("description").notNull(),
  transactionHash: varchar("transaction_hash", { length: 66 }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Define relations for optimized TanStack Start querying
export const propertiesRelations = relations(properties, ({ many }) => ({
  transfers: many(transfers),
  disputes: many(disputes),
  events: many(events),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  property: one(properties, {
    fields: [transfers.propertyId],
    references: [properties.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  property: one(properties, {
    fields: [disputes.propertyId],
    references: [properties.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  property: one(properties, {
    fields: [events.propertyId],
    references: [properties.id],
  }),
}));