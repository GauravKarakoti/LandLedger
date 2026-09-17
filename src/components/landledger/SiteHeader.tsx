import { Link } from "@tanstack/react-router";
import { Landmark, Wallet } from "lucide-react";
import { DEMO_ACCOUNT, shorten } from "@/lib/landledger";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/verify", label: "Verify" },
  { to: "/transfer", label: "Transfer" },
  { to: "/disputes", label: "Disputes" },
  { to: "/architecture", label: "Architecture" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Landmark className="size-4" />
          </span>
          LandLedger
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-mono">
          <Wallet className="size-3.5 text-primary" />
          {shorten(DEMO_ACCOUNT)}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
