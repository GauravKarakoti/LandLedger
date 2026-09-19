import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyCard } from "@/components/landledger/PropertyCard";

import { getRegistryProperties } from "@/server/functions";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify a property — LandLedger" },
      {
        name: "description",
        content: "Public verification portal: search any parcel by ID, legal identifier or owner address.",
      },
    ],
  }),
  loader: async () => {
    const properties = await getRegistryProperties();
    return { properties };
  },
  component: VerifyPortal,
});

function VerifyPortal() {
  const { properties } = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  
  const results = q
    ? properties.filter((p: any) =>
        [p.id, p.legalIdentifier, p.location, p.currentOwner, p.ownerName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : properties;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Property verification portal</h1>
        <p className="text-sm text-muted-foreground">
          Anyone can confirm ownership without an account. Records are read from the public ledger
          index; the chain remains the source of truth.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search the registry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="PROP-0001, UP/GZB/SEC-12/PLOT-118, 0xA11CE… or owner name"
              className="pl-9"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {results.length} of {properties.length} parcels shown
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((p: any) => (
          <PropertyCard key={p.id} property={p} />
        ))}
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">No parcel matches that search.</p>
        )}
      </div>
    </div>
  );
}