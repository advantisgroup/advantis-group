"use client";

import { cn } from "@/lib/utils";

export interface CountTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * The main split of a list page (All / Open / Closed …) with how many rows sit
 * behind each tab, so switching never lands on a surprise empty state. Not a
 * `RouteTabs` — these filter one page, they don't navigate — so they stay
 * in-page on mobile and scroll sideways instead of moving to the bottom nav.
 */
export function CountTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: CountTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-5 overflow-x-auto border-b border-border/70 [scrollbar-width:none]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] tabular-nums transition-colors",
                  active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
