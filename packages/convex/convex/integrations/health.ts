import { v } from "convex/values";

import { serverMutation } from "../functions";
import { alertAdmins } from "../lib/notify";

/**
 * apps/api reports each webhook delivery it handles (Clerk, Resend, OneDrive)
 * so the admin Systems panel can tell a quiet integration from a broken one.
 * Same `integrationHealth` rows ActivityTrack keeps for Genesys and Clockodo.
 */
export const apiRecordWebhook = serverMutation({
  args: {
    source: v.union(v.literal("clerk"), v.literal("resend"), v.literal("onedrive")),
    ok: v.boolean(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { source, ok, message }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationHealth")
      .withIndex("by_source", (q) => q.eq("source", source))
      .unique();
    const patch = ok
      ? { status: "ok" as const, message: undefined, lastOkAt: now, updatedAt: now }
      : {
          status: "unavailable" as const,
          message: message?.slice(0, 200),
          lastErrorAt: now,
          updatedAt: now,
        };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("integrationHealth", { source, ...patch });
    // Only on the switch from working to broken, so a flood of failures is one alert.
    if (!ok && existing?.status !== "unavailable") {
      await alertAdmins(ctx, {
        title: `${source[0].toUpperCase()}${source.slice(1)} webhooks are failing`,
        body: message?.slice(0, 200),
      });
    }
  },
});
