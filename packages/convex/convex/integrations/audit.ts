import { v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "../_generated/server";
import { requireCapability } from "../lib/auth";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { batchUserSummaries } from "../lib/users";

type Integration = "clockodo";
type IntegrationsAuditAction =
  | "clockodo.link"
  | "clockodo.unlink"
  | "clockodo.updateUser"
  | "clockodo.setTargetHours"
  | "clockodo.setVacation";

export async function writeIntegrationsAudit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  integration: Integration,
  action: IntegrationsAuditAction,
  target?: string,
  detail?: string,
): Promise<void> {
  const at = Date.now();
  await ctx.db.insert("integrationsAuditLog", {
    actorUserId,
    integration,
    action,
    target,
    detail,
    at,
  });
  await recordUnifiedAudit(ctx, {
    domain: "integrations",
    actorUserId,
    integration,
    action,
    target,
    detail,
    at,
  });
}

/**
 * Actions (Clockodo's user-management calls in particular) have no
 * `ctx.db` — this lets them record an audit entry via `ctx.runMutation`
 * instead of duplicating `writeIntegrationsAudit`'s insert logic.
 */
export const recordClockodoAudit = internalMutation({
  args: {
    actorUserId: v.id("users"),
    action: v.union(
      v.literal("clockodo.updateUser"),
      v.literal("clockodo.setTargetHours"),
      v.literal("clockodo.setVacation"),
    ),
    target: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { actorUserId, action, target, detail }) => {
    await writeIntegrationsAudit(ctx, actorUserId, "clockodo", action, target, detail);
  },
});

/**
 * One employee's Clockodo change history for the admin detail page's
 * History tab. Matches on the numeric Clockodo id (used by the newer
 * updateUser/setTargetHours/setVacation entries) as well as the legacy
 * link/unlink entries, which were written keyed by email instead —
 * merging both keeps existing history visible rather than only showing
 * changes made after this query was added.
 */
export const getClockodoUserAuditHistory = query({
  args: { clockodoUserId: v.number(), email: v.optional(v.string()) },
  handler: async (ctx, { clockodoUserId, email }) => {
    await requireCapability(ctx, "view_clockodo_team");
    const byId = await ctx.db
      .query("integrationsAuditLog")
      .withIndex("by_integration_target", (q) =>
        q.eq("integration", "clockodo").eq("target", String(clockodoUserId)),
      )
      .collect();
    const byEmail = email
      ? await ctx.db
          .query("integrationsAuditLog")
          .withIndex("by_integration_target", (q) =>
            q.eq("integration", "clockodo").eq("target", email),
          )
          .collect()
      : [];
    const merged = [...byId, ...byEmail].sort((a, b) => b.at - a.at).slice(0, 100);
    const actorsById = await batchUserSummaries(
      ctx,
      merged.map((row) => row.actorUserId),
    );
    return merged.map((row) => ({
      ...row,
      actor: actorsById.get(row.actorUserId) ?? null,
    }));
  },
});
