/**
 * One-time backfill for the singular -> plural custom-role change:
 * `users.customRoleId` (one optional role) became `users.customRoleIds`
 * (an array, so someone can hold more than one). New code reads through
 * `lib/auth.ts`'s `effectiveCustomRoleIds`, which already falls back to the
 * legacy field at read time — so this migration isn't required for
 * correctness, only for fully retiring `customRoleId` eventually. Copies
 * `customRoleId` into a one-element `customRoleIds` and clears the old
 * field for every row that still has it set. Idempotent — only touches rows
 * where `customRoleId` is still present. Run manually once from the Convex
 * dashboard (`internal.migrations.backfillCustomRoleIds.run`) whenever
 * convenient; not wired to any client route.
 */
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let migrated = 0;
    for (const user of users) {
      if (!user.customRoleId) continue;
      await ctx.db.patch(user._id, {
        customRoleIds: [...(user.customRoleIds ?? []), user.customRoleId],
        customRoleId: undefined,
      });
      migrated++;
    }
    return { migrated };
  },
});
