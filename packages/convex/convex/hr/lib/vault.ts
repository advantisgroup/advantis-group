import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";

/** Delete a user's own vault password + unlock, if any. Used both when an
 * admin resets a forgotten password and when access is revoked entirely —
 * a former member's password must not linger once they can no longer reach
 * the area it guards. Plain helper (not a Convex function) so callers in
 * `users.ts` can invoke it directly from within their own mutation. */
export async function clearVaultPasswordForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const passwordRow = await ctx.db
    .query("applicantVaultPasswords")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (passwordRow) await ctx.db.delete(passwordRow._id);

  const unlockRow = await ctx.db
    .query("applicantVaultUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (unlockRow) await ctx.db.delete(unlockRow._id);
}
