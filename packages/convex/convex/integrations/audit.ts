import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { recordUnifiedAudit } from "../lib/auditLogWrite";

type Integration = "clockodo";
type IntegrationsAuditAction = "clockodo.link" | "clockodo.unlink";

export async function writeIntegrationsAudit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  integration: Integration,
  action: IntegrationsAuditAction,
  target?: string,
): Promise<void> {
  const at = Date.now();
  await ctx.db.insert("integrationsAuditLog", {
    actorUserId,
    integration,
    action,
    target,
    at,
  });
  await recordUnifiedAudit(ctx, {
    domain: "integrations",
    actorUserId,
    integration,
    action,
    target,
    at,
  });
}
