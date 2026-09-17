/**
 * LandLedger demo ledger.
 *
 * In production these reads/writes go to the Express API (backend/) which in turn
 * talks to the LandRegistry smart contract (contracts/LandRegistry.sol) and mirrors
 * state into PostgreSQL (db/schema.sql). For the first-review demo the same data
 * shapes are kept in browser storage so the UI runs with zero infrastructure.
 */
import { useSyncExternalStore } from "react";

export type PropertyStatus = "ACTIVE" | "PENDING_TRANSFER" | "DISPUTED";
export type TransferStatus = "INITIATED" | "COMPLETED" | "CANCELLED";
export type DisputeStatus = "OPEN" | "RESOLVED";

export interface LedgerEvent {
  id: string;
  propertyId: string;
  type:
    | "PropertyRegistered"
    | "TransferInitiated"
    | "TransferCompleted"
    | "DisputeFlagged"
    | "DisputeResolved";
  actor: string;
  detail: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
}

export interface Property {
  id: string;
  legalIdentifier: string;
  location: string;
  areaSqm: number;
  currentOwner: string;
  ownerName: string;
  status: PropertyStatus;
  registeredDate: string;
  valuationInr: number;
}

export interface Transfer {
  id: string;
  propertyId: string;
  fromAddress: string;
  toAddress: string;
  status: TransferStatus;
  considerationInr: number;
  initiatedAt: string;
  completedAt?: string;
  signatures: string[];
}

export interface Dispute {
  id: string;
  propertyId: string;
  reason: string;
  raisedBy: string;
  status: DisputeStatus;
  createdDate: string;
}

export interface LedgerState {
  properties: Property[];
  transfers: Transfer[];
  disputes: Dispute[];
  events: LedgerEvent[];
  /** Address of the connected demo wallet (the "owner" persona). */
  account: string;
}

export const DEMO_ACCOUNT = "0xA11CE00000000000000000000000000000000001";
export const REGISTRAR_ACCOUNT = "0xREG15TRA400000000000000000000000000000AA";
const BOB = "0xB0B0000000000000000000000000000000000002";
const CAROL = "0xCA401000000000000000000000000000000000003";

const STORAGE_KEY = "landledger.state.v1";

const randHash = () =>
  "0x" +
  Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function seed(): LedgerState {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();

  const properties: Property[] = [
    {
      id: "PROP-0001",
      legalIdentifier: "UP/GZB/SEC-12/PLOT-118",
      location: "Sector 12, Ghaziabad, Uttar Pradesh",
      areaSqm: 240,
      currentOwner: DEMO_ACCOUNT,
      ownerName: "Gaurav Karakoti",
      status: "ACTIVE",
      registeredDate: iso(420),
      valuationInr: 8_400_000,
    },
    {
      id: "PROP-0002",
      legalIdentifier: "RJ/JPR/MALVIYA/PLOT-07",
      location: "Malviya Nagar, Jaipur, Rajasthan",
      areaSqm: 180,
      currentOwner: DEMO_ACCOUNT,
      ownerName: "Gaurav Karakoti",
      status: "PENDING_TRANSFER",
      registeredDate: iso(260),
      valuationInr: 6_150_000,
    },
    {
      id: "PROP-0003",
      legalIdentifier: "MH/PUN/HINJEWADI/PLOT-44",
      location: "Hinjewadi Phase 2, Pune, Maharashtra",
      areaSqm: 320,
      currentOwner: BOB,
      ownerName: "Bhumika Singh",
      status: "ACTIVE",
      registeredDate: iso(150),
      valuationInr: 11_900_000,
    },
    {
      id: "PROP-0004",
      legalIdentifier: "DL/DWK/SEC-19/PLOT-03",
      location: "Dwarka Sector 19, New Delhi",
      areaSqm: 150,
      currentOwner: CAROL,
      ownerName: "Nandini Mathur",
      status: "DISPUTED",
      registeredDate: iso(90),
      valuationInr: 9_250_000,
    },
  ];

  const transfers: Transfer[] = [
    {
      id: "TRF-0001",
      propertyId: "PROP-0002",
      fromAddress: DEMO_ACCOUNT,
      toAddress: BOB,
      status: "INITIATED",
      considerationInr: 6_000_000,
      initiatedAt: iso(3),
      signatures: [DEMO_ACCOUNT],
    },
    {
      id: "TRF-0002",
      propertyId: "PROP-0003",
      fromAddress: CAROL,
      toAddress: BOB,
      status: "COMPLETED",
      considerationInr: 11_000_000,
      initiatedAt: iso(160),
      completedAt: iso(150),
      signatures: [CAROL, BOB, REGISTRAR_ACCOUNT],
    },
  ];

  const disputes: Dispute[] = [
    {
      id: "DSP-0001",
      propertyId: "PROP-0004",
      reason: "Overlapping boundary claim filed by adjacent plot holder.",
      raisedBy: BOB,
      status: "OPEN",
      createdDate: iso(12),
    },
  ];

  const events: LedgerEvent[] = [
    ev("PROP-0001", "PropertyRegistered", REGISTRAR_ACCOUNT, "Registered to Gaurav Karakoti", iso(420), 102_311),
    ev("PROP-0002", "PropertyRegistered", REGISTRAR_ACCOUNT, "Registered to Gaurav Karakoti", iso(260), 141_880),
    ev("PROP-0003", "PropertyRegistered", REGISTRAR_ACCOUNT, "Registered to Nandini Mathur", iso(300), 128_004),
    ev("PROP-0003", "TransferInitiated", CAROL, "Transfer to Bhumika Singh initiated", iso(160), 186_442),
    ev("PROP-0003", "TransferCompleted", REGISTRAR_ACCOUNT, "Ownership moved to Bhumika Singh", iso(150), 188_970),
    ev("PROP-0004", "PropertyRegistered", REGISTRAR_ACCOUNT, "Registered to Nandini Mathur", iso(90), 210_551),
    ev("PROP-0002", "TransferInitiated", DEMO_ACCOUNT, "Transfer to Bhumika Singh initiated", iso(3), 244_019),
    ev("PROP-0004", "DisputeFlagged", BOB, "Overlapping boundary claim", iso(12), 240_777),
  ];

  return { properties, transfers, disputes, events, account: DEMO_ACCOUNT };
}

function ev(
  propertyId: string,
  type: LedgerEvent["type"],
  actor: string,
  detail: string,
  timestamp: string,
  blockNumber: number,
): LedgerEvent {
  return {
    id: `${propertyId}-${type}-${timestamp}`,
    propertyId,
    type,
    actor,
    detail,
    txHash: randHash(),
    blockNumber,
    timestamp,
  };
}

let state: LedgerState = seed();
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state = JSON.parse(raw) as LedgerState;
    } catch {
      persist();
    }
  } else {
    persist();
  }
  listeners.forEach((l) => l());
}

function setState(next: LedgerState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLedger(): LedgerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function resetLedger() {
  setState(seed());
}

const nextId = (prefix: string, count: number) =>
  `${prefix}-${String(count + 1).padStart(4, "0")}`;

/** Mirrors LandRegistry.registerProperty — registrar-only in the contract. */
export function registerProperty(input: {
  legalIdentifier: string;
  location: string;
  areaSqm: number;
  ownerAddress: string;
  ownerName: string;
  valuationInr: number;
}): Property {
  const id = nextId("PROP", state.properties.length);
  const property: Property = {
    id,
    legalIdentifier: input.legalIdentifier,
    location: input.location,
    areaSqm: input.areaSqm,
    currentOwner: input.ownerAddress,
    ownerName: input.ownerName,
    status: "ACTIVE",
    registeredDate: new Date().toISOString(),
    valuationInr: input.valuationInr,
  };
  setState({
    ...state,
    properties: [property, ...state.properties],
    events: [
      ev(id, "PropertyRegistered", REGISTRAR_ACCOUNT, `Registered to ${input.ownerName}`, property.registeredDate, latestBlock() + 1),
      ...state.events,
    ],
  });
  return property;
}

/** Mirrors LandRegistry.initiateTransfer — current owner only, blocked when disputed. */
export function initiateTransfer(input: {
  propertyId: string;
  toAddress: string;
  considerationInr: number;
}): { ok: boolean; error?: string; transfer?: Transfer } {
  const property = state.properties.find((p) => p.id === input.propertyId);
  if (!property) return { ok: false, error: "Property not found" };
  if (property.status === "DISPUTED") return { ok: false, error: "Property is under dispute" };
  if (property.status === "PENDING_TRANSFER")
    return { ok: false, error: "A transfer is already in progress" };
  if (property.currentOwner.toLowerCase() === input.toAddress.toLowerCase())
    return { ok: false, error: "New owner must differ from current owner" };

  const transfer: Transfer = {
    id: nextId("TRF", state.transfers.length),
    propertyId: property.id,
    fromAddress: property.currentOwner,
    toAddress: input.toAddress,
    status: "INITIATED",
    considerationInr: input.considerationInr,
    initiatedAt: new Date().toISOString(),
    signatures: [property.currentOwner],
  };

  setState({
    ...state,
    transfers: [transfer, ...state.transfers],
    properties: state.properties.map((p) =>
      p.id === property.id ? { ...p, status: "PENDING_TRANSFER" as const } : p,
    ),
    events: [
      ev(property.id, "TransferInitiated", property.currentOwner, `Transfer to ${shorten(input.toAddress)} initiated`, transfer.initiatedAt, latestBlock() + 1),
      ...state.events,
    ],
  });
  return { ok: true, transfer };
}

/** Mirrors LandRegistry.completeTransfer — needs buyer + registrar signatures. */
export function completeTransfer(transferId: string): { ok: boolean; error?: string } {
  const transfer = state.transfers.find((t) => t.id === transferId);
  if (!transfer) return { ok: false, error: "Transfer not found" };
  if (transfer.status !== "INITIATED") return { ok: false, error: "Transfer is not pending" };

  const completedAt = new Date().toISOString();
  const signatures = Array.from(new Set([...transfer.signatures, transfer.toAddress, REGISTRAR_ACCOUNT]));

  setState({
    ...state,
    transfers: state.transfers.map((t) =>
      t.id === transferId ? { ...t, status: "COMPLETED" as const, completedAt, signatures } : t,
    ),
    properties: state.properties.map((p) =>
      p.id === transfer.propertyId
        ? { ...p, currentOwner: transfer.toAddress, ownerName: "New owner", status: "ACTIVE" as const }
        : p,
    ),
    events: [
      ev(transfer.propertyId, "TransferCompleted", REGISTRAR_ACCOUNT, `Ownership moved to ${shorten(transfer.toAddress)}`, completedAt, latestBlock() + 1),
      ...state.events,
    ],
  });
  return { ok: true };
}

/** Mirrors LandRegistry.flagDispute — any verified citizen may flag. */
export function flagDispute(input: { propertyId: string; reason: string; raisedBy: string }) {
  const property = state.properties.find((p) => p.id === input.propertyId);
  if (!property) return { ok: false, error: "Property not found" };

  const dispute: Dispute = {
    id: nextId("DSP", state.disputes.length),
    propertyId: property.id,
    reason: input.reason,
    raisedBy: input.raisedBy,
    status: "OPEN",
    createdDate: new Date().toISOString(),
  };

  setState({
    ...state,
    disputes: [dispute, ...state.disputes],
    properties: state.properties.map((p) =>
      p.id === property.id ? { ...p, status: "DISPUTED" as const } : p,
    ),
    events: [
      ev(property.id, "DisputeFlagged", input.raisedBy, input.reason, dispute.createdDate, latestBlock() + 1),
      ...state.events,
    ],
  });
  return { ok: true, dispute };
}

/** Adjudicator-only in the contract. */
export function resolveDispute(disputeId: string) {
  const dispute = state.disputes.find((d) => d.id === disputeId);
  if (!dispute) return { ok: false, error: "Dispute not found" };
  const at = new Date().toISOString();
  setState({
    ...state,
    disputes: state.disputes.map((d) =>
      d.id === disputeId ? { ...d, status: "RESOLVED" as const } : d,
    ),
    properties: state.properties.map((p) =>
      p.id === dispute.propertyId ? { ...p, status: "ACTIVE" as const } : p,
    ),
    events: [
      ev(dispute.propertyId, "DisputeResolved", "adjudicator", "Dispute closed by adjudicator", at, latestBlock() + 1),
      ...state.events,
    ],
  });
  return { ok: true };
}

function latestBlock() {
  return state.events.reduce((max, e) => Math.max(max, e.blockNumber), 100_000);
}

export function shorten(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ownershipChain(s: LedgerState, propertyId: string) {
  return s.events
    .filter((e) => e.propertyId === propertyId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
