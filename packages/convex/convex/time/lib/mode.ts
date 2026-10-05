import { ConvexError } from "convex/values";

import { type Caller } from "../../lib/caller";

/**
 * Test mode for the Zeiterfassung before go-live.
 *
 * - `TIME_MODE` (Convex env): anything but `"live"` means test mode — the
 *   safe default, so a fresh deployment never exposes the module.
 * - `TIME_TESTERS` (Convex env): comma/space separated emails of the people
 *   who may use the module while it is in test mode. Unset = nobody.
 *
 * In test mode only testers can call any `time.*` function, admin
 * notifications go to the testers instead of the real admins, the directory
 * "Im Büro" signal stays empty, and `time.mode.purgeTestData` can wipe
 * everything the tests created. Switching to `TIME_MODE=live` is part of the
 * cutover checklist in docs/future-features/04a_zeiterfassung-spec.md.
 */
export function isTimeTestMode(): boolean {
  return (process.env.TIME_MODE ?? "test").trim().toLowerCase() !== "live";
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

/** Whether this caller may use the module right now. */
export function canUseTime(caller: Caller): boolean {
  return !isTimeTestMode() || isTimeTester(caller.user.email);
}

/** First line of every public `time.*` handler. */
export function assertTimeAccess(ctx: { caller: Caller }): void {
  if (!canUseTime(ctx.caller)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "time_test_mode",
      message: "Die Zeiterfassung ist noch im Testmodus.",
    });
  }
}
