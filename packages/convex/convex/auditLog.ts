import { v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { displayName } from "./activity/lib/users";

/**
 * Read-only merge of the three privileged-action audit tables
 * (`activityAuditLog`, `onedriveAudit`, `integrationsAuditLog`) — each has
 * its own writer and its own narrower reader (ActivityTrack's settings tab,
 * the OneDrive audit panel), but nothing combines them, so
 * `integrationsAuditLog` in particular has never had a UI to read it at
 * all. Admin-only, since this is a cross-cutting view of everything, not
 * scoped to one subsystem's own manager-level access.
 */

const sourceArg = v.optional(
  v.union(
    v.literal("activity"),
    v.literal("onedrive"),
    v.literal("integrations")
  )
);

export const list = query({
  args: { source: sourceArg, limit: v.optional(v.number()) },
  handler: async (ctx, { source, limit }) => {
    await requireAdmin(ctx);
    const take = Math.min(limit ?? 100, 500);

    const [activityRows, onedriveRows, integrationsRows] = await Promise.all([
      !source || source === "activity"
        ? ctx.db
            .query("activityAuditLog")
            .withIndex("by_at")
            .order("desc")
            .take(take)
        : [],
      !source || source === "onedrive"
        ? ctx.db
            .query("onedriveAudit")
            .withIndex("by_at")
            .order("desc")
            .take(take)
        : [],
      !source || source === "integrations"
        ? ctx.db
            .query("integrationsAuditLog")
            .withIndex("by_at")
            .order("desc")
            .take(take)
        : [],
    ]);

    const merged = [
      ...activityRows.map(r => ({ ...r, source: "activity" as const })),
      ...onedriveRows.map(r => ({ ...r, source: "onedrive" as const })),
      ...integrationsRows.map(r => ({ ...r, source: "integrations" as const })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, take);

    const actorIds = [...new Set(merged.map(r => r.actorUserId))];
    const actorsById = new Map(
      (await Promise.all(actorIds.map(id => ctx.db.get(id)))).flatMap(u =>
        u ? [[u._id, u] as const] : []
      )
    );

    return merged.map(row => ({
      ...row,
      actorName: actorsById.get(row.actorUserId)
        ? displayName(actorsById.get(row.actorUserId) as Doc<"users">)
        : "unknown",
    }));
  },
});
