import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  completeTransfer,
  formatInr,
  initiateTransfer,
  shorten,
  useLedger,
} from "@/lib/landledger";

export const Route = createFileRoute("/transfer")({
  head: () => ({
    meta: [
      { title: "Initiate a transfer — LandLedger" },
      {
        name: "description",
        content: "Start an on-chain property transfer: pick a parcel, name the buyer and sign.",
      },
      { property: "og:title", content: "Initiate a transfer — LandLedger" },
      {
        property: "og:description",
        content: "Two-step transfer flow with owner, buyer and registrar signatures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransferPage,
});

function TransferPage() {
  const ledger = useLedger();
  const navigate = useNavigate();
  const transferable = ledger.properties.filter(
    (p) => p.currentOwner.toLowerCase() === DEMO_ACCOUNT.toLowerCase() && p.status === "ACTIVE",
  );

  const [propertyId, setPropertyId] = useState(transferable[0]?.id ?? "");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) return toast.error("Select a property first");
    if (!/^0x[0-9a-fA-F]{6,40}$/.test(toAddress.trim()))
      return toast.error("Enter a valid buyer wallet address (0x…)");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter the agreed sale amount");

    const res = initiateTransfer({
      propertyId,
      toAddress: toAddress.trim(),
      considerationInr: value,
    });
    if (!res.ok) return toast.error(res.error ?? "Transfer failed");
    toast.success("Transfer initiated — awaiting buyer and registrar signatures");
    setToAddress("");
    setAmount("");
    navigate({ to: "/property/$id", params: { id: propertyId } });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Transfer initiator</h1>
        <p className="text-sm text-muted-foreground">
          Step 1 locks the parcel and records your signature. Step 2 needs the buyer and the
          registrar before ownership moves.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New transfer</CardTitle>
          <CardDescription>Only active parcels you own can be transferred.</CardDescription>
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
                  {transferable.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} — {p.legalIdentifier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferable.length === 0 && (
                <p className="text-xs text-destructive">
                  No transferable parcel: all of yours are pending or disputed.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer">Buyer wallet address</Label>
              <Input
                id="buyer"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0xB0B0000000000000000000000000000000000002"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Agreed consideration (INR)</Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="6000000"
              />
            </div>

            <Button type="submit">Initiate transfer</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ledger.transfers.map((t) => (
            <div key={t.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm">
                  {t.id} · {t.propertyId}
                </p>
                <StatusBadge status={t.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {shorten(t.fromAddress)} → {shorten(t.toAddress)} ·{" "}
                {formatInr(t.considerationInr)}
              </p>
              {t.status === "INITIATED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    const res = completeTransfer(t.id);
                    if (res.ok) toast.success("Ownership transferred");
                    else toast.error(res.error ?? "Could not complete");
                  }}
                >
                  Complete transfer
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
