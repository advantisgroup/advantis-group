import { ConvexError } from "convex/values";

import { getUserByClerkId } from "../lib/auth";
import { type QueryCtx, type MutationCtx } from "../_generated/server";

/**
 * Shared by every Sales Coach EV Convex function — all of them are called
 * server-to-server from the Elysia API (apps/api), never from a live client
 * Convex session, so every entry point is gated on this shared secret first.
 */
export function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/**
 * Resolve the calling user by their verified `clerkUserId` and require
 * `role === "admin"` — used for wiki authoring and the admin roster, which
 * apps/api forwards a caller id for but can't check `ctx.auth` on directly
 * (the request here is server-key-authenticated, not the caller's own
 * session). Mirrors `resolveCaller` in integrations/clockodoAbsences.ts.
 */
export async function requireAdminCaller(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
) {
  const user = await getUserByClerkId(ctx, clerkUserId);
  if (!user || user.role !== "admin") {
    throw new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });
  }
  return user;
}
