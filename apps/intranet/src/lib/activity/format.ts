/**
 * ActivityTrack formatting helpers, ported and reconciled with the intranet's
 * design tokens.
 *
 * State→color/badge mapping lives in a single place —
 * `components/activity/state/StateBits.tsx`'s `STATE_STYLE` — not here.
 * A previous copy of that mapping used to live in this file and disagreed
 * with `STATE_STYLE` on ABSENT/IDLE; it was dead code (never imported) but a
 * landmine for the next person who reached for the obviously-named helper.
 * Reach for `STATE_STYLE` instead of adding another copy here.
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

export type BadgeVariant = "default" | "destructive" | "success" | "warning" | "muted";
