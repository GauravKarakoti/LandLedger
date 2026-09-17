import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Ruler, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { formatDate, formatInr, ownershipChain, useLedger } from "@/lib/landledger";

export const Route = createFileRoute("/property/$id")({
  head: () => ({
    meta: [
      { title: "Property record — LandLedger" },
      {
        name: "description",
        content: "Full parcel record with owner, valuation and the complete on-chain ownership chain.",
      },
      { property: "og:title", content: "Property record — LandLedger" },
      {
        property: "og:description",
        content: "Audit a parcel's registration, transfers and disputes event by event.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const ledger = useLedger();
  const property = ledger.properties.find((p) => p.id === id);

  if (!property) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Parcel {id} not found</h1>
        <Button asChild className="mt-6">
          <Link to="/verify">Back to search</Link>
        </Button>
      </div>
    );
  }

  const events = ownershipChain(ledger, property.id);
  const transfers = ledger.transfers.filter((t) => t.propertyId === property.id);
  const disputes = ledger.disputes.filter((d) => d.propertyId === property.id);

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
            <StatusBadge status={property.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 text-primary" /> {property.location}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Ruler className="size-4 text-primary" /> {property.areaSqm} sq.m ·{" "}
            {formatInr(property.valuationInr)}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="size-4 text-primary" />
            <span className="font-mono text-xs">{property.currentOwner}</span>
          </p>
          <p className="text-muted-foreground">
            Owner of record: {property.ownerName} · since {formatDate(property.registeredDate)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership history</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTimeline events={events} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfers &amp; disputes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{t.id}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {transfers.length === 0 && (
              <p className="text-muted-foreground">No transfers recorded.</p>
            )}
            <Separator />
            {disputes.map((d) => (
              <div key={d.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{d.id}</span>
                  <StatusBadge status={d.status} />
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
