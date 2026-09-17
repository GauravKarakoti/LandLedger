import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightLeft, Blocks, FileCheck2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyCard } from "@/components/landledger/PropertyCard";
import { HistoryTimeline } from "@/components/landledger/HistoryTimeline";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import {
  DEMO_ACCOUNT,
  completeTransfer,
  formatInr,
  shorten,
  useLedger,
} from "@/lib/landledger";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LandLedger — Blockchain Land Registry Dashboard" },
      {
        name: "description",
        content:
          "Tamper-evident land records: register property, initiate transfers and audit ownership history on-chain.",
      },
      { property: "og:title", content: "LandLedger — Blockchain Land Registry" },
      {
        property: "og:description",
        content: "MVP dashboard for on-chain property registration, transfer and dispute tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const ledger = useLedger();
  const owned = ledger.properties.filter(
    (p) => p.currentOwner.toLowerCase() === DEMO_ACCOUNT.toLowerCase(),
  );
  const pending = ledger.transfers.filter((t) => t.status === "INITIATED");
  const openDisputes = ledger.disputes.filter((d) => d.status === "OPEN");

  const stats = [
    { label: "Properties owned", value: owned.length, icon: FileCheck2 },
    { label: "Pending transfers", value: pending.length, icon: ArrowRightLeft },
    { label: "Open disputes", value: openDisputes.length, icon: ShieldAlert },
    { label: "Ledger events", value: ledger.events.length, icon: Blocks },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <section className="overflow-hidden rounded-xl p-8 text-primary-foreground shadow-[var(--shadow-ledger)]" style={{ background: "var(--gradient-hero)" }}>
        <p className="text-xs uppercase tracking-[0.2em] opacity-80">Micro Project · First Review</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          LandLedger — blockchain land registry
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-90">
          Every registration, transfer and dispute is written as an immutable event on the
          LandRegistry smart contract, mirrored into PostgreSQL for fast public search.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link to="/transfer">Initiate a transfer</Link>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {owned.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
          {owned.length === 0 && (
            <p className="text-sm text-muted-foreground">No properties under this wallet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfers awaiting completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pending.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            )}
            {pending.map((t) => (
              <div key={t.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm">{t.id}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.propertyId} · {shorten(t.fromAddress)} → {shorten(t.toAddress)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Consideration {formatInr(t.considerationInr)} · {t.signatures.length}/3 signatures
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    const res = completeTransfer(t.id);
                    if (res.ok) toast.success("Transfer completed and recorded on-chain");
                    else toast.error(res.error ?? "Could not complete transfer");
                  }}
                >
                  Countersign &amp; complete
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
            <HistoryTimeline events={ledger.events.slice(0, 5)} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
