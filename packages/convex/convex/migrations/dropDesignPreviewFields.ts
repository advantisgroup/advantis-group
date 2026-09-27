/**
 * Clears the leftovers of the refreshed-design preview. Everyone gets the
 * refreshed design now (it's stamped in the root layout), so the per-person
 * opt-in and the one-off "how's the new design?" prompt timestamp are no
 * longer read or written anywhere.
 *
 * Same ordering as `dropGuestFields`: a Convex push rejects documents
 * carrying a field the validator no longer allows, so run this once from the
 * dashboard (`internal.migrations.dropDesignPreviewFields.run`), then delete
 * the two fields flagged in `tables/identity.ts`. Idempotent — only touches
 * rows that still have either field set.
 */
import { internalMutation } from "../functions";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0;
    const rows = await ctx.db.query("userPreferences").collect();
    for (const row of rows) {
      if (row.designPreview === undefined && row.designFeedbackPromptedAt === undefined) continue;
      await ctx.db.patch(row._id, {
        designPreview: undefined,
        designFeedbackPromptedAt: undefined,
      });
      cleared++;
    }
    return { cleared };
  },
});
