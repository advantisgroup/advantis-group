import { mutation, query } from "../functions";
import { v } from "convex/values";

import { requireManager, requireUser } from "../lib/auth";

const DEFAULTS = {
  targetResponseDays: 3,
  warnResponseDays: 7,
  defaultDueDays: 14,
  defaultMeasureDueDays: 7,
};

/** Singleton Stammdaten thresholds — defaults when no row has been saved yet. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
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

export const update = mutation({
  args: {
    targetResponseDays: v.number(),
    warnResponseDays: v.number(),
    defaultDueDays: v.number(),
    defaultMeasureDueDays: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireManager(ctx);
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

export const DEFAULT_THRESHOLDS = DEFAULTS;
