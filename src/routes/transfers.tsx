import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { ethers } from "ethers";
import {
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  History,
  KeyRound,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { shorten } from "@/lib/landledger";
import {
  getWeb3Signer,
  getReadOnlyContract,
  getBaseScanTxUrl,
  LANDLEDGER_CONTRACT,
  BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/web3";
import { getRecentTransfers, getUserProperties, getRegistryProperties } from "@/server/functions";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Transfer Property Deed — LandLedger" },
      { name: "description", content: "Execute direct, multi-signature, or ECDSA signed property transfers." },
    ],
  }),
  loader: async () => {
    const [recentTransfers, allProperties] = await Promise.all([
      getRecentTransfers(),
      getRegistryProperties(),
    ]);
    return { recentTransfers, allProperties };
  },
  component: TransferPage,
});

interface OnChainTransferRequest {
  id: number;
  propertyId: string;
  seller: string;
  buyer: string;
  buyerApproved: boolean;
  authorityApproved: boolean;
  executed: boolean;
  createdAt: number;
}

interface OnChainOwnershipRecord {
  previousOwner: string;
  newOwner: string;
  timestamp: number;
  note: string;
}

function TransferPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { recentTransfers, allProperties } = Route.useLoaderData();
  const { isConnected, address } = useAccount();

  const [ownedProperties, setOwnedProperties] = useState<any[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [transferMode, setTransferMode] = useState<"direct" | "multisig">("direct");

  const [isBusy, setIsBusy] = useState(false);
  const [multiSigRequests, setMultiSigRequests] = useState<OnChainTransferRequest[]>([]);
  const [isAuthorityOrAdjudicator, setIsAuthorityOrAdjudicator] = useState(false);

  // On-Chain Ownership History Inspector
  const [selectedHistoryPropId, setSelectedHistoryPropId] = useState<string>("");
  const [onChainHistory, setOnChainHistory] = useState<OnChainOwnershipRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Off-chain ECDSA state
  const [ecdsaDeadline, setEcdsaDeadline] = useState<number>(0);
  const [ecdsaSignature, setEcdsaSignature] = useState<string>("");

  const loadMultiSigAndRoleState = useCallback(async () => {
    try {
      const { contract } = getReadOnlyContract();

      if (address) {
        const [authAddr, isAdj] = await Promise.all([
          contract["registryAuthority"]!().catch(() => ""),
          contract["adjudicators"]!(address).catch(() => false),
        ]);
        setIsAuthorityOrAdjudicator(
          Boolean(isAdj) || authAddr.toLowerCase() === address.toLowerCase()
        );
      }

      // Scan recent multi-sig transfer requests (IDs 1..15)
      const fetched: OnChainTransferRequest[] = [];
      for (let i = 1; i <= 15; i++) {
        try {
          const req = await contract["transferRequests"]!(i);
          if (Number(req.id) === 0) break;
          fetched.push({
            id: Number(req.id),
            propertyId: req.propertyId,
            seller: req.seller,
            buyer: req.buyer,
            buyerApproved: Boolean(req.buyerApproved),
            authorityApproved: Boolean(req.authorityApproved),
            executed: Boolean(req.executed),
            createdAt: Number(req.createdAt),
          });
        } catch {
          break;
        }
      }
      setMultiSigRequests(fetched.reverse());
    } catch (err) {
      console.error("Error loading on-chain multi-sig queue:", err);
    }
  }, [address]);

  useEffect(() => {
    loadMultiSigAndRoleState();
  }, [loadMultiSigAndRoleState]);

  useEffect(() => {
    if (address) {
      getUserProperties({ data: address }).then((res: any) => {
        setOwnedProperties(res);
        if (res.length > 0 && !propertyId) setPropertyId(res[0].id);
      });
    } else {
      setOwnedProperties([]);
      setPropertyId("");
    }
  }, [address]);

  useEffect(() => {
    if (allProperties.length > 0 && !selectedHistoryPropId) {
      setSelectedHistoryPropId(allProperties[0]!.id);
    }
  }, [allProperties]);

  const loadOnChainHistory = useCallback(async (propId: string) => {
    if (!propId) return;
    setIsLoadingHistory(true);
    try {
      const { contract } = getReadOnlyContract();
      const rawHistory = await contract["getOwnershipHistory"]!(propId);
      const formatted: OnChainOwnershipRecord[] = rawHistory.map((item: any) => ({
        previousOwner: item.previousOwner,
        newOwner: item.newOwner,
        timestamp: Number(item.timestamp),
        note: item.note,
      }));
      setOnChainHistory(formatted);
    } catch {
      setOnChainHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedHistoryPropId) {
      loadOnChainHistory(selectedHistoryPropId);
    }
  }, [selectedHistoryPropId, loadOnChainHistory]);

  const transferable = ownedProperties.filter((p) => p.status === "Active");

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) return toast.error("Connect your wallet first");
    if (!propertyId) return toast.error("Select a property first");
    if (!isAddress(toAddress.trim())) return toast.error("Enter a valid EVM buyer wallet address (0x…)");
    if (toAddress.trim().toLowerCase() === address?.toLowerCase()) {
      return toast.error("Cannot transfer to yourself");
    }

    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();

      if (transferMode === "direct") {
        toast.info("Confirm direct transfer in your wallet...");
        const tx = await contract["transferProperty"]!(propertyId, toAddress.trim());
        toast.info("Waiting for block confirmation...");
        await tx.wait();
        toast.success("Direct transfer confirmed on-chain!");
        setToAddress("");
        await router.invalidate();
        navigate({ to: "/property/$id", params: { id: propertyId } });
      } else {
        toast.info("Confirm multi-sig transfer initiation in your wallet...");
        const tx = await contract["initiateTransfer"]!(propertyId, toAddress.trim());
        toast.info("Mining multi-sig transfer request...");
        await tx.wait();
        toast.success("Multi-sig transfer initiated! Awaiting Buyer & Authority approvals.");
        setToAddress("");
        await loadMultiSigAndRoleState();
        await router.invalidate();
      }
    } catch (err: any) {
      console.error("Transfer error:", err);
      toast.error(err.reason || err.shortMessage || err.message?.split("\n")[0] || "Transfer failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApproveMultiSig(transferId: number) {
    if (!isConnected) return toast.error("Connect wallet first");
    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();
      toast.info(`Approving multi-sig transfer #${transferId}...`);
      const tx = await contract["approveTransfer"]!(transferId);
      await tx.wait();
      toast.success(`Approval recorded for Transfer #${transferId}!`);
      await loadMultiSigAndRoleState();
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Approval failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGenerateEcdsaSignature() {
    if (!propertyId || !isAddress(toAddress.trim())) {
      return toast.error("Select your property and enter a valid buyer address first");
    }
    setIsBusy(true);
    try {
      const { signer, contract, address: signerAddress } = await getWeb3Signer();
      const nonce = await contract["nonces"]!(signerAddress);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "string", "address", "address", "uint256", "uint256"],
        [
          LANDLEDGER_CONTRACT,
          BigInt(BASE_SEPOLIA_CHAIN_ID),
          propertyId,
          signerAddress,
          toAddress.trim(),
          nonce,
          BigInt(deadline),
        ]
      );

      const sig = await signer.signMessage(ethers.getBytes(messageHash));
      setEcdsaDeadline(deadline);
      setEcdsaSignature(sig);
      toast.success("Off-chain ECDSA transfer permit signed!");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Failed to sign message");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExecuteEcdsaTransfer() {
    if (!ecdsaSignature || !ecdsaDeadline) return toast.error("Generate an owner signature first");
    setIsBusy(true);
    try {
      const { contract } = await getWeb3Signer();
      const tx = await contract["transferWithSignature"]!(
        propertyId,
        toAddress.trim(),
        ecdsaDeadline,
        ecdsaSignature
      );
      toast.info("Executing ECDSA signed transfer on-chain...");
      await tx.wait();
      toast.success("ECDSA signed transfer executed on-chain!");
      setEcdsaSignature("");
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "ECDSA execution failed (Requires Authority wallet)");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Transfer Property Deed</h1>
        <p className="text-sm text-muted-foreground">
          Execute an instant owner transfer, initiate a 3-party multi-signature escrow, or verify on-chain chain-of-title history.
        </p>
      </header>

      <Tabs defaultValue="initiate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="initiate">1. Initiate Transfer</TabsTrigger>
          <TabsTrigger value="multisig">
            2. Multi-Sig Approvals ({multiSigRequests.filter((r) => !r.executed).length})
          </TabsTrigger>
          <TabsTrigger value="history">3. On-Chain Ownership History</TabsTrigger>
        </TabsList>

        <TabsContent value="initiate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfer Ownership</CardTitle>
              <CardDescription>
                Choose between Direct Instant Transfer or 3-Party Multi-Signature Escrow (Seller + Buyer + Registrar).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isConnected ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Please connect your wallet using the button in the top right to view and transfer your properties.
                </div>
              ) : (
                <form onSubmit={handleTransferSubmit} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Property</Label>
                      <Select value={propertyId} onValueChange={setPropertyId} disabled={isBusy}>
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
                          Your properties cannot be transferred currently (they are in dispute or frozen).
                        </p>
                      )}
                      {ownedProperties.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No properties registered to {shorten(address || "")}.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Transfer Workflow</Label>
                      <Select
                        value={transferMode}
                        onValueChange={(v) => setTransferMode(v as "direct" | "multisig")}
                        disabled={isBusy}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct Instant Transfer (1-Step)</SelectItem>
                          <SelectItem value="multisig">
                            Multi-Signature Escrow (Buyer + Registrar Approval)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="buyer">Buyer Wallet Address</Label>
                    <Input
                      id="buyer"
                      value={toAddress}
                      onChange={(e) => setToAddress(e.target.value)}
                      placeholder="0x..."
                      className="font-mono"
                      disabled={isBusy}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={isBusy || transferable.length === 0}>
                      {isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRightLeft className="mr-2 size-4" />}
                      {transferMode === "direct" ? "Sign & Transfer Immediately" : "Initiate Multi-Sig Request"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateEcdsaSignature}
                      disabled={isBusy || transferable.length === 0}
                    >
                      <KeyRound className="mr-2 size-4" /> Sign Off-Chain ECDSA Permit
                    </Button>
                  </div>

                  {ecdsaSignature && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                      <p className="text-xs font-medium text-primary">
                        ECDSA Permit Generated (Expires {new Date(ecdsaDeadline * 1000).toLocaleTimeString()})
                      </p>
                      <p className="break-all font-mono text-[11px] text-muted-foreground">{ecdsaSignature}</p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleExecuteEcdsaTransfer}
                        disabled={isBusy}
                      >
                        Submit Signed Permit as Authority
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Completed Transfers</CardTitle>
              <CardDescription>Live feed of indexed on-chain property title exchanges.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentTransfers.map((t: any) => (
                <div key={t.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm font-medium">{t.propertyId}</p>
                    <StatusBadge status="COMPLETED" />
                  </div>
                  <div className="mt-3 flex items-center gap-2 font-mono text-sm text-muted-foreground">
                    <span>{shorten(t.previousOwner)}</span>
                    <span className="text-foreground">→</span>
                    <span>{shorten(t.newOwner)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tx: {shorten(t.transactionHash)}</span>
                    {t.transactionHash && t.transactionHash.length === 66 && (
                      <a
                        href={getBaseScanTxUrl(t.transactionHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        BaseScan <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {recentTransfers.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent transfers found in the indexer.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="multisig">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Multi-Signature Escrow Queue</CardTitle>
              <CardDescription>
                Pending transfers require signatures from both the designated Buyer and the Registry Authority/Adjudicator before ownership mutates on-chain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {multiSigRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No multi-signature transfer requests found on-chain.</p>
              ) : (
                multiSigRequests.map((req) => {
                  const isBuyer = address?.toLowerCase() === req.buyer.toLowerCase();
                  const canBuyerApprove = !req.executed && isBuyer && !req.buyerApproved;
                  const canAuthorityApprove = !req.executed && isAuthorityOrAdjudicator && !req.authorityApproved;

                  return (
                    <div key={req.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            Request #{req.id} · {req.propertyId}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            req.executed
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-amber-500/10 text-amber-600"
                          }`}
                        >
                          {req.executed ? (
                            <>
                              <CheckCircle2 className="size-3.5" /> Executed
                            </>
                          ) : (
                            <>
                              <Clock className="size-3.5" /> Pending Approvals
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span>Seller: {shorten(req.seller)} (Initiated ✓)</span>
                        <span>→</span>
                        <span>
                          Buyer: {shorten(req.buyer)} ({req.buyerApproved ? "Approved ✓" : "Awaiting"})
                        </span>
                        <span>·</span>
                        <span>
                          Registrar: {req.authorityApproved ? "Certified ✓" : "Awaiting"}
                        </span>
                      </div>

                      {!req.executed && (canBuyerApprove || canAuthorityApprove) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {canBuyerApprove && (
                            <Button
                              size="sm"
                              onClick={() => handleApproveMultiSig(req.id)}
                              disabled={isBusy}
                            >
                              <CheckCircle2 className="mr-1.5 size-4" /> Approve as Buyer
                            </Button>
                          )}
                          {canAuthorityApprove && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleApproveMultiSig(req.id)}
                              disabled={isBusy}
                            >
                              <ShieldCheck className="mr-1.5 size-4" /> Certify as Authority
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-primary" /> On-Chain Ownership Chain Verification
              </CardTitle>
              <CardDescription>
                Queries <code className="font-mono text-xs">getOwnershipHistory(propertyId)</code> directly from Base Sepolia smart contract storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-sm space-y-2">
                <Label>Select Parcel to Inspect</Label>
                <Select value={selectedHistoryPropId} onValueChange={setSelectedHistoryPropId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a parcel" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProperties.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.id} — {p.legalIdentifier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Reading immutable provenance from Base Sepolia...
                </div>
              ) : onChainHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No on-chain ownership records found for {selectedHistoryPropId || "this parcel"}.
                </p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-6">
                  {onChainHistory.map((item, idx) => (
                    <li key={`${item.timestamp}-${idx}`} className="relative rounded-lg border border-border p-3.5">
                      <span className="absolute -left-[31px] top-4 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{item.note}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.timestamp * 1000).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                        {item.previousOwner === ethers.ZeroAddress
                          ? "GENESIS MINT"
                          : shorten(item.previousOwner)}{" "}
                        → <span className="font-semibold text-foreground">{shorten(item.newOwner)}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}