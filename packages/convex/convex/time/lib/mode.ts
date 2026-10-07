import { ConvexError } from "convex/values";

import { type QueryCtx } from "../../_generated/server";
import { type Caller } from "../../lib/caller";
import { berlinDate } from "./berlin";

/**
 * Rollout stages of the Zeiterfassung, set with `TIME_MODE` (Convex env):
 *
 * - `test` (default, anything unknown): only admins and `TIME_TESTERS` see
 *   the module; everyone else gets the maintenance screen.
 * - `preview`: everyone sees the module and their own data. Nobody clocks
 *   (Clockodo still is the record), employees can't file anything, admins can
 *   still manage (import, schedules, corrections). Used for the days before
 *   go-live; `TIME_LIVE_FROM` (ISO date) is the start date the intranet
 *   announces. People with early access (`timeProfiles.earlyAccessFrom`,
 *   set per person in Verwaltung) use it as if live from that date on.
 * - `live`: everyone uses it.
 *
 * Until `live`, admin notifications also reach the testers, the directory
 * "Im Büro" signal stays empty, and `time.mode.purgeTestData` can wipe what
 * the tests created. Switching to `TIME_MODE=live` is part of the cutover
 * checklist in docs/future-features/04a_zeiterfassung-spec.md.
 */
export type TimeMode = "test" | "preview" | "live";

export function timeMode(): TimeMode {
  const value = (process.env.TIME_MODE ?? "test").trim().toLowerCase();
  return value === "live" || value === "preview" ? value : "test";
}

/** Anything before go-live (test and preview). */
export function isTimeTestMode(): boolean {
  return timeMode() !== "live";
}

/** Announced start date (`TIME_LIVE_FROM`, YYYY-MM-DD), if set. */
export function timeLiveFrom(): string | null {
  const value = (process.env.TIME_LIVE_FROM ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function timeTesterEmails(): string[] {
  return (process.env.TIME_TESTERS ?? "")
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isTimeTester(email: string | undefined | null): boolean {
  if (!email) return false;
  return timeTesterEmails().includes(email.toLowerCase());
}

/** Whether this caller may open the module (and read their own data). */
export function canUseTime(caller: Caller): boolean {
  return timeMode() !== "test" || caller.isAdmin || isTimeTester(caller.user.email);
}

/** Whether this caller may change anything besides clocking. */
export function canWriteTime(caller: Caller, early = false): boolean {
  const mode = timeMode();
  if (mode === "live" || caller.isAdmin || isTimeTester(caller.user.email)) return true;
  return mode === "preview" && early;
}

/** Whether this caller may clock in/out. In preview only with early access. */
export function canClockTime(caller: Caller, early = false): boolean {
  const mode = timeMode();
  if (mode === "live") return true;
  if (mode === "preview") return early;
  return caller.isAdmin || isTimeTester(caller.user.email);
}

/** Whether this person's early access (if any) has started. */
export async function hasEarlyAccess(ctx: {
  caller: Caller;
  db: QueryCtx["db"];
}): Promise<boolean> {
  if (timeMode() !== "preview") return false;
  const row = await ctx.db
    .query("timeProfiles")
    .withIndex("by_user", (q) => q.eq("userId", ctx.caller.id))
    .unique();
  return !!row?.earlyAccessFrom && row.earlyAccessFrom <= berlinDate(Date.now());
}

/** First line of every public `time.*` query. */
export function assertTimeAccess(ctx: { caller: Caller }): void {
  if (!canUseTime(ctx.caller)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "time_test_mode",
      message: "Die Zeiterfassung ist noch im Testmodus.",
    });
  }
}

function previewError() {
  return new ConvexError({
    code: "forbidden",
    reason: "time_preview",
    message: "Die Zeiterfassung ist noch in der Vorschau – das geht erst ab dem Start.",
  });
}

type GuardCtx = { caller: Caller; db: QueryCtx["db"] };

/** First line of every public `time.*` mutation (clocking: `assertTimeClock`). */
export async function assertTimeWrite(ctx: GuardCtx): Promise<void> {
  assertTimeAccess(ctx);
  if (canWriteTime(ctx.caller)) return;
  if (!canWriteTime(ctx.caller, await hasEarlyAccess(ctx))) throw previewError();
}

/** First line of the clock-in/out mutations. */
export async function assertTimeClock(ctx: GuardCtx): Promise<void> {
  assertTimeAccess(ctx);
  if (canClockTime(ctx.caller)) return;
  if (!canClockTime(ctx.caller, await hasEarlyAccess(ctx))) throw previewError();
}
