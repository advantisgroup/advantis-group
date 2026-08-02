/**
 * Clears the leftovers of the removed guest-tour feature. The feature itself
 * (routes, `guest.ts`, the admin panel) is already gone; this only strips the
 * data so the schema declarations can follow.
 *
 * Ordering matters: a Convex push rejects documents carrying a field the
 * validator no longer allows, so `guestVisible` has to be cleared off every
 * existing row *before* those three lines come out of `schema.ts`. Run this
 * once from the dashboard (`internal.migrations.dropGuestFields.run`), then
 * delete the fields flagged in `schema.ts`. Idempotent — only touches rows
 * that still have the field set.
 */
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0;

    for (const table of ["announcements", "events", "updates"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.guestVisible === undefined) continue;
        await ctx.db.patch(row._id, { guestVisible: undefined });
        cleared++;
      }
    }

    const logins = await ctx.db.query("tempLogins").collect();
    for (const login of logins) await ctx.db.delete(login._id);

    return { cleared, tempLoginsDeleted: logins.length };
  },
});
