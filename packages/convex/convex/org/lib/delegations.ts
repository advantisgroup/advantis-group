import { type Id } from "../../_generated/dataModel";
import { type QueryCtx } from "../../_generated/server";

export async function hasActiveAbsenceApprovalDelegation(
  ctx: QueryCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  const rows = await ctx.db
    .query("approvalDelegations")
    .withIndex("by_delegate_and_endsAt", (q) => q.eq("delegateUserId", userId).gt("endsAt", now))
    .take(20);
  return rows.some(
    (row) => row.scope === "absence_approvals" && !row.revokedAt && row.startsAt <= now,
  );
}
