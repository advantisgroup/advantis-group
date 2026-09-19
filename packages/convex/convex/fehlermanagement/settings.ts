import { query, userMutation, userQuery } from "../functions";
import { v } from "convex/values";
import { DEFAULTS } from "./lib/thresholds";

/** Singleton Stammdaten thresholds — defaults when no row has been saved yet. */
export const get = userQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("errorSettings").first();
    return row
      ? {
          targetResponseDays: row.targetResponseDays,
          warnResponseDays: row.warnResponseDays,
          defaultDueDays: row.defaultDueDays,
          defaultMeasureDueDays: row.defaultMeasureDueDays,
        }
      : DEFAULTS;
  },
});

export const update = userMutation({
  role: "manager",
  args: {
    targetResponseDays: v.number(),
    warnResponseDays: v.number(),
    defaultDueDays: v.number(),
    defaultMeasureDueDays: v.number(),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const row = await ctx.db.query("errorSettings").first();
    const patch = { ...args, updatedByUserId: user._id, updatedAt: Date.now() };
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert("errorSettings", patch);
    }
    return { ok: true };
  },
});
