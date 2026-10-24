import {
  AlertTriangle,
  ArrowRightLeft,
  FilePlus2,
  ShieldCheck,
  Circle,
  Clock,
  FileEdit,
  ExternalLink,
} from "lucide-react";
import { formatDate, shorten, type LedgerEvent } from "@/lib/landledger";

const ICONS = {
  PropertyRegistered: FilePlus2,
  PropertyTransferred: ArrowRightLeft,
  TransferInitiated: Clock,
  TransferApproved: ShieldCheck,
  DisputeRaised: AlertTriangle,
  DisputeResolved: ShieldCheck,
  MetadataUpdated: FileEdit,
} as const;

export function HistoryTimeline({ events }: { events: LedgerEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        No on-chain events recorded yet.
      </p>
    );
  }

  return (
    <ol
      aria-label="Property ownership and dispute history timeline"
      className="relative space-y-6 border-l border-border pl-6"
    >
      {events.map((event) => {
        const Icon = ICONS[event.type as keyof typeof ICONS] || Circle;
        const hasValidTx = Boolean(event.txHash && event.txHash.startsWith("0x") && event.txHash.length === 66);

        return (
          <li key={event.id} className="relative">
            <span
              className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-xs"
              aria-hidden="true"
            >
              <Icon className="size-3.5 text-primary" />
            </span>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-medium text-foreground">{event.type}</p>
              <time className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</time>
              {event.blockNumber ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  block #{event.blockNumber}
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground">
              {event.actor ? <span>by {shorten(event.actor)}</span> : null}
              {event.txHash ? (
                <>
                  <span>·</span>
                  {hasValidTx ? (
                    <a
                      href={`https://sepolia.basescan.org/tx/${event.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      aria-label={`View transaction ${shorten(event.txHash)} on BaseScan`}
                    >
                      tx {shorten(event.txHash)}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span>tx {shorten(event.txHash)}</span>
                  )}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}