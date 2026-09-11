import type { CSSProperties, ReactNode } from "react";

import { History } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TimelineEntry {
  key: string;
  title: ReactNode;
  meta?: ReactNode;
}

/**
 * A history, newest first. The line only runs node to node — not per row
 * border — so it never shows a seam where rows differ in height, and the top
 * node carries `accent` so the current state reads without scanning the list.
 */
export function Timeline({
  entries,
  accent = "var(--primary)",
  className,
}: {
  entries: TimelineEntry[];
  accent?: string;
  className?: string;
}) {
  return (
    <ol
      className={cn("space-y-3", className)}
      style={{ "--timeline-accent": accent } as CSSProperties}
    >
      {entries.map((entry, index) => (
        <li key={entry.key} className="relative grid grid-cols-[0.875rem_minmax(0,1fr)] gap-3">
          {index < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute -bottom-3.5 left-[6.5px] top-[18px] w-px bg-gradient-to-b from-border to-border/50"
            />
          )}
          <span
            aria-hidden
            className={cn(
              "relative mt-[5px] ml-[2.5px] size-[9px] rounded-full border-2",
              index === 0
                ? "border-[var(--timeline-accent)] bg-[var(--timeline-accent)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--timeline-accent)_20%,transparent)]"
                : "border-border bg-card",
            )}
          />
          <div className="min-w-0">
            <p className="text-sm leading-5">{entry.title}</p>
            {entry.meta && <p className="text-xs text-muted-foreground">{entry.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The order hint for a timeline's section header, so "top = newest" is never a guess. */
export function TimelineOrder({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
      <History className="size-3" />
      {label}
    </span>
  );
}
