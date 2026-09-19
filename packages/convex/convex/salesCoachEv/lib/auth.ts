import { ConvexError } from "convex/values";

import { effectiveRole, getUserByClerkId } from "../../lib/auth";
import { type QueryCtx, type MutationCtx } from "../../_generated/server";

/**
 * Resolve the calling user by their verified `clerkUserId` and require
 * `role === "admin"` — used for wiki authoring and the admin roster, which
 * apps/api forwards a caller id for but can't check `ctx.auth` on directly
 * (the request here is server-key-authenticated, not the caller's own
 * session). Mirrors `resolveCaller` in integrations/clockodoAbsences.ts.
 */
export async function requireAdminCaller(ctx: QueryCtx | MutationCtx, clerkUserId: string) {
  const user = await getUserByClerkId(ctx, clerkUserId);
  if (!user || user.status !== "active" || effectiveRole(user) !== "admin") {
    throw new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });
  }
  return user;
}
