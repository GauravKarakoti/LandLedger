import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { formatDate, shorten } from "@/lib/landledger";
import { LANDLEDGER_ABI, LANDLEDGER_CONTRACT } from "@/lib/web3";

import { getDisputesData } from "@/server/functions";

export const Route = createFileRoute("/disputes")({
  head: () => ({
    meta: [
      { title: "Disputes — LandLedger" },
      { name: "description", content: "Flag a contested parcel and track adjudication status." },
    ],
  }),
  loader: async () => await getDisputesData(),
  component: DisputesPage,
});

function DisputesPage() {
  const { disputes, properties } = Route.useLoaderData();
  const { address, isConnected } = useAccount();
  const [propertyId, setPropertyId] = useState("");
  const [reason, setReason] = useState("");

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) return toast.error("Connect your wallet first");
    if (!propertyId) return toast.error("Select the property in question");
    if (reason.trim().length < 15) return toast.error("Describe the claim in at least 15 characters");

    writeContract(
      {
        address: LANDLEDGER_CONTRACT,
        abi: LANDLEDGER_ABI,
        functionName: "raiseDispute", // 👈 Changed from "flagDispute"
        args: [propertyId, reason.trim()],
      },
      {
        onError: (err) => toast.error(err.message.split("\n")[0] || "Failed to flag dispute"),
      }
    );
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("Dispute flagged on-chain. Transfers are frozen.");
      setReason("");
      setPropertyId("");
    }
  }, [isSuccess]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dispute flagging</h1>
        <p className="text-sm text-muted-foreground">
          Flagging writes a DisputeFlagged event on-chain and blocks any transfer until an adjudicator resolves it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raise a claim</CardTitle>
          <CardDescription>
            {isConnected ? `Filing as ${shorten(address)}` : "Connect wallet to file a claim."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={propertyId} onValueChange={setPropertyId} disabled={isPending || isConfirming || !isConnected}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p: any) => (
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
                disabled={isPending || isConfirming || !isConnected}
                placeholder="e.g. Boundary overlaps with survey number 118/2 as per the 2019 revenue map."
              />
            </div>
            <Button type="submit" variant="destructive" disabled={isPending || isConfirming || !isConnected}>
              {isPending || isConfirming ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isPending ? "Confirming in Wallet..." : isConfirming ? "Mining..." : "Flag dispute on-chain"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispute register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {disputes.length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes on record.</p>
          )}
          {disputes.map((d: any) => (
            <div key={d.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm">
                  {d.id} · {d.propertyId}
                </p>
                <StatusBadge status={d.status as any} />
              </div>
              <p className="mt-2 text-sm">{d.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Raised by {shorten(d.claimant)} on {formatDate(d.createdAt)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}