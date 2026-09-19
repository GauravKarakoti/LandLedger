import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightLeft, Blocks, FileCheck2, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyCard } from "@/components/landledger/PropertyCard";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { shorten } from "@/lib/landledger";

import { getDashboardData, getUserProperties } from "@/server/functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LandLedger - Blockchain Land Registry Dashboard" },
      {
        name: "description",
        content:
          "Tamper-evident land records: register property, initiate transfers and audit ownership history on-chain.",
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

  const timelineEvents = recentEvents.map((e: any) => ({
    id: e.id,
    type: e.type,
    actor: "System",
    detail: e.description,
    txHash: e.transactionHash || "",
    blockNumber: 0,
    timestamp: e.timestamp,
  }));

  const stats = [
    { label: "Total registered properties", value: propertiesCount, icon: FileCheck2 },
    { label: "Recent transfers", value: recentTransfers.length, icon: ArrowRightLeft },
    { label: "Open disputes", value: openDisputes.length, icon: ShieldAlert },
    { label: "Ledger events", value: recentEvents.length, icon: Blocks },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <section className="overflow-hidden rounded-xl p-8 text-primary-foreground shadow-[var(--shadow-ledger)]" style={{ background: "var(--gradient-hero)" }}>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          LandLedger - blockchain land registry
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-90">
          Every registration, transfer and dispute is written as an immutable event on the
          Base Sepolia smart contract, mirrored into PostgreSQL for fast public search.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link to="/transfers">Transfer Deed</Link>
          </Button>
          <Button asChild variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
            <Link to="/verify">Verify a property</Link>
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
        <h2 className="text-xl font-semibold tracking-tight">My properties</h2>
        
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

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Global Transfers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentTransfers.length === 0 && (
              <p className="text-sm text-muted-foreground">No recent transfers recorded in the indexer.</p>
            )}
            {recentTransfers.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm">{t.propertyId}</p>
                  <StatusBadge status={t.status as any} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground font-mono">
                  <span>{shorten(t.previousOwner)}</span>
                  <span className="text-foreground">→</span>
                  <span>{shorten(t.newOwner)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tx: {shorten(t.transactionHash)}
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                >
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
            <CardTitle className="text-base">Recent ledger activity</CardTitle>
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