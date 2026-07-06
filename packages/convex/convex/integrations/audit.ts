import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";

type Integration = "clockodo";

export async function writeIntegrationsAudit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  integration: Integration,
  action: string,
  target?: string
): Promise<void> {
  await ctx.db.insert("integrationsAuditLog", {
    actorUserId,
    integration,
    action,
    target,
    at: Date.now(),
  });
}
