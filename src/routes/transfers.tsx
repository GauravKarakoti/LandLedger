import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { shorten } from "@/lib/landledger";
import { LANDLEDGER_ABI, LANDLEDGER_CONTRACT } from "@/lib/web3";

import { getRecentTransfers, getUserProperties } from "@/server/functions";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Transfer Property Deed - LandLedger" },
      { name: "description", content: "Execute an immutable on-chain property transfer." },
    ],
  }),
  loader: async () => {
    const recentTransfers = await getRecentTransfers();
    return { recentTransfers };
  },
  component: TransferPage,
});

function TransferPage() {
  const navigate = useNavigate();
  const { recentTransfers } = Route.useLoaderData();
  const { isConnected, address } = useAccount();

  const [ownedProperties, setOwnedProperties] = useState<any[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [toAddress, setToAddress] = useState("");

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (address) {
      getUserProperties({ data: address }).then((res: any) => {
        setOwnedProperties(res);
        if (res.length > 0) setPropertyId(res[0].id);
      });
    } else {
      setOwnedProperties([]);
      setPropertyId("");
    }
  }, [address]);

  const transferable = ownedProperties.filter((p) => p.status === "Active");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) return toast.error("Connect your wallet first");
    if (!propertyId) return toast.error("Select a property first");
    if (!isAddress(toAddress.trim())) return toast.error("Enter a valid EVM buyer wallet address (0x…)");
    if (toAddress.trim().toLowerCase() === address?.toLowerCase()) return toast.error("Cannot transfer to yourself");

    writeContract(
      {
        address: LANDLEDGER_CONTRACT,
        abi: LANDLEDGER_ABI,
        functionName: "transferProperty",
        args: [propertyId, toAddress.trim() as `0x${string}`],
      },
      {
        onError: (err) => toast.error(err.message.split("\n")[0] || "Transfer failed"),
      }
    );
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("Transfer confirmed on-chain");
      setToAddress("");
      navigate({ to: "/property/$id", params: { id: propertyId } });
    }
  }, [isSuccess, navigate, propertyId]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Transfer Deed</h1>
        <p className="text-sm text-muted-foreground">
          Execute an on-chain transfer of ownership. This requires a signature from the currently registered wallet address.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New transfer</CardTitle>
          <CardDescription>Only active parcels owned by your connected wallet can be transferred.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Please connect your wallet using the button in the top right to view and transfer your properties.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={propertyId} onValueChange={setPropertyId} disabled={isPending || isMining}>
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
                {ownedProperties.length > 0 && transferable.length === 0 && (
                  <p className="text-xs text-destructive">
                    Your properties cannot be transferred currently (they may be in dispute).
                  </p>
                )}
                {ownedProperties.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No properties found registered to {shorten(address || "")}.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyer">Buyer wallet address</Label>
                <Input
                  id="buyer"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono"
                  disabled={isPending || isMining}
                />
              </div>

              <Button type="submit" disabled={isPending || isMining || transferable.length === 0}>
                {isPending || isMining ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {isPending ? "Confirming in wallet..." : isMining ? "Mining block..." : "Sign & Transfer"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent global transfers</CardTitle>
          <CardDescription>A live feed of the latest on-chain property exchanges.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentTransfers.map((t: any) => (
            <div key={t.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-medium">{t.propertyId}</p>
                <StatusBadge status="COMPLETED" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground font-mono">
                <span>{shorten(t.previousOwner)}</span>
                <span className="text-foreground">→</span>
                <span>{shorten(t.newOwner)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Tx: {shorten(t.transactionHash)}</p>
            </div>
          ))}
          {recentTransfers.length === 0 && (
            <p className="text-sm text-muted-foreground">No recent transfers found in the indexer.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}