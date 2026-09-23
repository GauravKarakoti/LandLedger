import { AlertTriangle, ArrowRightLeft, FilePlus2, ShieldCheck, Circle } from "lucide-react";
import { formatDate, shorten, type LedgerEvent } from "@/lib/landledger";

const ICONS = {
  PropertyRegistered: FilePlus2,
  PropertyTransferred: ArrowRightLeft, // 👈 Updated to match indexer
  DisputeRaised: AlertTriangle,        // 👈 Updated to match indexer
  DisputeResolved: ShieldCheck,
} as const;

export function HistoryTimeline({ events }: { events: LedgerEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No on-chain events recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {events.map((event) => {
        // 👈 Safely fallback to a generic Circle icon if the event type is completely new
        const Icon = ICONS[event.type as keyof typeof ICONS] || Circle; 
        
        return (
          <li key={event.id} className="relative">
            <span className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full border border-border bg-card">
              <Icon className="size-3.5 text-primary" />
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-medium">{event.type}</p>
              <span className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</span>
              <span className="text-xs text-muted-foreground">block #{event.blockNumber}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              by {shorten(event.actor)} · tx {shorten(event.txHash)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}