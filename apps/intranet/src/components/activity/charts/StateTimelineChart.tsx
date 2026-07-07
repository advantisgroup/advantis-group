"use client";

import { useState, type ReactNode } from "react";

import { STATE_COLOR } from "@/components/activity/charts/theme";
import type { StateName, StateSegment } from "@/lib/activity/activity";
import { formatDuration } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

const BAR_HEIGHT = 26;
// How far above/below the bar the active guide lines and their time labels
// reach — enough room for a label plus a little breathing space.
const GUIDE_REACH = 20;

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Which segment sits under a given pointer X, by position rather than by
 * which of several overlapping DOM hit-targets happens to be on top — a
 * one-minute blip a few pixels wide is exactly as tappable as an hour-long
 * one, on touch or with a mouse, with no risk of a neighbour shadowing it.
 */
function segmentAtClientX(
  clientX: number,
  rect: { left: number; width: number },
  segments: StateSegment[],
  domainStart: number,
  domainSpan: number
): number | null {
  if (rect.width === 0 || domainSpan <= 0) return null;
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  // -1ms so a tap at the very right edge still lands inside the last segment
  // instead of exactly on its (exclusive) end boundary.
  const t = domainStart + pct * domainSpan - 1;
  const idx = segments.findIndex(s => t >= s.start && t < s.end);
  return idx >= 0 ? idx : null;
}

/**
 * A centred (translateX(-50%)) label near either edge overflows a narrow
 * (phone-width) container, since it grows equally in both directions off a
 * clamped anchor point. Past the threshold, anchor to that side instead so it
 * only grows inward.
 */
function edgeAnchor(pct: number): { left: string; transform: string } {
  const left = `${Math.min(97, Math.max(3, pct))}%`;
  if (pct <= 15) return { left, transform: "translateX(0)" };
  if (pct >= 85) return { left, transform: "translateX(-100%)" };
  return { left, transform: "translateX(-50%)" };
}

function GuideLine({ pct }: { pct: number }) {
  return (
    <div
      className="absolute w-px"
      style={{
        left: `${pct}%`,
        top: -GUIDE_REACH,
        bottom: -GUIDE_REACH,
        background: "var(--chart-axis)",
      }}
    />
  );
}

function TimeLabel({
  pct,
  place,
  children,
  color = "var(--chart-axis)",
}: {
  pct: number;
  place: "top" | "bottom";
  children: ReactNode;
  color?: string;
}) {
  const { left, transform } = edgeAnchor(pct);
  return (
    <span
      className="absolute whitespace-nowrap font-mono text-[10px]"
      style={{
        left,
        transform,
        [place === "top" ? "bottom" : "top"]: BAR_HEIGHT + 6,
        color,
      }}
    >
      {children}
    </span>
  );
}

/**
 * "Quick timeline" for the tracked part of the day: one horizontal bar
 * spanning from the day's first known state to its last — not a fixed 24h
 * strip — so a day that's only a few hours old (or one where tracking
 * stopped early) fills the whole width instead of sitting as a sliver in a
 * mostly-empty bar. As more of the day is tracked, the bar simply grows to
 * match; a CLOCKED_OUT stretch at the end takes up exactly its share like
 * any other segment. Hovering (or externally highlighting, via
 * `highlightAt`) a segment dims its neighbours, drops a pair of solid guide
 * lines through the bar at its exact start/end instants (labelled with the
 * time), and raises a floating badge with the state name, time range and
 * duration. CLOCKED_OUT segments keep their usual colour but are drawn with
 * a diagonal "no-go zone" hatch — the same convention maps use for a
 * restricted area — since it's always an assumption, never a reported fact.
 */
export function StateTimelineChart({
  segments,
  label,
  highlightAt = null,
  className,
}: {
  segments: StateSegment[];
  /** Localised label for a state, used in the hover badge. */
  label: (state: StateName) => string;
  /**
   * Epoch ms of a moment to highlight even without a mouse hovering it — e.g.
   * a "state changes" list item the user clicked elsewhere on the page. A
   * live mouse hover always takes precedence over this.
   */
  highlightAt?: number | null;
  className?: string;
}) {
  const { lang } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);

  if (segments.length === 0) return null;

  const domainStart = segments[0].start;
  const domainEnd = segments[segments.length - 1].end;
  const domainSpan = Math.max(1, domainEnd - domainStart);
  const domainMid = domainStart + domainSpan / 2;

  const highlightedIndex =
    highlightAt != null
      ? segments.findIndex(s => highlightAt >= s.start && highlightAt < s.end)
      : -1;
  // `segments` can change out from under a stale hovered index (e.g. a day
  // switch) — an out-of-range lookup just yields undefined, which already
  // disables the badge/guide-lines below, so no extra reset is needed.
  const activeIndex =
    hovered ?? (highlightedIndex >= 0 ? highlightedIndex : null);
  const activeSeg = activeIndex != null ? segments[activeIndex] : null;
  const startPct = activeSeg
    ? ((activeSeg.start - domainStart) / domainSpan) * 100
    : null;
  const endPct = activeSeg
    ? ((activeSeg.end - domainStart) / domainSpan) * 100
    : null;
  const centerPct =
    startPct != null && endPct != null ? (startPct + endPct) / 2 : null;
  const badgeAnchor = centerPct != null ? edgeAnchor(centerPct) : null;

  return (
    <div
      className={cn("state-timeline relative", className)}
      style={{ paddingTop: GUIDE_REACH + 4, paddingBottom: GUIDE_REACH + 4 }}
    >
      {activeSeg && badgeAnchor && (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs"
          style={{
            left: badgeAnchor.left,
            transform: `${badgeAnchor.transform} translateY(-100%)`,
            background: "var(--chart-panel)",
            borderColor: "var(--chart-grid)",
            color: "var(--chart-fg)",
            boxShadow: "var(--chart-tooltip-shadow)",
          }}
        >
          <p className="font-semibold">{label(activeSeg.state)}</p>
          <p className="tabular-nums text-[11px] text-muted-foreground">
            {hhmm(activeSeg.start)}–{hhmm(activeSeg.end)} ·{" "}
            {formatDuration((activeSeg.end - activeSeg.start) / 1000, lang)}
          </p>
        </div>
      )}

      <div
        className="relative cursor-pointer"
        style={{ height: BAR_HEIGHT }}
        onMouseMove={e =>
          setHovered(
            segmentAtClientX(
              e.clientX,
              e.currentTarget.getBoundingClientRect(),
              segments,
              domainStart,
              domainSpan
            )
          )
        }
        onMouseLeave={() => setHovered(null)}
        onClick={e =>
          setHovered(
            segmentAtClientX(
              e.clientX,
              e.currentTarget.getBoundingClientRect(),
              segments,
              domainStart,
              domainSpan
            )
          )
        }
      >
        {/* Clipped separately from the guide lines/labels below, which need
            to poke out above and below this rounded strip. */}
        <div className="absolute inset-0 overflow-hidden rounded-md border border-border">
          {segments.map((seg, i) => {
            const left = ((seg.start - domainStart) / domainSpan) * 100;
            const width = ((seg.end - seg.start) / domainSpan) * 100;
            const isClockedOut = seg.state === "CLOCKED_OUT";
            return (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  opacity: activeIndex == null || activeIndex === i ? 1 : 0.4,
                  filter: activeIndex === i ? "brightness(1.1)" : undefined,
                  transition: "opacity 150ms ease, filter 150ms ease",
                  background: isClockedOut
                    ? `repeating-linear-gradient(45deg, ${STATE_COLOR.CLOCKED_OUT} 0px 13px, color-mix(in oklch, var(--chart-panel) 55%, ${STATE_COLOR.CLOCKED_OUT}) 13px 14.5px)`
                    : STATE_COLOR[seg.state],
                }}
              />
            );
          })}
        </div>

        {activeSeg && startPct != null && (
          <>
            <GuideLine pct={startPct} />
            <TimeLabel pct={startPct} place="top">
              {hhmm(activeSeg.start)}
            </TimeLabel>
          </>
        )}
        {activeSeg && endPct != null && (
          <>
            <GuideLine pct={endPct} />
            <TimeLabel pct={endPct} place="bottom">
              {hhmm(activeSeg.end)}
            </TimeLabel>
          </>
        )}
      </div>

      {/* The tracked window's start, middle and end — not fixed day hours,
          since the bar itself is rescaled to just this span. */}
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{hhmm(domainStart)}</span>
        <span>{hhmm(domainMid)}</span>
        <span>{hhmm(domainEnd)}</span>
      </div>
    </div>
  );
}
