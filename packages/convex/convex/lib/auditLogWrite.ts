import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";

/**
 * Dual-write helper for Group 10 of the backend QoL backlog — see the
 * `auditLog` table's schema comment for the full rationale. Call this
 * alongside (never instead of) the existing per-domain
 * `ctx.db.insert("onedriveAudit" | "integrationsAuditLog" |
 * "applicantAuditLog", ...)` calls; it does not
 * replace them.
 */
export async function recordUnifiedAudit(
  ctx: MutationCtx,
  entry: {
    domain: "onedrive" | "integrations" | "applicant" | "content";
    actorUserId: Id<"users">;
    action: string;
    integration?: string;
    target?: string;
    detail?: string;
    at: number;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", entry);
}
