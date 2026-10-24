import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Blocks,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyCard } from "@/components/landledger/PropertyCard";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { shorten, formatDate } from "@/lib/landledger";
import { getReadOnlyContract, getBaseScanTxUrl, LANDLEDGER_CONTRACT } from "@/lib/web3";

import { getDashboardData, getUserProperties } from "@/server/functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LandLedger — Blockchain Land Registry Dashboard" },
      {
        name: "description",
        content:
          "Tamper-evident land records: register property, initiate multi-sig transfers, and audit ownership history on-chain.",
      },
    ],
  }),
  loader: async () => {
    return await getDashboardData();
  },
  component: Dashboard,
});

function Dashboard() {
  const { address, isConnected } = useAccount();
  const { recentEvents, openDisputes, recentTransfers, propertiesCount } = Route.useLoaderData();

  const [ownedProperties, setOwnedProperties] = useState<any[]>([]);
  const [isLoadingOwned, setIsLoadingOwned] = useState(false);

  // Live on-chain telemetry state
  const [chainTelemetry, setChainTelemetry] = useState<{
    authority: string;
    paused: boolean;
    pendingMultiSigCount: number;
  }>({
    authority: "",
    paused: false,
    pendingMultiSigCount: 0,
  });

  useEffect(() => {
    if (isConnected && address) {
      setIsLoadingOwned(true);
      getUserProperties({ data: address })
        .then((res: any) => setOwnedProperties(res))
        .finally(() => setIsLoadingOwned(false));
    } else {
      setOwnedProperties([]);
    }
  }, [address, isConnected]);

  useEffect(() => {
    async function fetchTelemetry() {
      try {
        const { contract } = getReadOnlyContract();
        const [authority, paused] = await Promise.all([
          contract["registryAuthority"]!().catch(() => ""),
          contract["paused"]!().catch(() => false),
        ]);

        let pendingCount = 0;
        for (let i = 1; i <= 10; i++) {
          try {
            const req = await contract["transferRequests"]!(i);
            if (Number(req.id) === 0) break;
            if (!req.executed) pendingCount++;
          } catch {
            break;
          }
        }

        setChainTelemetry({
          authority,
          paused: Boolean(paused),
          pendingMultiSigCount: pendingCount,
        });
      } catch (err) {
        console.error("Telemetry read failed:", err);
      }
    }
    fetchTelemetry();
  }, []);

  // Normalize events whether getDashboardData returns raw DB rows or mapped LedgerEvent objects
  const timelineEvents = recentEvents.map((e: any) => ({
    id: e.id,
    type: e.type,
    actor: e.actor || "System",
    detail: e.detail ?? e.description ?? "",
    txHash: e.txHash ?? e.transactionHash ?? "",
    blockNumber: e.blockNumber ?? 0,
    timestamp: e.timestamp,
  }));

  const stats = [
    { label: "Total registered properties", value: propertiesCount, icon: FileCheck2 },
    { label: "Completed transfers", value: recentTransfers.length, icon: ArrowRightLeft },
    { label: "Open disputes", value: openDisputes.length, icon: ShieldAlert },
    {
      label: "Pending multi-sig escrows",
      value: chainTelemetry.pendingMultiSigCount,
      icon: Clock,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <section
        className="overflow-hidden rounded-xl p-8 text-primary-foreground shadow-[var(--shadow-ledger)]"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 font-mono text-xs">
            <ShieldCheck className="size-3.5" /> Base Sepolia · {shorten(LANDLEDGER_CONTRACT)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs">
            Contract Status:{" "}
            <strong>{chainTelemetry.paused ? "PAUSED (Emergency)" : "OPERATIONAL"}</strong>
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          LandLedger — Blockchain Land Registry
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-90">
          Every registration, multi-signature transfer, and dispute adjudication is written as an
          immutable event on Base Sepolia and mirrored into PostgreSQL for instant public verification.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link to="/transfers">Transfer Deed</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link to="/verify">Verify a Property</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link to="/register">
              <PlusCircle className="mr-1.5 size-4" /> Registrar Portal
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">My Properties</h2>
          {isConnected && (
            <span className="font-mono text-xs text-muted-foreground">
              Wallet: {shorten(address)}
            </span>
          )}
        </div>

        {!isConnected ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Connect your wallet to view properties registered to you.
          </div>
        ) : isLoadingOwned ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground animate-pulse">
            Loading your property deeds...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ownedProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
            {ownedProperties.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No properties found under wallet address {shorten(address)}.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Global Transfers</CardTitle>
            <CardDescription>Verified title changes across the registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentTransfers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No recent transfers recorded in the indexer.
              </p>
            )}
            {recentTransfers.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-medium">{t.propertyId}</p>
                  <StatusBadge status={(t.status || "COMPLETED") as any} />
                </div>
                <div className="mt-3 flex items-center gap-2 font-mono text-sm text-muted-foreground">
                  <span>{shorten(t.previousOwner || "")}</span>
                  <span className="text-foreground">→</span>
                  <span>{shorten(t.newOwner || "")}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tx: {shorten(t.transactionHash)}</span>
                  {t.transactionHash && t.transactionHash.length === 66 && (
                    <a
                      href={getBaseScanTxUrl(t.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      BaseScan <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link to="/property/$id" params={{ id: t.propertyId }}>
                    View Property
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Disputes Watch</CardTitle>
            <CardDescription>Parcels frozen pending adjudicator ruling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {openDisputes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Zero open disputes. All active titles are clear.
              </p>
            )}
            {openDisputes.map((d: any) => (
              <div key={d.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    #{d.id} · {d.propertyId}
                  </span>
                  <StatusBadge status={d.status as any} />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{d.reason}</p>
                <p className="text-[11px] text-muted-foreground">
                  Claimant: {shorten(d.claimant)} · {formatDate(d.createdAt)}
                </p>
                <Button asChild variant="secondary" size="sm" className="w-full mt-1">
                  <Link to="/disputes">Review & Adjudicate</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Blocks className="size-4 text-primary" /> Recent Ledger Activity
            </CardTitle>
            <CardDescription>Real-time event stream from Base Sepolia.</CardDescription>
          </CardHeader>
          <CardContent>
            {timelineEvents.length > 0 ? (
              <HistoryTimeline events={timelineEvents as any} />
            ) : (
              <p className="text-sm text-muted-foreground">No ledger events recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}