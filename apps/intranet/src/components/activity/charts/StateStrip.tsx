"use client";

import { STATE_COLOR } from "@/components/charts/theme";
import type { StateName, StateSegment } from "@/lib/activity/activity";
import { hhmm } from "@/lib/activity/fmt";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

/**
 * A horizontal, colour-coded day strip: one block per contiguous state run,
 * positioned across a fixed 24-hour window starting at `dayStart`, with hour
 * ticks (00/06/12/18/24) and an optional "now" marker. Shared by the device
 * timeline's "right now" card and the Day-in-detail tab so the strip looks and
 * behaves identically in both. Hover any block to read its time range + state.
 */
export function StateStrip({
  segments,
  dayStart,
  label,
  nowPct = null,
  nowLabel,
  compact = false,
  className,
}: {
  segments: StateSegment[];
  /** Local midnight (epoch ms) the strip starts at; the strip spans 24h from here. */
  dayStart: number;
  /** Localised label for a state, used in the hover title. */
  label: (state: StateName) => string;
  /** Percent (0–100) to draw the "now" line, or null to omit it. */
  nowPct?: number | null;
  /** Hover title for the now marker. */
  nowLabel?: string;
  /** Slim, tick-less variant for the overview cards. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          "relative w-full overflow-hidden bg-panel-2",
          compact ? "h-2 rounded-full" : "h-7 rounded-md border border-border",
        )}
      >
        {segments.map((seg, i) => {
          const left = ((seg.start - dayStart) / DAY_MS) * 100;
          const width = ((seg.end - seg.start) / DAY_MS) * 100;
          return (
            <div
              key={i}
              className="absolute inset-y-0"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: STATE_COLOR[seg.state],
              }}
              title={`${hhmm(seg.start)}–${hhmm(seg.end)} · ${label(seg.state)}`}
            />
          );
        })}
        {nowPct != null && nowPct >= 0 && nowPct <= 100 && (
          <div
            className="absolute inset-y-0 w-px bg-fg"
            style={{ left: `${nowPct}%` }}
            title={nowLabel}
          />
        )}
      </div>
      {/* Hour ticks: 00, 06, 12, 18, 24 */}
      {!compact && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact legend for a strip — only the states that actually appear in it. */
export function StateStripLegend({
  states,
  label,
  className,
}: {
  states: StateName[];
  label: (state: StateName) => string;
  className?: string;
}) {
  if (states.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: STATE_COLOR[s] }} />
          {label(s)}
        </span>
      ))}
    </div>
  );
}
