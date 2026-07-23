import { v } from "convex/values";

import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireManager } from "../lib/auth";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { displayName } from "./lib/users";

/**
 * Append an entry to the privileged-action audit log. Called from every admin
 * mutation that mutates devices/people/settings so managers can review who did
 * what. Append-only.
 */
type ActivityAuditAction =
  | "settings.config"
  | "settings.update"
  | "person.create"
  | "person.update"
  | "person.remove"
  | "event.resolve"
  | "device.approve"
  | "device.disable"
  | "device.remove"
  | "device.link"
  | "maintenance.quarantineOutOfHours"
  | "maintenance.pruneNow";

export async function writeAudit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  action: ActivityAuditAction,
  target?: string
): Promise<void> {
  const at = Date.now();
  await ctx.db.insert("activityAuditLog", {
    actorUserId,
    action,
    target,
    at,
  });
  await recordUnifiedAudit(ctx, {
    domain: "activity",
    actorUserId,
    action,
    target,
    at,
  });
}

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
    const actorIds = [...new Set(rows.map(r => r.actorUserId))];
    const actorsById = new Map(
      (await Promise.all(actorIds.map(id => ctx.db.get(id)))).flatMap(u =>
        u ? [[u._id, u] as const] : []
      )
    );

    return rows.map(row => {
      const actor = actorsById.get(row.actorUserId);
      return {
        ...row,
        actorName: actor ? displayName(actor) : "unknown",
      };
    });
  },
});
