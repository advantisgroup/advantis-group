/**
 * ActivityTrack formatting helpers, ported and reconciled with the intranet's
 * design tokens. State colours map to the intranet's semantic shadcn badge
 * variants (no ActivityTrack `--c-*` tokens carried over).
 */

/** Fused employee states (mirrors the Convex `employeeStates.finalState` union). */
export const EMPLOYEE_STATES = [
  "ABSENT",
  "CLOCKED_OUT",
  "BREAK",
  "IN_CALL",
  "WRAP_UP",
  "ACTIVE",
  "IDLE",
] as const;
export type EmployeeState = (typeof EMPLOYEE_STATES)[number];

/** Compact duration from seconds, e.g. "3h 42m", "12m", "—". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export type BadgeVariant = "default" | "destructive" | "success" | "warning" | "muted";

/** Map a fused employee state to a semantic intranet badge variant. */
export function stateBadgeVariant(state: EmployeeState | null | undefined): BadgeVariant {
  switch (state) {
    case "ACTIVE":
      return "success";
    case "IN_CALL":
      return "default";
    case "WRAP_UP":
    case "BREAK":
      return "warning";
    case "ABSENT":
      return "destructive";
    case "CLOCKED_OUT":
    case "IDLE":
    default:
      return "muted";
  }
}

/** A CSS variable colour for charts, derived from the same semantic tokens. */
export function stateChartColor(state: string): string {
  switch (state) {
    case "ACTIVE":
      return "var(--color-success, var(--primary))";
    case "IN_CALL":
      return "var(--primary)";
    case "WRAP_UP":
    case "BREAK":
      return "var(--color-warning, var(--primary))";
    case "ABSENT":
      return "var(--destructive)";
    case "CLOCKED_OUT":
    case "IDLE":
    default:
      return "var(--muted-foreground)";
  }
}

/** Online/offline badge variant. */
export function onlineBadgeVariant(online: boolean): BadgeVariant {
  return online ? "success" : "muted";
}
