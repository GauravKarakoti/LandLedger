import { Badge } from "@/components/ui/badge";
import type { DisputeStatus, PropertyStatus, TransferStatus } from "@/lib/landledger";

const LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_TRANSFER: "Transfer pending",
  DISPUTED: "Disputed",
  INITIATED: "Awaiting signatures",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  OPEN: "Open",
  RESOLVED: "Resolved",
};

export function StatusBadge({
  status,
}: {
  status: PropertyStatus | TransferStatus | DisputeStatus;
}) {
  const tone =
    status === "InDispute" || status === "Active"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "Pending" || status === "INITIATED"
        ? "border-warning/40 bg-warning/15 text-warning"
        : "border-success/30 bg-success/12 text-success";

  return (
    <Badge variant="outline" className={`font-medium ${tone}`}>
      {LABEL[status] ?? status}
    </Badge>
  );
}
