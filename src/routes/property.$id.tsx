import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Ruler, Wallet, ArrowRightLeft, Loader2 } from "lucide-react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { LANDLEDGER_ABI, LANDLEDGER_CONTRACT } from "@/lib/web3";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { formatInr } from "@/lib/landledger";

import { getPropertyData } from "@/server/functions";

export const Route = createFileRoute("/property/$id")({
  head: () => ({
    meta: [
      { title: "Property record — LandLedger" },
      { name: "description", content: "Full parcel record with owner, valuation and the complete on-chain ownership chain." },
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
      <p className="text-muted-foreground mt-2">{(error as Error).message}</p>
      <Button asChild className="mt-6">
        <Link to="/verify">Back to search</Link>
      </Button>
    </div>
  ),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { property, events, transfers, disputes } = Route.useLoaderData();
  const [recipient, setRecipient] = useState("");

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleTransfer = () => {
    if (!recipient.startsWith("0x") || recipient.length !== 42) {
      alert("Please enter a valid EVM address");
      return;
    }
    writeContract({
      address: LANDLEDGER_CONTRACT,
      abi: LANDLEDGER_ABI,
      functionName: "transferProperty",
      args: [property.id, recipient as `0x${string}`],
    });
  };

  const timelineEvents = events.map((e: any) => ({
    id: e.id,
    type: e.type,
    actor: property.currentOwner,
    detail: e.description,
    txHash: e.transactionHash || "",
    blockNumber: 0,
    timestamp: e.timestamp,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <Link to="/verify" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to registry search
      </Link>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{property.legalIdentifier}</CardTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{property.id}</p>
            </div>
            <StatusBadge status={property.status as any} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 text-primary" /> {property.location}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Ruler className="size-4 text-primary" /> {property.areaSqm} sq.m · {formatInr(property.valuationInr)}
          </p>
          <div className="flex items-center justify-between col-span-full sm:col-span-1">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="size-4 text-primary" />
              <span className="font-mono text-xs">{property.currentOwner}</span>
            </p>
          </div>
          <div className="col-span-full flex flex-col sm:flex-row items-center gap-4 mt-4 p-4 border rounded-lg bg-muted/30">
            <Input 
              placeholder="Recipient Address (0x...)" 
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Button 
              onClick={handleTransfer} 
              disabled={isPending || isConfirming || !recipient}
              className="gap-2 whitespace-nowrap"
            >
              {isPending || isConfirming ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
              {isPending ? "Confirming in Wallet..." : isConfirming ? "Mining..." : "Transfer Deed"}
            </Button>
          </div>
          {isSuccess && (
            <p className="text-sm text-green-600 col-span-full font-medium">
              Transfer successful! Tx: {hash?.slice(0, 10)}... Indexer will update shortly.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership history</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTimeline events={timelineEvents as any} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfers &amp; disputes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {transfers.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{t.id}</span>
                <StatusBadge status={t.status as any} />
              </div>
            ))}
            {transfers.length === 0 && <p className="text-muted-foreground">No transfers recorded.</p>}
            <Separator />
            {disputes.map((d: any) => (
              <div key={d.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{d.id}</span>
                  <StatusBadge status={d.status as any} />
                </div>
                <p className="text-muted-foreground">{d.reason}</p>
              </div>
            ))}
            {disputes.length === 0 && <p className="text-muted-foreground">No disputes on file.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}