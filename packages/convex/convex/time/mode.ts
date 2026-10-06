import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import {
  canClockTime,
  canUseTime,
  canWriteTime,
  hasEarlyAccess,
  timeLiveFrom,
  timeMode,
} from "./lib/mode";
import { isTrackingDisabled } from "./lib/store";

/** What the intranet needs to decide whether to show the module at all. */
export const status = userQuery({
  args: {},
  handler: async (ctx) => {
    const early = await hasEarlyAccess(ctx);
    return {
      /** Test stage (only admins and testers get in). */
      testMode: timeMode() === "test",
      /** Preview stage: everyone looks, nobody clocks yet. */
      preview: timeMode() === "preview",
      /** Announced go-live date (YYYY-MM-DD), if configured. */
      liveFrom: timeLiveFrom(),
      /** Uses the module already during the preview. */
      earlyAccess: early,
      canUse: canUseTime(ctx.caller),
      /** May file requests / corrections (admins: manage). */
      canWrite: canWriteTime(ctx.caller, early),
      /** May clock in and out. */
      canClock: canClockTime(ctx.caller, early),
      /** False for people who don't record working time (no clock, no prompt). */
      tracking: !(await isTrackingDisabled(ctx, ctx.caller.id)),
    };
  },
});

/**
 * Everything the module stores except holidays. Test stage only — in preview
 * (imported Clockodo data) and after go-live this refuses, so real
 * working-time records can never be wiped from the UI.
 */
const PURGEABLE = [
  "timeEntries",
  "timeAbsences",
  "workSchedules",
  "vacationAllowances",
  "timeBalances",
  "timeMonthTotals",
  "monthLocks",
  "timeAuditLog",
] as const;

const BATCH = 200;

/** Deletes one batch; the intranet calls it until `done`. */
export const purgeTestData = userMutation({
  args: { confirm: v.literal("TESTDATEN LÖSCHEN") },
  handler: async (ctx) => {
    if (timeMode() !== "test" || !canWriteTime(ctx.caller)) {
      throw new ConvexError({
        code: "forbidden",
        reason: "time_not_test_mode",
        message: "Testdaten können nur im Testmodus von Testern gelöscht werden.",
      });
    }
    let deleted = 0;
    for (const table of PURGEABLE) {
      const rows = await ctx.unfilteredDb.query(table).take(BATCH - deleted);
      for (const row of rows) {
        await ctx.unfilteredDb.delete(row._id);
      }
      deleted += rows.length;
      if (deleted >= BATCH) return { deleted, done: false };
    }
    return { deleted, done: true };
  },
});
