import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Search,
  ShieldCheck,
  FileCheck2,
  Blocks,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/landledger/PropertyCard";
import { StatusBadge } from "@/components/landledger/StatusBadge";
import { shorten } from "@/lib/landledger";
import { getReadOnlyContract, hashDocumentFile } from "@/lib/web3";

import { getRegistryProperties } from "@/server/functions";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify a Property — LandLedger" },
      {
        name: "description",
        content:
          "Public verification portal: search parcels, verify cryptographic title deed hashes, and audit live Base Sepolia state.",
      },
    ],
  }),
  loader: async () => {
    const properties = await getRegistryProperties();
    return { properties };
  },
  component: VerifyPortal,
});

const STATUS_MAP: Record<number, string> = {
  0: "Active",
  1: "InDispute",
  2: "Transferred",
  3: "Frozen",
};

function VerifyPortal() {
  const { properties } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Document Hash Verification State
  const [computedHash, setComputedHash] = useState<string>("");
  const [matchedDeedProperty, setMatchedDeedProperty] = useState<any | null>(null);
  const [deedChecked, setDeedChecked] = useState(false);

  // Live On-Chain Audit State
  const [auditPropId, setAuditPropId] = useState("");
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    exists: boolean;
    id: string;
    onChainOwner: string;
    legalIdentifier: string;
    status: string;
    registeredAt: number;
    historyCount: number;
    matchesDb: boolean;
  } | null>(null);

  const q = query.trim().toLowerCase();

  const results = properties.filter((p: any) => {
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    const matchesQuery =
      !q ||
      [p.id, p.legalIdentifier, p.location, p.currentOwner, p.ownerName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    return matchesStatus && matchesQuery;
  });

  async function handleVerifyDeedFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const hash = await hashDocumentFile(file);
      setComputedHash(hash);
      setDeedChecked(true);

      const found = properties.find((p: any) => {
        if (!p.metadataUri) return false;
        return p.metadataUri.toLowerCase().includes(hash.toLowerCase());
      });

      setMatchedDeedProperty(found || null);
      if (found) {
        toast.success(`Authentic title deed matched to parcel ${found.id}!`);
      } else {
        toast.warning("Hash computed, but no matching parcel metadata contains this document hash.");
      }
    } catch {
      toast.error("Failed to compute Keccak-256 hash of file");
    }
  }

  async function handleDirectOnChainAudit(e: React.FormEvent) {
    e.preventDefault();
    const targetId = auditPropId.trim();
    if (!targetId) return toast.error("Enter a Property ID (e.g. PROP-001)");

    setIsAuditing(true);
    setAuditResult(null);

    try {
      const { contract } = getReadOnlyContract();
      const [onChainProp, history] = await Promise.all([
        contract["properties"]!(targetId),
        contract["getOwnershipHistory"]!(targetId).catch(() => []),
      ]);

      const zeroAddr = "0x0000000000000000000000000000000000000000";
      if (!onChainProp || onChainProp.currentOwner === zeroAddr) {
        setAuditResult({
          exists: false,
          id: targetId,
          onChainOwner: zeroAddr,
          legalIdentifier: "",
          status: "Not Registered",
          registeredAt: 0,
          historyCount: 0,
          matchesDb: false,
        });
        return;
      }

      const dbMatch = properties.find((p: any) => p.id.toLowerCase() === targetId.toLowerCase());
      const mappedStatus = STATUS_MAP[Number(onChainProp.status)] || "Active";
      const matchesDb = Boolean(
        dbMatch &&
          dbMatch.currentOwner.toLowerCase() === onChainProp.currentOwner.toLowerCase() &&
          dbMatch.status === mappedStatus
      );

      setAuditResult({
        exists: true,
        id: onChainProp.id,
        onChainOwner: onChainProp.currentOwner,
        legalIdentifier: onChainProp.legalIdentifier,
        status: mappedStatus,
        registeredAt: Number(onChainProp.registeredAt),
        historyCount: history.length,
        matchesDb,
      });
    } catch (err) {
      console.error("On-chain audit error:", err);
      toast.error("Failed to query Base Sepolia smart contract");
    } finally {
      setIsAuditing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Property Verification Portal</h1>
        <p className="text-sm text-muted-foreground">
          Confirm land ownership without an account. Search the public index, verify physical title
          deed PDFs via Keccak-256 hashing, or audit live Base Sepolia contract storage directly.
        </p>
      </header>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList>
          <TabsTrigger value="search">1. Search Registry ({properties.length})</TabsTrigger>
          <TabsTrigger value="document">2. Verify Title Deed Hash</TabsTrigger>
          <TabsTrigger value="onchain">3. Live Base Sepolia Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search & Filter Parcels</CardTitle>
              <CardDescription>
                Query by parcel ID, survey/legal identifier, owner name, location, or wallet address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="PROP-001, UP/GZB/118, 0xA11CE… or owner name"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "Active", "InDispute", "Frozen"].map((st) => (
                    <Button
                      key={st}
                      type="button"
                      size="sm"
                      variant={statusFilter === st ? "default" : "outline"}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st === "ALL" ? "All Statuses" : st}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {results.length} of {properties.length} registered parcels
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((p: any) => (
              <PropertyCard key={p.id} property={p} />
            ))}
            {results.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No parcel matches your search criteria.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="document">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileCheck2 className="size-4 text-primary" /> Client-Side Deed Authenticity Verifier
              </CardTitle>
              <CardDescription>
                Select any title deed PDF or image. Its Keccak-256 cryptographic digest is computed
                locally in your browser and compared against on-chain metadata records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-md space-y-2">
                <Label htmlFor="verifyDeedFile">Select Deed Document</Label>
                <Input
                  id="verifyDeedFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.json"
                  onChange={handleVerifyDeedFile}
                />
              </div>

              {deedChecked && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    Computed Keccak-256: <span className="text-foreground font-medium">{computedHash}</span>
                  </p>

                  {matchedDeedProperty ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-emerald-500/10 p-3.5 text-emerald-700 dark:text-emerald-400">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="size-5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">
                            Verified Authentic Title Deed — Matches {matchedDeedProperty.id}
                          </p>
                          <p className="text-xs">
                            Legal ID: {matchedDeedProperty.legalIdentifier} · Owner:{" "}
                            {shorten(matchedDeedProperty.currentOwner)}
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/property/$id" params={{ id: matchedDeedProperty.id }}>
                          Inspect Parcel <ArrowRight className="ml-1.5 size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-md bg-amber-500/10 p-3.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-5 shrink-0" />
                      <p className="text-xs">
                        No registered parcel contains this document hash in its metadata URI.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onchain">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Blocks className="size-4 text-primary" /> Direct Base Sepolia Smart Contract Query
              </CardTitle>
              <CardDescription>
                Bypass the database index and query <code className="font-mono text-xs">properties(id)</code>{" "}
                directly from Base Sepolia RPC to verify state synchronization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleDirectOnChainAudit} className="flex max-w-md gap-2">
                <Input
                  placeholder="Enter Property ID (e.g. PROP-001)"
                  className="font-mono"
                  value={auditPropId}
                  onChange={(e) => setAuditPropId(e.target.value)}
                />
                <Button type="submit" disabled={isAuditing}>
                  {isAuditing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Audit Chain
                </Button>
              </form>

              {auditResult && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  {!auditResult.exists ? (
                    <p className="text-sm text-destructive">
                      Parcel <span className="font-mono font-semibold">{auditResult.id}</span> does not exist on
                      the Base Sepolia smart contract.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-5 text-emerald-600" />
                          <span className="font-mono text-base font-semibold">{auditResult.id}</span>
                          <span className="text-xs text-muted-foreground">
                            ({auditResult.legalIdentifier})
                          </span>
                        </div>
                        <StatusBadge status={auditResult.status as any} />
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <p className="text-muted-foreground">
                          On-Chain Owner:{" "}
                          <span className="font-mono font-medium text-foreground">
                            {auditResult.onChainOwner}
                          </span>
                        </p>
                        <p className="text-muted-foreground">
                          Provenance Transfers Recorded:{" "}
                          <span className="font-medium text-foreground">{auditResult.historyCount}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Minted Timestamp:{" "}
                          <span className="font-medium text-foreground">
                            {new Date(auditResult.registeredAt * 1000).toLocaleString()}
                          </span>
                        </p>
                        <p className="text-muted-foreground">
                          PostgreSQL Indexer Sync:{" "}
                          <span
                            className={
                              auditResult.matchesDb
                                ? "font-semibold text-emerald-600"
                                : "font-semibold text-amber-600"
                            }
                          >
                            {auditResult.matchesDb ? "100% Synchronized ✓" : "Sync Pending / Diverged"}
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}