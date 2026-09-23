import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shorten } from "@/lib/landledger";
import { LANDLEDGER_ABI, LANDLEDGER_CONTRACT } from "@/lib/web3";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Admin: Register Property — LandLedger" }],
  }),
  component: RegisterPropertyPage,
});

function RegisterPropertyPage() {
  const { address, isConnected } = useAccount();
  const [formData, setFormData] = useState({
    legalIdentifier: "",
    location: "",
    areaSqm: "",
    valuationInr: "",
    ownerAddress: "",
  });

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!isConnected) return toast.error("Connect your wallet (must be Registrar)");
    if (!isAddress(formData.ownerAddress.trim())) return toast.error("Invalid owner wallet address");

    try {
      // 1. Generate a unique property ID (e.g. PROP-8f3a)
      const propertyId = `PROP-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

      // 2. Package the physical details into the metadata URI field
      // In production, this would be uploaded to IPFS and the CID would be passed here.
      const metadata = JSON.stringify({
        location: formData.location,
        areaSqm: Number(formData.areaSqm),
        valuationInr: Number(formData.valuationInr)
      });

      // 3. Align EXACTLY with the Solidity function signature:
      // registerProperty(string propertyId, address owner, string legalIdentifier, string metadataUri)
      const args = [
        propertyId,
        formData.ownerAddress.trim() as `0x${string}`,
        formData.legalIdentifier,
        metadata
      ];

      console.log("Initiating transaction with args:", args);

      writeContract(
        {
          address: LANDLEDGER_CONTRACT,
          abi: LANDLEDGER_ABI,
          functionName: "registerProperty",
          args: args,
        },
        {
          onSuccess: (txHash) => {
            console.log("Transaction sent to wallet. Hash:", txHash);
            toast.info("Check your wallet to confirm the transaction...");
          },
          onError: (err) => {
            console.error("Contract Error:", err);
            const shortMessage = err.message.split("\n")[0];
            toast.error(shortMessage || "Transaction failed");
          },
        }
      );
    } catch (err: any) {
      console.error("Data Parsing Error:", err);
      toast.error(`Input error: ${err.message}`);
    }
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("Property minted on-chain!");
      setFormData({
        legalIdentifier: "",
        location: "",
        areaSqm: "",
        valuationInr: "",
        ownerAddress: "",
      });
    }
  }, [isSuccess]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Registrar Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Restricted access. Only the wallet holding the REGISTRAR role on the smart contract can successfully execute this transaction.
        </p>
      </header>

      <Card className="border-primary/20 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Register New Parcel</CardTitle>
          <CardDescription>
            {isConnected ? `Connected as: ${shorten(address)}` : "Connect your wallet first."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Legal Identifier (e.g., UP/GZB/119)</Label>
                <Input
                  required
                  value={formData.legalIdentifier}
                  onChange={(e) => setFormData({ ...formData, legalIdentifier: e.target.value })}
                  disabled={isPending || isMining}
                />
              </div>
              <div className="space-y-2">
                <Label>Location / Address</Label>
                <Input
                  required
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  disabled={isPending || isMining}
                />
              </div>
              <div className="space-y-2">
                <Label>Area (sqm)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={formData.areaSqm}
                  onChange={(e) => setFormData({ ...formData, areaSqm: e.target.value })}
                  disabled={isPending || isMining}
                />
              </div>
              <div className="space-y-2">
                <Label>Valuation (INR)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={formData.valuationInr}
                  onChange={(e) => setFormData({ ...formData, valuationInr: e.target.value })}
                  disabled={isPending || isMining}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Initial Owner Wallet Address</Label>
              <Input
                required
                placeholder="0x..."
                className="font-mono"
                value={formData.ownerAddress}
                onChange={(e) => setFormData({ ...formData, ownerAddress: e.target.value })}
                disabled={isPending || isMining}
              />
            </div>

            <Button type="submit" disabled={isPending || isMining || !isConnected} className="w-full sm:w-auto">
              {isPending || isMining ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isPending ? "Confirming in wallet..." : isMining ? "Mining block..." : "Mint Property Deed"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}