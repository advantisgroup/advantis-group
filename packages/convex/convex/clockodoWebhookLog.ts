import { internalMutation, serverMutation } from "./functions";
import { v } from "convex/values";

/**
 * Durable record of every inbound Clockodo webhook delivery — see the schema
 * comment on `clockodoWebhookLog`. Server-key gated like the other
 * apps/api-invoked mutations in `clockodoSync.ts`.
 */
export const logWebhookDelivery = serverMutation({
  args: {
    endpoint: v.union(v.literal("webhooks/clockodo"), v.literal("integrations/clockodo/webhook")),
    eventName: v.optional(v.string()),
    ok: v.boolean(),
    reason: v.string(),
    tokenPresent: v.boolean(),
    tokenLength: v.optional(v.number()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, { ...args }) => {
    await ctx.db.insert("clockodoWebhookLog", { ...args, at: Date.now() });
  },
});

const RETENTION_DAYS = 30;
const BATCH = 4_000;

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
