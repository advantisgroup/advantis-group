import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import { canUseTime, isTimeTestMode } from "./lib/mode";

/** What the intranet needs to decide whether to show the module at all. */
export const status = userQuery({
  args: {},
  handler: async (ctx) => ({
    testMode: isTimeTestMode(),
    canUse: canUseTime(ctx.caller),
  }),
});

/**
 * Everything the module stores except holidays. Test mode only — after
 * go-live this refuses, so real working-time records can never be wiped
 * from the UI.
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
    if (!isTimeTestMode() || !canUseTime(ctx.caller)) {
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
