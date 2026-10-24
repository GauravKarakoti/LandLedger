import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Ruler,
  Wallet,
  ArrowRightLeft,
  Loader2,
  ShieldCheck,
  History,
  FileCheck2,
  Gavel,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { isAddress } from "viem";
import { ethers } from "ethers";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { formatInr, shorten, formatDate } from "@/lib/landledger";
import { getWeb3Signer, getReadOnlyContract, getBaseScanTxUrl } from "@/lib/web3";

import { getPropertyData } from "@/server/functions";

export const Route = createFileRoute("/property/$id")({
  head: () => ({
    meta: [
      { title: "Property Record — LandLedger" },
      {
        name: "description",
        content:
          "Full parcel record with owner, valuation, multi-sig transfer controls, and the complete on-chain ownership chain.",
      },
    ],
  }),
  loader: async ({ params }) => {
    const data = await getPropertyData({ data: params.id });
    if (!data) throw new Error("Property not found");
    return data;
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Parcel not found</h1>
      <p className="mt-2 text-muted-foreground">{(error as Error).message}</p>
      <Button asChild className="mt-6">
        <Link to="/verify">Back to search</Link>
      </Button>
    </div>
  ),
  component: PropertyDetail,
});

interface OnChainOwnershipRecord {
  previousOwner: string;
  newOwner: string;
  timestamp: number;
  note: string;
}

function PropertyDetail() {
  const router = useRouter();
  const { property, events, transfers, disputes } = Route.useLoaderData();
  const { address, isConnected } = useAccount();

  const [recipient, setRecipient] = useState("");
  const [transferMode, setTransferMode] = useState<"direct" | "multisig">("direct");
  const [isBusy, setIsBusy] = useState(false);
  const [lastTxHash, setLastTxHash] = useState("");

  // On-Chain Provenance & Role state
  const [onChainHistory, setOnChainHistory] = useState<OnChainOwnershipRecord[]>([]);
  const [isAdjudicator, setIsAdjudicator] = useState(false);
  const [onChainVerified, setOnChainVerified] = useState<boolean | null>(null);

  const isOwner =
    Boolean(isConnected && address) &&
    address!.toLowerCase() === property.currentOwner.toLowerCase();

  // Extract optional documentHash from metadataUri JSON if present
  let parsedDocHash: string | null = null;
  try {
    if (property.metadataUri) {
      const meta = JSON.parse(property.metadataUri);
      if (meta.documentHash) parsedDocHash = meta.documentHash;
    }
  } catch {
    parsedDocHash = null;
  }

  const loadOnChainData = useCallback(async () => {
    try {
      const { contract } = getReadOnlyContract();
      const [chainProp, rawHistory] = await Promise.all([
        contract["properties"]!(property.id).catch(() => null),
        contract["getOwnershipHistory"]!(property.id).catch(() => []),
      ]);

      if (chainProp && chainProp.currentOwner !== ethers.ZeroAddress) {
        setOnChainVerified(
          chainProp.currentOwner.toLowerCase() === property.currentOwner.toLowerCase()
        );
      }

      setOnChainHistory(
        rawHistory.map((r: any) => ({
          previousOwner: r.previousOwner,
          newOwner: r.newOwner,
          timestamp: Number(r.timestamp),
          note: r.note,
        }))
      );

      if (address) {
        const [auth, adj] = await Promise.all([
          contract["registryAuthority"]!().catch(() => ""),
          contract["adjudicators"]!(address).catch(() => false),
        ]);
        setIsAdjudicator(Boolean(adj) || auth.toLowerCase() === address.toLowerCase());
      }
    } catch (err) {
      console.error("Failed to fetch on-chain provenance:", err);
    }
  }, [property.id, property.currentOwner, address]);

  useEffect(() => {
    loadOnChainData();
  }, [loadOnChainData]);

  async function handleTransfer() {
    const cleanRecipient = recipient.trim();
    if (!isAddress(cleanRecipient)) {
      toast.error("Please enter a valid EVM address (0x...)");
      return;
    }
    if (cleanRecipient.toLowerCase() === address?.toLowerCase()) {
      toast.error("Cannot transfer property to yourself");
      return;
    }

    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();

      if (transferMode === "direct") {
        toast.info("Confirm direct deed transfer in your wallet...");
        const tx = await contract["transferProperty"]!(property.id, cleanRecipient);
        setLastTxHash(tx.hash);
        toast.info("Mining transfer on Base Sepolia...");
        await tx.wait();
        toast.success("Deed transferred on-chain!");
      } else {
        toast.info("Confirm multi-sig transfer initiation in your wallet...");
        const tx = await contract["initiateTransfer"]!(property.id, cleanRecipient);
        setLastTxHash(tx.hash);
        toast.info("Mining multi-sig request on Base Sepolia...");
        await tx.wait();
        toast.success("Multi-sig transfer initiated! Buyer and Registrar can now approve on /transfers.");
      }

      setRecipient("");
      await loadOnChainData();
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || err.message?.split("\n")[0] || "Transfer failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInlineResolveDispute(disputeId: number, status: 1 | 2) {
    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();
      const label = status === 1 ? "Resolved" : "Dismissed";
      toast.info(`Submitting ${label} ruling for Dispute #${disputeId}...`);
      const tx = await contract["resolveDispute"]!(disputeId, status);
      await tx.wait();
      toast.success(`Dispute #${disputeId} ${label}!`);
      await loadOnChainData();
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Dispute resolution failed");
    } finally {
      setIsBusy(false);
    }
  }

  // Normalize events for <HistoryTimeline />
  const timelineEvents = events.map((e: any) => ({
    id: e.id,
    type: e.type,
    actor: e.actor || property.currentOwner,
    detail: e.detail ?? e.description ?? "",
    txHash: e.txHash ?? e.transactionHash ?? "",
    blockNumber: e.blockNumber ?? 0,
    timestamp: e.timestamp,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/verify"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to registry search
        </Link>

        {onChainVerified !== null && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              onChainVerified
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600"
            }`}
          >
            <ShieldCheck className="size-3.5" />
            {onChainVerified
              ? "Verified On-Chain State Match"
              : "Indexer Syncing with Base Sepolia"}
          </span>
        )}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{property.legalIdentifier}</CardTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Parcel ID: {property.id} · Title Holder: {property.ownerName}
              </p>
            </div>
            <StatusBadge status={property.status as any} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 text-primary shrink-0" /> {property.location}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Ruler className="size-4 text-primary shrink-0" /> {property.areaSqm} sq.m ·{" "}
            {formatInr(property.valuationInr)}
          </p>
          <div className="flex items-center justify-between col-span-full sm:col-span-2">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="size-4 text-primary shrink-0" />
              <span className="font-mono text-xs">{property.currentOwner}</span>
            </p>
          </div>

          {parsedDocHash && (
            <div className="col-span-full flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              <FileCheck2 className="size-4 text-emerald-600 shrink-0" />
              <span>Deed Keccak-256: {parsedDocHash}</span>
            </div>
          )}

          {/* Render Transfer Controls ONLY if connected wallet is the verified owner */}
          {isOwner && (
            <div className="col-span-full mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Owner Deed Transfer Controls
                </p>
                {property.status !== "Active" && (
                  <span className="text-xs text-destructive font-medium">
                    Transfers locked while parcel is {property.status}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={transferMode}
                  onValueChange={(v) => setTransferMode(v as "direct" | "multisig")}
                  disabled={isBusy || property.status !== "Active"}
                >
                  <SelectTrigger className="sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct Transfer</SelectItem>
                    <SelectItem value="multisig">Multi-Sig Escrow</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Buyer Wallet Address (0x...)"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="flex-1 font-mono text-xs"
                  disabled={isBusy || property.status !== "Active"}
                />

                <Button
                  onClick={handleTransfer}
                  disabled={isBusy || !recipient || property.status !== "Active"}
                  className="gap-2 whitespace-nowrap"
                >
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="size-4" />
                  )}
                  {isBusy
                    ? "Processing..."
                    : transferMode === "direct"
                      ? "Transfer Deed"
                      : "Initiate Multi-Sig"}
                </Button>
              </div>

              {lastTxHash && (
                <p className="text-xs text-emerald-600 font-medium flex items-center gap-2">
                  <span>Transaction confirmed!</span>
                  <a
                    href={getBaseScanTxUrl(lastTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-1 font-mono"
                  >
                    {shorten(lastTxHash)} <ExternalLink className="size-3" />
                  </a>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {onChainHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" /> On-Chain Provenance Chain (Base Sepolia)
            </CardTitle>
            <CardDescription>
              Directly queried from smart contract{" "}
              <code className="font-mono text-xs">getOwnershipHistory("{property.id}")</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {onChainHistory.map((rec, idx) => (
              <div
                key={`${rec.timestamp}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3.5 py-2.5 text-xs"
              >
                <span className="font-semibold">
                  #{idx + 1} · {rec.note}
                </span>
                <span className="font-mono text-muted-foreground">
                  {rec.previousOwner === ethers.ZeroAddress
                    ? "GENESIS MINT"
                    : shorten(rec.previousOwner)}{" "}
                  → <strong className="text-foreground">{shorten(rec.newOwner)}</strong>
                </span>
                <span className="text-muted-foreground">
                  {new Date(rec.timestamp * 1000).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indexed Event Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTimeline events={timelineEvents as any} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfers &amp; Disputes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transfers ({transfers.length})
              </p>
              {transfers.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
                >
                  <div className="space-y-0.5">
                    <p className="font-mono text-xs">
                      {shorten(t.previousOwner)} → {shorten(t.newOwner)}
                    </p>
                    {t.transactionHash && (
                      <a
                        href={getBaseScanTxUrl(t.transactionHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                      >
                        tx {shorten(t.transactionHash)} <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                  <StatusBadge status={t.status as any} />
                </div>
              ))}
              {transfers.length === 0 && (
                <p className="text-xs text-muted-foreground">No transfers recorded.</p>
              )}
            </div>

            <Separator />

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Disputes ({disputes.length})
                </p>
                {isAdjudicator && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <Gavel className="size-3" /> Adjudicator Mode
                  </span>
                )}
              </div>

              {disputes.map((d: any) => (
                <div key={d.id} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold">
                      Dispute #{d.id} · by {shorten(d.claimant)}
                    </span>
                    <StatusBadge status={d.status as any} />
                  </div>
                  <p className="text-xs text-muted-foreground">{d.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Filed {formatDate(d.createdAt)}
                  </p>

                  {d.status === "Pending" && isAdjudicator && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleInlineResolveDispute(Number(d.id), 1)}
                        disabled={isBusy}
                      >
                        <CheckCircle2 className="mr-1 size-3" /> Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleInlineResolveDispute(Number(d.id), 2)}
                        disabled={isBusy}
                      >
                        <XCircle className="mr-1 size-3" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {disputes.length === 0 && (
                <p className="text-xs text-muted-foreground">No disputes on file.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}