import { Link } from "@tanstack/react-router";
import { MapPin, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { formatDate, formatInr, shorten, type Property } from "@/lib/landledger";

export function PropertyCard({ property }: { property: Property }) {
  return (
    <Link to="/property/$id" params={{ id: property.id }} className="block">
      <Card className="h-full transition-shadow hover:shadow-[var(--shadow-ledger)]">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">{property.legalIdentifier}</CardTitle>
            <StatusBadge status={property.status} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">{property.id}</p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-primary" />
            {property.location}
          </p>
          <p className="flex items-center gap-2">
            <Ruler className="size-4 shrink-0 text-primary" />
            {property.areaSqm} sq.m · {formatInr(property.valuationInr)}
          </p>
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="font-mono">{shorten(property.currentOwner)}</span>
            <span>Registered {formatDate(property.registeredDate)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
