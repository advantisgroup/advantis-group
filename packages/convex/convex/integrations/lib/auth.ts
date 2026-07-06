import { api } from "../../_generated/api";
import { appError } from "../../activity/lib/errors";

import type { ActionCtx } from "../../_generated/server";

/**
 * Manager+ check for Convex actions. Actions have no `ctx.db`, so
 * `lib/auth.ts`'s `requireManager` (which reads the db directly) can't run
 * here — round-trip through the `users.me` query instead, same pattern as
 * `activity/clockodo.ts`'s `troubleshootSanitizeDay`.
 */
export async function requireManagerAction(ctx: ActionCtx) {
  const me = await ctx.runQuery(api.users.me, {});
  if (!me || (me.role !== "admin" && me.role !== "manager")) {
    throw appError("auth.forbidden", "Forbidden: requires manager role");
  }
  return me;
}
