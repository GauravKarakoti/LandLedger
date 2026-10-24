import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { Loader2, Gavel, CheckCircle2, XCircle, FileCheck2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { formatDate, shorten } from "@/lib/landledger";
import { getWeb3Signer, getReadOnlyContract, hashDocumentFile } from "@/lib/web3";

import { getDisputesData } from "@/server/functions";

export const Route = createFileRoute("/disputes")({
  head: () => ({
    meta: [
      { title: "Disputes & Adjudication — LandLedger" },
      { name: "description", content: "Flag a contested parcel and track or adjudicate dispute status." },
    ],
  }),
  loader: async () => await getDisputesData(),
  component: DisputesPage,
});

function DisputesPage() {
  const router = useRouter();
  const { disputes, properties } = Route.useLoaderData();
  const { address, isConnected } = useAccount();

  const [propertyId, setPropertyId] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceHash, setEvidenceHash] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [isAdjudicator, setIsAdjudicator] = useState(false);

  const checkAdjudicatorRole = useCallback(async () => {
    if (!address) {
      setIsAdjudicator(false);
      return;
    }
    try {
      const { contract } = getReadOnlyContract();
      const [authority, adjFlag] = await Promise.all([
        contract["registryAuthority"]!().catch(() => ""),
        contract["adjudicators"]!(address).catch(() => false),
      ]);
      setIsAdjudicator(
        Boolean(adjFlag) || authority.toLowerCase() === address.toLowerCase()
      );
    } catch {
      setIsAdjudicator(false);
    }
  }, [address]);

  useEffect(() => {
    checkAdjudicatorRole();
  }, [checkAdjudicatorRole]);

  async function handleEvidenceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const hash = await hashDocumentFile(file);
      setEvidenceHash(hash);
      toast.success(`Evidence hashed: ${hash.slice(0, 12)}...`);
    } catch {
      toast.error("Could not hash evidence file");
    }
  }

  async function submitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) return toast.error("Connect your wallet first");
    if (!propertyId) return toast.error("Select the property in question");
    if (reason.trim().length < 15) return toast.error("Describe the claim in at least 15 characters");

    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();
      const fullReason = evidenceHash
        ? `${reason.trim()} [EvidenceHash: ${evidenceHash.slice(0, 18)}...]`
        : reason.trim();

      toast.info("Confirm dispute filing in your wallet...");
      const tx = await contract["raiseDispute"]!(propertyId, fullReason);
      toast.info("Mining dispute transaction on Base Sepolia...");
      await tx.wait();

      toast.success("Dispute flagged on-chain. Property transfers are now frozen.");
      setReason("");
      setPropertyId("");
      setEvidenceHash("");
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || err.message?.split("\n")[0] || "Failed to flag dispute");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResolveDispute(disputeId: number, resolutionCode: 1 | 2) {
    if (!isConnected) return toast.error("Connect adjudicator wallet first");
    setResolvingId(disputeId);
    try {
      const { contract } = await getWeb3Signer();
      const label = resolutionCode === 1 ? "Resolved (Upheld)" : "Dismissed";
      toast.info(`Submitting ${label} ruling for Dispute #${disputeId}...`);

      const tx = await contract["resolveDispute"]!(disputeId, resolutionCode);
      await tx.wait();

      toast.success(`Dispute #${disputeId} marked as ${label}. Parcel unlocked if no other claims remain.`);
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Only an authorized Adjudicator can resolve disputes");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dispute Flagging & Adjudication</h1>
          <p className="text-sm text-muted-foreground">
            Flagging writes a <code className="font-mono text-xs">DisputeRaised</code> event on-chain and freezes all transfers until an adjudicator resolves it.
          </p>
        </div>

        {isAdjudicator && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Gavel className="size-4" /> Adjudicator Controls Enabled
          </div>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raise a Claim</CardTitle>
          <CardDescription>
            {isConnected ? `Filing as ${shorten(address)}` : "Connect wallet to file a claim."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitDispute} className="space-y-5">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select
                value={propertyId}
                onValueChange={setPropertyId}
                disabled={isBusy || !isConnected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} — {p.legalIdentifier} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Dispute</Label>
              <Textarea
                id="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isBusy || !isConnected}
                placeholder="e.g. Boundary overlaps with survey number 118/2 as per the 2019 revenue map."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="evidence">Supporting Affidavit / Survey Map (Optional Hash Attachment)</Label>
              <Input
                id="evidence"
                type="file"
                accept=".pdf,.png,.jpg"
                onChange={handleEvidenceFile}
                disabled={isBusy || !isConnected}
              />
              {evidenceHash && (
                <p className="flex items-center gap-1.5 font-mono text-xs text-emerald-600">
                  <FileCheck2 className="size-3.5" /> Evidence Keccak-256: {evidenceHash}
                </p>
              )}
            </div>

            <Button type="submit" variant="destructive" disabled={isBusy || !isConnected}>
              {isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isBusy ? "Submitting to Base Sepolia..." : "Flag Dispute On-Chain"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispute Register</CardTitle>
          <CardDescription>
            All historical and active claims. Authorized adjudicators can resolve or dismiss pending claims below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {disputes.length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes on record.</p>
          )}
          {disputes.map((d: any) => {
            const isPendingDispute = d.status === "Pending";
            const isCurrentResolving = resolvingId === Number(d.id);

            return (
              <div key={d.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold">
                    Dispute #{d.id} · {d.propertyId}
                  </p>
                  <StatusBadge status={d.status as any} />
                </div>

                <p className="text-sm">{d.reason}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Raised by {shorten(d.claimant)} on {formatDate(d.createdAt)}
                  </p>

                  {isPendingDispute && isAdjudicator && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleResolveDispute(Number(d.id), 1)}
                        disabled={isCurrentResolving}
                      >
                        {isCurrentResolving ? (
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 size-3.5" />
                        )}
                        Resolve (Uphold)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolveDispute(Number(d.id), 2)}
                        disabled={isCurrentResolving}
                      >
                        <XCircle className="mr-1.5 size-3.5" /> Dismiss Claim
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}