import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import {
  DEMO_ACCOUNT,
  flagDispute,
  formatDate,
  resolveDispute,
  shorten,
  useLedger,
} from "@/lib/landledger";

export const Route = createFileRoute("/disputes")({
  head: () => ({
    meta: [
      { title: "Disputes — LandLedger" },
      {
        name: "description",
        content: "Flag a contested parcel and track adjudication status on the land ledger.",
      },
      { property: "og:title", content: "Disputes — LandLedger" },
      {
        property: "og:description",
        content: "Freeze transfers on contested parcels until an adjudicator closes the case.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DisputesPage,
});

function DisputesPage() {
  const ledger = useLedger();
  const [propertyId, setPropertyId] = useState("");
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) return toast.error("Select the parcel in question");
    if (reason.trim().length < 15)
      return toast.error("Describe the claim in at least 15 characters");
    const res = flagDispute({ propertyId, reason: reason.trim(), raisedBy: DEMO_ACCOUNT });
    if (!res.ok) return toast.error(res.error ?? "Could not flag dispute");
    toast.success("Dispute flagged — transfers on this parcel are frozen");
    setReason("");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dispute flagging</h1>
        <p className="text-sm text-muted-foreground">
          Flagging writes a DisputeFlagged event on-chain and blocks any transfer until an
          adjudicator resolves it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raise a claim</CardTitle>
          <CardDescription>Filed as {shorten(DEMO_ACCOUNT)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {ledger.properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} — {p.legalIdentifier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for dispute</Label>
              <Textarea
                id="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Boundary overlaps with survey number 118/2 as per the 2019 revenue map."
              />
            </div>
            <Button type="submit" variant="destructive">
              Flag dispute
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispute register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ledger.disputes.length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes on record.</p>
          )}
          {ledger.disputes.map((d) => (
            <div key={d.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm">
                  {d.id} · {d.propertyId}
                </p>
                <StatusBadge status={d.status} />
              </div>
              <p className="mt-2 text-sm">{d.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Raised by {shorten(d.raisedBy)} on {formatDate(d.createdDate)}
              </p>
              {d.status === "OPEN" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    resolveDispute(d.id);
                    toast.success("Dispute resolved by adjudicator");
                  }}
                >
                  Resolve as adjudicator
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
