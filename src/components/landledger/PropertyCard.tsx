import { Link } from "@tanstack/react-router";
import { MapPin, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { formatDate, formatInr, shorten } from "@/lib/landledger"; // Removed 'Property' type

// Typed as 'any' to accept the Drizzle database row object
export function PropertyCard({ property }: { property: any }) {
  return (
    <Link to="/property/$id" params={{ id: property.id }} className="block">
      <Card className="h-full transition-shadow hover:shadow-[var(--shadow-ledger)] overflow-hidden">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base truncate" title={property.legalIdentifier}>
              {property.legalIdentifier}
            </CardTitle>
            <StatusBadge status={property.status as any} />
          </div>
          {/* Added 'truncate' to prevent the long ID from breaking the flex container */}
          <p 
            className="font-mono text-xs text-muted-foreground truncate" 
            title={property.id}
          >
            {property.id}
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 truncate">
            <MapPin className="size-4 shrink-0 text-primary" />
            <span className="truncate" title={property.location}>{property.location}</span>
          </p>
          <p className="flex items-center gap-2">
            <Ruler className="size-4 shrink-0 text-primary" />
            {property.areaSqm} sq.m · {formatInr(property.valuationInr)}
          </p>
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs gap-2">
            <span className="font-mono truncate">{shorten(property.currentOwner)}</span>
            <span className="whitespace-nowrap">Registered {formatDate(property.registeredDate)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}