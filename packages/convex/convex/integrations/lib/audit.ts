import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { recordUnifiedAudit } from "../../lib/auditLogWrite";

export type Integration = "clockodo";

export type IntegrationsAuditAction =
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
