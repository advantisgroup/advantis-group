import { v } from "convex/values";

import { query } from "../functions";
import { safeEqual } from "./lib/crypto";
import { appError } from "../lib/errors";

/**
 * Secret-guarded, read-only paginated export of an ActivityTrack table.
 *
 * The migration action (running on the NEW advantis deployment) calls this on
 * the OLD ActivityTrack deployment via a Convex HTTP client to stream rows out
 * batch-by-batch with a resumable cursor. It is also present on the new
 * deployment (harmless) so the migration tooling can be smoke-tested locally.
 *
 * Deploy note: ActivityTrack's old deployment named its settings table
 * `settings` (not `activitySettings`). When deploying this module to the OLD
 * deployment to run the migration, change the `activitySettings` case below to
 * `settings`. Every other migrated table name is identical across both.
 */
const EXPORTABLE = v.union(
  v.literal("people"),
  v.literal("devices"),
  v.literal("activitySamples"),
  v.literal("stateSamples"),
  v.literal("dailyStats"),
  v.literal("employeeStates"),
  v.literal("integrationHealth"),
  v.literal("activitySettings"),
);

function assertSecret(secret: string): void {
  const expected = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!expected || !safeEqual(secret, expected)) {
    throw appError("forbidden", "Invalid migration secret");
  }
}

export const exportTable = query({
  args: {
    secret: v.string(),
    table: EXPORTABLE,
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, { secret, table, cursor, numItems }) => {
    assertSecret(secret);
    const result = await ctx.db.query(table).paginate({
      cursor: cursor ?? null,
      numItems: Math.min(numItems ?? 200, 1000),
    });
    return {
      page: result.page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
