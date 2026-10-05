/**
 * Shared chart colours. Each token resolves to a CSS variable (defined per theme
 * in globals.css), so charts recolour automatically in light/dark — Recharts
 * passes these straight through as SVG stroke/fill, which accept `var()`.
 */
export const CHART = {
  active: "var(--chart-active)", // green (= working/ok)
  idle: "var(--chart-idle)", // amber (= idle/warn)
  accent: "var(--chart-accent)", // brand blue
  info: "var(--chart-info)", // secondary cool series
  grid: "var(--chart-grid)", // border
  axis: "var(--chart-axis)", // muted
  panel: "var(--chart-panel)",
  fg: "var(--chart-fg)",
} as const;

/**
 * Per-state colours for the fused-state breakdown (idle/in-call/break/…).
 * CSS variables (defined per theme in globals.css) so strips and stacked bars
 * recolour with light/dark instead of the old fixed ActivityTrack hexes that
 * clashed with the intranet palette. The four chromatic states are
 * CVD-validated per mode; BREAK/ABSENT are intentionally recessive greys.
 */
export const STATE_COLOR = {
  ACTIVE: "var(--state-active)", // green (= working)
  IN_CALL: "var(--state-incall)", // blue (telephony)
  WRAP_UP: "var(--state-wrapup)", // violet (after-call work)
  IDLE: "var(--state-idle)", // amber (attention)
  BREAK: "var(--state-break)", // muted (legitimate pause)
  CLOCKED_OUT: "var(--state-clockedout)", // dim (assumed done for the day)
  ABSENT: "var(--state-absent)", // dimmest (not expected in)
} as const;

/** Common tooltip styling props for Recharts <Tooltip />. */
export const tooltipStyle = {
  contentStyle: {
    background: "var(--chart-panel)",
    border: "1px solid var(--chart-grid)",
    borderRadius: "0.75rem",
    padding: "8px 12px",
    color: "var(--chart-fg)",
    fontSize: "0.75rem",
    fontFamily: "var(--font-sans)",
    boxShadow: "var(--chart-tooltip-shadow)",
  },
  labelStyle: { color: "var(--chart-axis)", fontWeight: 600, marginBottom: 2 },
  itemStyle: { padding: "1px 0" },
  cursor: { fill: "var(--chart-cursor)", radius: 6 },
} as const;
