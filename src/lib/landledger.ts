/**
 * Shared types and formatting utilities for LandLedger.
 * Data fetching is now handled server-side via TanStack Start + Drizzle ORM.
 * State mutations are handled via Wagmi + Smart Contracts.
 */

// Align these statuses perfectly with your PostgreSQL Drizzle schema defaults
export type PropertyStatus = "Active" | "InDispute" | "Transferred" | "Frozen";
export type TransferStatus = "INITIATED" | "COMPLETED" | "CANCELLED";
export type DisputeStatus = "Pending" | "Resolved" | "Dismissed";

// Interface mapping for the HistoryTimeline UI component
export interface LedgerEvent {
  id: string;
  propertyId: string;
  type: string; // e.g., "MINT", "TRANSFER", "DISPUTE_RAISED"
  actor: string;
  detail: string;
  txHash: string;
  blockNumber: number;
  timestamp: Date | string;
}

/**
 * Shortens a standard 42-character EVM address to 0x1234…abcd
 */
export function shorten(address: string | null | undefined) {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Formats standard numbers to Indian Rupee (INR) currency strings
 */
export function formatInr(value: number | null | undefined) {
  if (value === null || value === undefined) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Consistently formats dates to Indian localized strings (e.g., 24 Oct 2024)
 */
export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}