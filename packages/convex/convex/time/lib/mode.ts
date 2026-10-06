import { ConvexError } from "convex/values";

import { type Caller } from "../../lib/caller";

/**
 * Rollout stages of the Zeiterfassung, set with `TIME_MODE` (Convex env):
 *
 * - `test` (default, anything unknown): only admins and `TIME_TESTERS` see
 *   the module; everyone else gets the maintenance screen.
 * - `preview`: everyone sees the module and their own data. Nobody clocks
 *   (Clockodo still is the record), employees can't file anything, admins can
 *   still manage (import, schedules, corrections). Used for the days before
 *   go-live; `TIME_LIVE_FROM` (ISO date) is the start date the intranet
 *   announces.
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
export function canWriteTime(caller: Caller): boolean {
  return timeMode() === "live" || caller.isAdmin || isTimeTester(caller.user.email);
}

/** Whether this caller may clock in/out. Nobody in preview. */
export function canClockTime(caller: Caller): boolean {
  const mode = timeMode();
  if (mode === "live") return true;
  return mode === "test" && (caller.isAdmin || isTimeTester(caller.user.email));
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

/** First line of every public `time.*` mutation (clocking: `assertTimeClock`). */
export function assertTimeWrite(ctx: { caller: Caller }): void {
  assertTimeAccess(ctx);
  if (!canWriteTime(ctx.caller)) throw previewError();
}

/** First line of the clock-in/out mutations. */
export function assertTimeClock(ctx: { caller: Caller }): void {
  assertTimeAccess(ctx);
  if (!canClockTime(ctx.caller)) throw previewError();
}
