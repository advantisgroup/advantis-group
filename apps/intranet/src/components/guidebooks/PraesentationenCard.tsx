"use client";

import { ChevronRight, Presentation } from "lucide-react";

import { Link } from "@/components/Link";
import { PRAESENTATIONEN } from "@/content/praesentationen";

/** Nur für Admins: Präsentationen (Liste in content/praesentationen). */
export function PraesentationenCard() {
  if (PRAESENTATIONEN.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium normal-case tracking-normal text-muted-foreground">
        Präsentationen · nur für Admins
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PRAESENTATIONEN.map((p) => (
          <Link
            key={p.slug}
            href={`/praesentationen/${p.slug}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent"
          >
            <Presentation className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
