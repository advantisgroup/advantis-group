"use client";

import { useState } from "react";

import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { STATE_COLOR } from "@/components/activity/charts/theme";
import type { StateName, StateSegment } from "@/lib/activity/activity";
import { formatDuration } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;
const BAR_HEIGHT = 26;
const CLOCKED_OUT_PATTERN_ID = "state-timeline-clocked-out-hatch";

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Recharts clips text that falls outside the SVG's own viewport, so a plain
 * centred label on the midnight/midnight-next boundary lines gets half its
 * characters cut off. Anchor near the two edges instead of centring there.
 */
function edgeAnchor(pct: number): "start" | "middle" | "end" {
  if (pct <= 4) return "start";
  if (pct >= 96) return "end";
  return "middle";
}

function TimeLabel({
  viewBox,
  value,
  place,
  pct,
  fill,
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
  value: string;
  place: "top" | "bottom";
  pct: number;
  fill: string;
}) {
  if (!viewBox) return null;
  const anchor = edgeAnchor(pct);
  const dx = anchor === "start" ? 4 : anchor === "end" ? -4 : 0;
  const y = place === "top" ? viewBox.y - 6 : viewBox.y + viewBox.height + 14;
  return (
    <text
      x={viewBox.x + dx}
      y={y}
      textAnchor={anchor}
      fontSize={10}
      fill={fill}
    >
      {value}
    </text>
  );
}

/**
 * Recharts-driven replacement for the plain colour-filled div strip: one
 * stacked horizontal bar spanning the 24h day, a segment per contiguous state
 * run. Hovering a segment dims its neighbours, drops a pair of dashed guide
 * lines through the chart at its exact start/end instants, and raises a
 * floating badge with the state + time range. CLOCKED_OUT segments keep their
 * usual colour but are drawn with a diagonal "no-go zone" hatch (the same map
 * convention for a restricted area) since it's always an assumption, never a
 * reported fact.
 */
export function StateTimelineChart({
  segments,
  dayStart,
  label,
  nowPct = null,
  nowLabel,
  className,
}: {
  segments: StateSegment[];
  /** Local midnight (epoch ms) the strip starts at; the strip spans 24h from here. */
  dayStart: number;
  /** Localised label for a state, used in the hover badge. */
  label: (state: StateName) => string;
  /** Percent (0–100) to draw the "now" line, or null to omit it. */
  nowPct?: number | null;
  /** Label for the now marker. */
  nowLabel?: string;
  className?: string;
}) {
  const { lang } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);

  if (segments.length === 0) return null;

  const row: Record<string, number> = {};
  segments.forEach((seg, i) => {
    row[`seg${i}`] = Math.max(0, seg.end - seg.start);
  });
  const data = [{ lane: "day", ...row }];

  // `segments` can change out from under a stale hovered index (e.g. a day
  // switch) — an out-of-range lookup just yields undefined, which already
  // disables the badge/guide-lines below, so no extra reset is needed.
  const hoveredSeg = hovered != null ? segments[hovered] : null;
  const startPct = hoveredSeg
    ? ((hoveredSeg.start - dayStart) / DAY_MS) * 100
    : null;
  const endPct = hoveredSeg
    ? ((hoveredSeg.end - dayStart) / DAY_MS) * 100
    : null;
  const centerPct =
    startPct != null && endPct != null ? (startPct + endPct) / 2 : null;

  return (
    <div className={cn("state-timeline relative", className)}>
      {hoveredSeg && centerPct != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs"
          style={{
            left: `${Math.min(97, Math.max(3, centerPct))}%`,
            background: "var(--chart-panel)",
            borderColor: "var(--chart-grid)",
            color: "var(--chart-fg)",
            boxShadow: "var(--chart-tooltip-shadow)",
          }}
        >
          <p className="font-semibold">{label(hoveredSeg.state)}</p>
          <p className="tabular-nums text-[11px] text-muted-foreground">
            {hhmm(hoveredSeg.start)}–{hhmm(hoveredSeg.end)} ·{" "}
            {formatDuration((hoveredSeg.end - hoveredSeg.start) / 1000, lang)}
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={100}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 30, right: 6, bottom: 26, left: 6 }}
        >
          <defs>
            {/* Diagonal "no-go zone" hatch — same map convention as a
                restricted-area overlay — over the state's own colour. */}
            <pattern
              id={CLOCKED_OUT_PATTERN_ID}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={6} height={6} fill={STATE_COLOR.CLOCKED_OUT} />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                stroke="var(--chart-panel)"
                strokeWidth={2.5}
              />
            </pattern>
          </defs>

          <XAxis type="number" domain={[0, DAY_MS]} hide />
          <YAxis type="category" dataKey="lane" hide />

          {segments.map((seg, i) => (
            <Bar
              key={i}
              dataKey={`seg${i}`}
              stackId="day"
              maxBarSize={BAR_HEIGHT}
              isAnimationActive
              animationDuration={420}
              animationEasing="ease-out"
              fill={
                seg.state === "CLOCKED_OUT"
                  ? `url(#${CLOCKED_OUT_PATTERN_ID})`
                  : STATE_COLOR[seg.state]
              }
              fillOpacity={hovered == null || hovered === i ? 1 : 0.4}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered(h => (h === i ? null : i))}
            />
          ))}

          {hoveredSeg && startPct != null && (
            <ReferenceLine
              x={hoveredSeg.start - dayStart}
              stroke="var(--chart-axis)"
              strokeDasharray="2 3"
              label={
                <TimeLabel
                  value={hhmm(hoveredSeg.start)}
                  place="top"
                  pct={startPct}
                  fill="var(--chart-axis)"
                />
              }
            />
          )}
          {hoveredSeg && endPct != null && (
            <ReferenceLine
              x={hoveredSeg.end - dayStart}
              stroke="var(--chart-axis)"
              strokeDasharray="2 3"
              label={
                <TimeLabel
                  value={hhmm(hoveredSeg.end)}
                  place="bottom"
                  pct={endPct}
                  fill="var(--chart-axis)"
                />
              }
            />
          )}

          {nowPct != null && nowPct >= 0 && nowPct <= 100 && (
            <ReferenceLine
              x={(nowPct / 100) * DAY_MS}
              stroke="var(--chart-fg)"
              label={
                nowLabel ? (
                  <TimeLabel
                    value={nowLabel}
                    place="top"
                    pct={nowPct}
                    fill="var(--chart-fg)"
                  />
                ) : undefined
              }
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      {/* Hour ticks: 00, 06, 12, 18, 24 */}
      <div className="-mt-4 flex justify-between font-mono text-[10px] text-muted-foreground">
        {[0, 6, 12, 18, 24].map(h => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}
