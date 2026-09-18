import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { recordUnifiedAudit } from "../../lib/auditLogWrite";

/**
 * Append an entry to the privileged-action audit log. Called from every admin
 * mutation that mutates devices/people/settings so managers can review who did
 * what. Append-only.
 */
export type ActivityAuditAction =
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
  target?: string,
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
