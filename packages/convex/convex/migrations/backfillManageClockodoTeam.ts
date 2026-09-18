/**
 * One-time backfill for splitting Clockodo admin access out of the shared
 * `access_integrations` capability into its own `manage_clockodo_team`.
 * Without this, any custom role that granted Clockodo management via
 * `access_integrations` would silently lose it the moment the gate on
 * `/clockodo/admin` switches to the new capability. Adds
 * `manage_clockodo_team` (which `customRoles.ts`'s own normalization then
 * expands to also include `view_clockodo_team`) to every custom role that
 * currently has `access_integrations`. Idempotent — only patches roles
 * missing the new capability. Run manually once from the Convex dashboard
 * (`internal.migrations.backfillManageClockodoTeam.run`) after this
 * capability split deploys; not wired to any client route.
 */
import { internalMutation } from "../functions";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("customRoles").collect();
    let migrated = 0;
    for (const role of roles) {
      if (!role.capabilities.includes("access_integrations")) continue;
      if (role.capabilities.includes("manage_clockodo_team")) continue;
      await ctx.db.patch(role._id, {
        capabilities: [...role.capabilities, "manage_clockodo_team", "view_clockodo_team"],
      });
      migrated++;
    }
    return { migrated };
  },
});
