"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function Glossary({ terms }: { terms: [string, string][] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(term: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">Tippe auf einen Begriff.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {terms.map(([term, definition]) => (
          <button
            key={term}
            type="button"
            onClick={() => toggle(term)}
            className={cn(
              "rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-ring/50",
              open.has(term) &&
                "border-primary/50 bg-primary/5 refreshed:border-foreground/25 refreshed:bg-muted/40",
            )}
          >
            <span className="text-sm font-semibold">{term}</span>
            {open.has(term) ? (
              <span className="mt-1 block text-xs text-muted-foreground">{definition}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
