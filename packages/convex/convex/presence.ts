import { sandboxSafeMutation } from "./functions";
import { requireUser } from "./lib/auth";

/**
 * Lightweight presence heartbeat. The web client pings this on an interval
 * while the app is open; conversation queries read the latest `lastActiveAt`
 * to show online / last-seen state.
 */
export const heartbeat = sandboxSafeMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastActiveAt: now });
    } else {
      await ctx.db.insert("presence", { userId: user._id, lastActiveAt: now });
    }
    return { ok: true };
  },
});
