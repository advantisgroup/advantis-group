import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { businessDayOf } from "./businessHours";

/**
 * Cross-integration helpers shared by the Genesys and Clockodo clients and the
 * poll orchestrator. No Convex functions / no "use node" so the per-source
 * clients stay focused.
 */

/** The server-to-server secret guarding every `activity.state.*` write. */
export function signalSecret(): string {
  const s = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!s) throw new Error("ACTIVITYTRACK_SIGNAL_SECRET is not configured");
  return s;
}

/** Classify a thrown error as a missing-config vs a transient outage. */
export function healthStatusOf(err: unknown): "unavailable" | "unconfigured" {
  const msg = err instanceof Error ? err.message : String(err);
  return /not configured|not set/i.test(msg) ? "unconfigured" : "unavailable";
}

export const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Today as YYYY-MM-DD in the *business* timezone — NOT UTC. The Clockodo
 * poller keys its whole "worked today / clocked out" derivation on this; when
 * it was UTC, the day flipped at 00:00 UTC (02:00 Berlin in summer), the
 * entries window emptied, and everyone's overnight CLOCKED_OUT was erased —
 * the state engine then fell through to ACTIVE at exactly 02:00.
 */
export const today = () => businessDayOf(Date.now());

/** The external-id map for every active person, as returned by `state.mappings`. */
export interface Mapping {
  employeeId: string;
  genesysUserId: string | null;
  clockodoUserId: string | null;
}

/**
 * Report an integration source's health. Informational only — a failure here
 * never blocks or rolls back the signal it accompanies.
 */
export async function reportHealth(
  ctx: ActionCtx,
  source: "genesys" | "clockodo",
  status: "ok" | "unavailable" | "unconfigured",
  message?: string
): Promise<void> {
  try {
    await ctx.runMutation(api.activity.state.reportHealth, {
      secret: signalSecret(),
      source,
      status,
      message: message?.slice(0, 300),
    });
  } catch {
    // health is informational; never let it break the poll
  }
}
