import { internalMutation } from "../functions";

const RETENTION_DAYS = 30;
const BATCH = 4_000;

/**
 * Nothing writes `clockodoWebhookLog` any more — the only Clockodo webhook
 * (ActivityTrack's time-entry relay) was removed. This keeps pruning the
 * rows that are left until the table is empty and can be dropped.
 */
export const pruneOldWebhookLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("clockodoWebhookLog")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(BATCH);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});
