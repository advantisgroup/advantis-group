import { api } from "../../_generated/api";
import { appError } from "../../activity/lib/errors";
import { MANAGER_ROLES } from "../../lib/auth";

import type { ActionCtx } from "../../_generated/server";

/**
 * Manager+ (or `access_integrations` custom-role) check for Convex actions.
 * Actions have no `ctx.db`, so `lib/auth.ts`'s `requireCapability` (which
 * reads the db directly) can't run here — round-trip through the `users.me`
 * query instead, same pattern as `activity/clockodo.ts`'s
 * `troubleshootSanitizeDay`.
 */
export async function requireManagerAction(ctx: ActionCtx) {
  const me = await ctx.runQuery(api.users.me, {});
  if (
    !me ||
    (!MANAGER_ROLES.includes(me.role) && !me.capabilities.includes("access_integrations"))
  ) {
    throw appError("auth.forbidden", "Forbidden: requires manager role");
  }
  return me;
}

/**
 * Manager+ (or `manage_clockodo_team` custom-role) check for Clockodo's own
 * employee-management actions — split out from `requireManagerAction`'s
 * `access_integrations` check since Clockodo now has its own capability,
 * distinct from the Genesys-shared integrations-admin one that helper still
 * guards (e.g. `activity/integrations.ts`'s poll troubleshooting action).
 */
export async function requireClockodoManagerAction(ctx: ActionCtx) {
  const me = await ctx.runQuery(api.users.me, {});
  if (
    !me ||
    (!MANAGER_ROLES.includes(me.role) && !me.capabilities.includes("manage_clockodo_team"))
  ) {
    throw appError("auth.forbidden", "Forbidden: requires Clockodo team management access");
  }
  return me;
}

/**
 * Admin-only check for Convex actions — same "no ctx.db" round-trip as
 * `requireManagerAction` above, for the handful of action-context mutations
 * that are admin-only rather than manager+.
 */
export async function requireAdminAction(ctx: ActionCtx) {
  const me = await ctx.runQuery(api.users.me, {});
  if (!me || me.role !== "admin") {
    throw appError("auth.forbidden", "Forbidden: requires admin role");
  }
  return me;
}
