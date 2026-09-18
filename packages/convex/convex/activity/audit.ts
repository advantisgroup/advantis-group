import { v } from "convex/values";

import { query } from "../functions";
import { requireManager } from "../lib/auth";
import { displayName } from "../lib/users";

/** Audit log, newest first. Manager+. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireManager(ctx);
    const rows = await ctx.db
      .query("activityAuditLog")
      .withIndex("by_at")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));

    // Hydrate actor names for display — batch-load distinct actors once.
    const actorIds = [...new Set(rows.map((r) => r.actorUserId))];
    const actorsById = new Map(
      (await Promise.all(actorIds.map((id) => ctx.db.get(id)))).flatMap((u) =>
        u ? [[u._id, u] as const] : [],
      ),
    );

    return rows.map((row) => {
      const actor = actorsById.get(row.actorUserId);
      return {
        ...row,
        actorName: actor ? displayName(actor) : "unknown",
      };
    });
  },
});
