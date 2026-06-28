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

/** Per-state colours for the fused-state breakdown (idle/in-call/break/…). */
export const STATE_COLOR = {
  ACTIVE: "#C8F05A", // signal lime
  IN_CALL: "#5CD0DE", // cool cyan
  WRAP_UP: "#B69CFF", // violet (after-call work)
  IDLE: "#F5B544", // amber
  BREAK: "#7C8696", // muted slate
  ABSENT: "#4A5566", // dim slate
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
