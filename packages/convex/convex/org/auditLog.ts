import { v } from "convex/values";

import { userQuery } from "../functions";
import { batchUserSummaries } from "../lib/users";

/**
 * Read-only merge of the privileged-action audit tables (`onedriveAudit`,
 * `integrationsAuditLog`), plus deletes and restores from the trash
 * (`auditLog`, domain `content`) — each has its own writer and its own
 * narrower reader (the OneDrive audit panel), but nothing combines them, so
 * `integrationsAuditLog` in particular has never had a UI to read it at
 * all. Admin-only, since this is a cross-cutting view of everything, not
 * scoped to one subsystem's own manager-level access.
 */

const sourceArg = v.optional(
  v.union(v.literal("onedrive"), v.literal("integrations"), v.literal("content")),
);

export const list = userQuery({
  role: "admin",
  args: { source: sourceArg, limit: v.optional(v.number()) },
  handler: async (ctx, { source, limit }) => {
    const take = Math.min(limit ?? 100, 500);

    const [onedriveRows, integrationsRows, contentRows] = await Promise.all([
      !source || source === "onedrive"
        ? ctx.db.query("onedriveAudit").withIndex("by_at").order("desc").take(take)
        : [],
      !source || source === "integrations"
        ? ctx.db.query("integrationsAuditLog").withIndex("by_at").order("desc").take(take)
        : [],
      !source || source === "content"
        ? ctx.db
            .query("auditLog")
            .withIndex("by_domain_at", (q) => q.eq("domain", "content"))
            .order("desc")
            .take(take)
        : [],
    ]);

    const merged = [
      ...onedriveRows.map((r) => ({ ...r, source: "onedrive" as const })),
      ...integrationsRows.map((r) => ({ ...r, source: "integrations" as const })),
      ...contentRows.map((r) => ({ ...r, source: "content" as const })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, take);

    const actorsById = await batchUserSummaries(
      ctx,
      merged.map((r) => r.actorUserId),
    );

    return merged.map((row) => ({
      ...row,
      user: actorsById.get(row.actorUserId) ?? null,
    }));
  },
});
