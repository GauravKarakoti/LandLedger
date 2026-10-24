import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Loader2, ShieldCheck, FileCheck2, Lock, Unlock, UserCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shorten } from "@/lib/landledger";
import { getWeb3Signer, getReadOnlyContract, hashDocumentFile, getBaseScanTxUrl } from "@/lib/web3";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Admin: Register & Govern Property — LandLedger" }],
  }),
  component: RegisterPropertyPage,
});

function RegisterPropertyPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [authorityAddress, setAuthorityAddress] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txState, setTxState] = useState<"idle" | "signing" | "mining">("idle");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [deedHash, setDeedHash] = useState<string>("");

  const [formData, setFormData] = useState({
    propertyId: "",
    legalIdentifier: "",
    ownerName: "",
    location: "",
    areaSqm: "",
    valuationInr: "",
    ownerAddress: "",
  });

  // Governance form states
  const [metaUpdate, setMetaUpdate] = useState({
    propertyId: "",
    location: "",
    areaSqm: "",
    valuationInr: "",
  });
  const [adjudicatorInput, setAdjudicatorInput] = useState("");
  const [freezePropId, setFreezePropId] = useState("");

  async function loadContractStatus() {
    try {
      const { contract } = getReadOnlyContract();
      const [auth, pausedState] = await Promise.all([
        contract["registryAuthority"]!(),
        contract["paused"]!().catch(() => false),
      ]);
      setAuthorityAddress(auth);
      setIsPaused(Boolean(pausedState));
    } catch (err) {
      console.error("Failed to read contract authority:", err);
    }
  }

  useEffect(() => {
    loadContractStatus();
  }, [address]);

  const isAuthority =
    Boolean(address && authorityAddress) &&
    address!.toLowerCase() === authorityAddress.toLowerCase();

  async function handleDeedFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const computed = await hashDocumentFile(file);
      setDeedHash(computed);
      toast.success(`Title deed hashed: ${computed.slice(0, 14)}...`);
    } catch {
      toast.error("Failed to compute document hash");
    }
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) return toast.error("Connect your wallet (must be Registry Authority)");
    if (!isAddress(formData.ownerAddress.trim())) return toast.error("Invalid owner wallet address");

    setIsSubmitting(true);
    setTxState("signing");

    try {
      const { contract } = await getWeb3Signer();

      const generatedId =
        formData.propertyId.trim() ||
        `PROP-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

      const metadata = JSON.stringify({
        ownerName: formData.ownerName.trim() || "Verified Title Holder",
        location: formData.location.trim(),
        areaSqm: Number(formData.areaSqm),
        valuationInr: Number(formData.valuationInr),
        documentHash: deedHash || undefined,
      });

      toast.info("Confirm registration in your wallet...");
      const tx = await contract["registerProperty"]!(
        generatedId,
        formData.ownerAddress.trim(),
        formData.legalIdentifier.trim(),
        metadata
      );

      setTxState("mining");
      setLastTxHash(tx.hash);
      toast.info("Transaction submitted. Waiting for Base Sepolia confirmation...");

      await tx.wait();

      toast.success(`Property ${generatedId} minted on-chain!`);
      setFormData({
        propertyId: "",
        legalIdentifier: "",
        ownerName: "",
        location: "",
        areaSqm: "",
        valuationInr: "",
        ownerAddress: "",
      });
      setDeedHash("");
      await router.invalidate();
    } catch (err: any) {
      console.error("Registration error:", err);
      toast.error(err.reason || err.shortMessage || err.message?.split("\n")[0] || "Transaction failed");
    } finally {
      setIsSubmitting(false);
      setTxState("idle");
    }
  }

  async function handleUpdateMetadata(e: React.FormEvent) {
    e.preventDefault();
    if (!metaUpdate.propertyId.trim()) return toast.error("Enter a property ID");

    setIsSubmitting(true);
    try {
      const { contract } = await getWeb3Signer();
      const newMeta = JSON.stringify({
        location: metaUpdate.location.trim(),
        areaSqm: Number(metaUpdate.areaSqm),
        valuationInr: Number(metaUpdate.valuationInr),
        updatedAt: new Date().toISOString(),
      });

      const tx = await contract["updatePropertyMetadata"]!(metaUpdate.propertyId.trim(), newMeta);
      toast.info("Updating metadata on-chain...");
      await tx.wait();
      toast.success(`Metadata updated for ${metaUpdate.propertyId}`);
      setMetaUpdate({ propertyId: "", location: "", areaSqm: "", valuationInr: "" });
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Metadata update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetAdjudicator(authorize: boolean) {
    if (!isAddress(adjudicatorInput.trim())) return toast.error("Enter a valid EVM address");
    setIsSubmitting(true);
    try {
      const { contract } = await getWeb3Signer();
      const tx = await contract["setAdjudicator"]!(adjudicatorInput.trim(), authorize);
      toast.info(`${authorize ? "Granting" : "Revoking"} adjudicator role...`);
      await tx.wait();
      toast.success(`Adjudicator role ${authorize ? "granted" : "revoked"}!`);
      setAdjudicatorInput("");
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Role update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFreezeToggle(freeze: boolean) {
    if (!freezePropId.trim()) return toast.error("Enter a Property ID");
    setIsSubmitting(true);
    try {
      const { contract } = await getWeb3Signer();
      const tx = freeze
        ? await contract["freezeProperty"]!(freezePropId.trim())
        : await contract["unfreezeProperty"]!(freezePropId.trim());
      await tx.wait();
      toast.success(`Property ${freezePropId} ${freeze ? "frozen" : "unfrozen"}!`);
      setFreezePropId("");
      await router.invalidate();
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Failed to update property freeze status");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmergencyPauseToggle() {
    setIsSubmitting(true);
    try {
      const { contract } = await getWeb3Signer();
      const tx = isPaused ? await contract["unpause"]!() : await contract["pause"]!();
      await tx.wait();
      await loadContractStatus();
      toast.success(`Contract ${isPaused ? "unpaused" : "paused"}!`);
    } catch (err: any) {
      toast.error(err.reason || err.shortMessage || "Failed to toggle emergency pause");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Registrar & Governance Portal
          </h1>
          <p className="text-sm text-muted-foreground">
            Mint new land titles with cryptographic deed hashes, update parcel records, and manage adjudicator roles.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card px-3.5 py-2 text-xs">
          <p className="text-muted-foreground">
            Registry Authority:{" "}
            <span className="font-mono font-medium text-foreground">
              {authorityAddress ? shorten(authorityAddress) : "Loading..."}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5">
            Status:{" "}
            <span className={isPaused ? "font-semibold text-destructive" : "font-semibold text-emerald-600"}>
              {isPaused ? "PAUSED (Emergency)" : "ACTIVE"}
            </span>
            {isAuthority && (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                <ShieldCheck className="size-3" /> Authority Verified
              </span>
            )}
          </p>
        </div>
      </header>

      <Tabs defaultValue="mint" className="space-y-6">
        <TabsList>
          <TabsTrigger value="mint">1. Mint Property Deed</TabsTrigger>
          <TabsTrigger value="governance">2. Metadata & Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="mint">
          <Card className="border-primary/20 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Register New Land Parcel</CardTitle>
              <CardDescription>
                {isConnected
                  ? `Connected as ${shorten(address)} ${isAuthority ? "(Registry Authority)" : "(Read-Only / Non-Authority)"}`
                  : "Connect your wallet to register a parcel."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitRegistration} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="propId">Custom Property ID (Optional)</Label>
                    <Input
                      id="propId"
                      placeholder="Auto-generates e.g. PROP-8F3A if blank"
                      className="font-mono"
                      value={formData.propertyId}
                      onChange={(e) => setFormData({ ...formData, propertyId: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalId">Legal Identifier / Survey No. *</Label>
                    <Input
                      id="legalId"
                      required
                      placeholder="e.g., UP/GZB/119"
                      value={formData.legalIdentifier}
                      onChange={(e) => setFormData({ ...formData, legalIdentifier: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">Title Holder Full Name *</Label>
                    <Input
                      id="ownerName"
                      required
                      placeholder="e.g., Rajesh Sharma"
                      value={formData.ownerName}
                      onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location / Geo Address *</Label>
                    <Input
                      id="location"
                      required
                      placeholder="e.g., Sector 62, Noida, UP"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="area">Area (sqm) *</Label>
                    <Input
                      id="area"
                      required
                      type="number"
                      min="1"
                      value={formData.areaSqm}
                      onChange={(e) => setFormData({ ...formData, areaSqm: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valuation">Valuation (INR) *</Label>
                    <Input
                      id="valuation"
                      required
                      type="number"
                      min="1"
                      value={formData.valuationInr}
                      onChange={(e) => setFormData({ ...formData, valuationInr: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ownerWallet">Initial Owner Wallet Address *</Label>
                  <Input
                    id="ownerWallet"
                    required
                    placeholder="0x..."
                    className="font-mono"
                    value={formData.ownerAddress}
                    onChange={(e) => setFormData({ ...formData, ownerAddress: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deedFile">Physical Title Deed PDF (Client-Side Keccak-256 Hash)</Label>
                  <Input
                    id="deedFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.json"
                    onChange={handleDeedFileChange}
                    disabled={isSubmitting}
                  />
                  {deedHash && (
                    <p className="flex items-center gap-1.5 font-mono text-xs text-emerald-600">
                      <FileCheck2 className="size-3.5" /> Deed Hash: {deedHash}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Button type="submit" disabled={isSubmitting || !isConnected}>
                    {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {txState === "signing"
                      ? "Confirming in Wallet..."
                      : txState === "mining"
                        ? "Mining on Base Sepolia..."
                        : "Mint Property Deed"}
                  </Button>

                  {lastTxHash && (
                    <a
                      href={getBaseScanTxUrl(lastTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      View last tx ({shorten(lastTxHash)}) ↗
                    </a>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update Parcel Metadata</CardTitle>
              <CardDescription>
                Update survey boundaries, valuation, or physical record URI for an existing property.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateMetadata} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Property ID</Label>
                  <Input
                    required
                    placeholder="PROP-001"
                    className="font-mono"
                    value={metaUpdate.propertyId}
                    onChange={(e) => setMetaUpdate({ ...metaUpdate, propertyId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Updated Location</Label>
                  <Input
                    required
                    placeholder="New survey description"
                    value={metaUpdate.location}
                    onChange={(e) => setMetaUpdate({ ...metaUpdate, location: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Updated Area (sqm)</Label>
                  <Input
                    required
                    type="number"
                    min="1"
                    value={metaUpdate.areaSqm}
                    onChange={(e) => setMetaUpdate({ ...metaUpdate, areaSqm: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Updated Valuation (INR)</Label>
                  <Input
                    required
                    type="number"
                    min="1"
                    value={metaUpdate.valuationInr}
                    onChange={(e) => setMetaUpdate({ ...metaUpdate, valuationInr: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" variant="outline" disabled={isSubmitting || !isConnected}>
                    <RefreshCw className="mr-2 size-4" /> Update On-Chain Metadata
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adjudicator Role Management</CardTitle>
                <CardDescription>Grant or revoke dispute resolution privileges.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Adjudicator Wallet (0x...)"
                  className="font-mono"
                  value={adjudicatorInput}
                  onChange={(e) => setAdjudicatorInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSetAdjudicator(true)}
                    disabled={isSubmitting || !isConnected}
                  >
                    <UserCheck className="mr-1.5 size-4" /> Grant Role
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleSetAdjudicator(false)}
                    disabled={isSubmitting || !isConnected}
                  >
                    Revoke Role
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Freeze & Circuit Breaker</CardTitle>
                <CardDescription>Freeze an individual title or pause the entire registry.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Property ID (e.g. PROP-001)"
                    className="font-mono"
                    value={freezePropId}
                    onChange={(e) => setFreezePropId(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleFreezeToggle(true)}
                    disabled={isSubmitting || !isConnected}
                  >
                    <Lock className="mr-1 size-3.5" /> Freeze
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleFreezeToggle(false)}
                    disabled={isSubmitting || !isConnected}
                  >
                    <Unlock className="mr-1 size-3.5" /> Unfreeze
                  </Button>
                </div>

                <div className="border-t border-border pt-3">
                  <Button
                    type="button"
                    variant={isPaused ? "default" : "destructive"}
                    size="sm"
                    className="w-full"
                    onClick={handleEmergencyPauseToggle}
                    disabled={isSubmitting || !isConnected}
                  >
                    {isPaused ? "Unpause Smart Contract" : "Trigger Emergency Contract Pause"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}