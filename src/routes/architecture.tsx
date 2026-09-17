import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System architecture — LandLedger" },
      {
        name: "description",
        content:
          "Three-layer architecture, registration-to-transfer data flow, security model and deployment topology.",
      },
      { property: "og:title", content: "System architecture — LandLedger" },
      {
        property: "og:description",
        content: "How the blockchain, service and application layers of LandLedger fit together.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchitecturePage,
});

const LAYERS = `┌──────────────────────── APPLICATION LAYER ────────────────────────┐
│  React SPA  ·  Dashboard / Verify / Transfer / Disputes / History │
└───────────────┬───────────────────────────────────────────────────┘
                │ HTTPS + JWT
┌───────────────▼──────────── SERVICE LAYER ────────────────────────┐
│  Express REST API  ·  auth · zod validation · role guard          │
│  ethers.js signer  ·  PostgreSQL read model + event indexer       │
└───────────────┬───────────────────────────────────────────────────┘
                │ JSON-RPC
┌───────────────▼────────── BLOCKCHAIN LAYER ───────────────────────┐
│  LandRegistry.sol  ·  registrar / owner / adjudicator roles       │
│  Events: Registered · TransferInitiated · Completed · Disputed    │
└───────────────────────────────────────────────────────────────────┘`;

const FLOW = `Registrar ─▶ POST /api/properties/register
             ├─▶ validate + authorise (role: REGISTRAR)
             ├─▶ contract.registerProperty(propertyId, owner)
             ├─▶ PropertyRegistered event ─▶ indexer ─▶ properties table
             └─◀ 201 { propertyId, txHash }

Owner ─────▶ POST /api/transfers/initiate   (role: OWNER)
             └─▶ status = PENDING_TRANSFER, transfer row INITIATED

Buyer+Reg ─▶ POST /api/transfers/complete   (2-of-3 signatures)
             └─▶ ownership moves, transfer row COMPLETED, history appended

Anyone ────▶ GET /api/properties/:id/history  (public read model)`;

export default function noop() {}

function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">System architecture</h1>
        <p className="text-sm text-muted-foreground">
          Full write-up in <code className="font-mono">docs/ARCHITECTURE.md</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Three-layer architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-xs leading-relaxed">
            {LAYERS}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration → transfer data flow</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-xs leading-relaxed">
            {FLOW}
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· On-chain role checks: registrar, owner, adjudicator modifiers.</p>
            <p>· API JWT with role claim; every write re-checks the role server-side.</p>
            <p>· Transfers need owner + buyer + registrar signatures (2-of-3 enforced).</p>
            <p>· Disputed parcels are frozen at the contract level, not just in the UI.</p>
            <p>· PostgreSQL holds a read model only — the chain remains authoritative.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deployment topology</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· docker compose: hardhat node, postgres, api, web.</p>
            <p>· Contracts deployed by script to the local chain on startup.</p>
            <p>· API and indexer share one container; indexer polls contract events.</p>
            <p>· Production target: permissioned EVM chain + managed Postgres.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
