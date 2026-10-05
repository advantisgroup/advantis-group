import { v } from "convex/values";

import { internalQuery, query } from "../functions";
import type { QueryCtx } from "../_generated/server";
import { sha256hex } from "../lib/crypto";
import { assertSignalSecret } from "./lib/deviceAuth";

/**
 * Validate a raw device token and confirm the owning device is still active.
 * Returns `{ deviceId }` on success, or `null` when the token is unknown or the
 * device is disabled. Read-only, so the entry points below are queries —
 * Convex caches query results, which mutations never get.
 */
export async function validateDeviceToken(
  ctx: QueryCtx,
  token: string,
): Promise<{ deviceId: string } | null> {
  if (!token) return null;
  const tokenHash = await sha256hex(token);
  const device = await ctx.db
    .query("devices")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!device || device.status === "disabled") return null;
  return { deviceId: device.deviceId };
}

/**
 * Internal entry point for the device-keyed httpActions (/ingest, /agent/*):
 * they can't touch the db directly, so they hop through this query.
 */
export const validateInternal = internalQuery({
  args: { token: v.string() },
  handler: (ctx, { token }) => validateDeviceToken(ctx, token),
});

/** Public, secret-guarded validator for the Elysia API layer (heartbeat). */
export const validate = query({
  args: { secret: v.string(), token: v.string() },
  handler: (ctx, { secret, token }) => {
    assertSignalSecret(secret);
    return validateDeviceToken(ctx, token);
  },
});
