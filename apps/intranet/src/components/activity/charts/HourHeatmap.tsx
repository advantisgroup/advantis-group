"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Bucket {
  hour: number;
  ratio: number;
  total: number;
}

/**
 * 24-cell strip showing the share of samples that were active in each hour of
 * the day. Brighter accent = more active. Empty hours render faint.
 */
export function HourHeatmap({ data }: { data: Bucket[] }) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
          {data.map((b) => {
            const empty = b.total === 0;
            const opacity = empty ? 0.06 : 0.18 + b.ratio * 0.82;
            return (
              <Tooltip key={b.hour}>
                <TooltipTrigger asChild>
                  <div
                    className="aspect-square rounded-sm ring-1 ring-inset ring-border/40 transition-transform hover:scale-110"
                    style={{
                      // Green (= active) at varying strength; CSS variables resolve
                      // per theme, so the strip recolours in light/dark.
                      backgroundColor: empty
                        ? "color-mix(in oklch, var(--muted-foreground) 12%, transparent)"
                        : `color-mix(in oklch, var(--ok) ${(opacity * 100).toFixed(1)}%, transparent)`,
                    }}
                    aria-label={`${b.hour}:00 — ${Math.round(b.ratio * 100)}%`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {String(b.hour).padStart(2, "0")}:00 ·{" "}
                  {empty ? "—" : `${Math.round(b.ratio * 100)}%`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
