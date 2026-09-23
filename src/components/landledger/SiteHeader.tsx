import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/verify", label: "Verify" },
  { to: "/transfers", label: "Transfer" },
  { to: "/disputes", label: "Disputes" },
  { to: "/register", label: "Admin" },
] as const;

export function SiteHeader() {
  // Prevent React hydration mismatches by tracking mount state
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        <div className="ml-auto flex items-center gap-2">
          {mounted ? (
            <ConnectButton 
              chainStatus="icon" 
              showBalance={false}
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "full",
              }}
            />
          ) : (
            // A subtle skeleton to prevent layout shift while mounting
            <div className="h-[40px] w-[140px] animate-pulse rounded-xl bg-muted" />
          )}
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