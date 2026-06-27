import { v } from "convex/values";

import { mutation, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { safeEqual, sha256hex, randomToken } from "./lib/crypto";
import { appError } from "./lib/errors";

/**
 * Per-device bearer tokens for the desktop agent.
 *
 * The token is the agent's only credential — there is no shared bootstrap key
 * and no Clerk session on the device. It is minted exactly once when the device
 * is approved (see `devices.claimToken`), returned to the agent in that single
 * response, and never stored in plaintext: only the SHA-256 hash lives on the
 * device row (`tokenHash`). Disabling a device clears the hash, after which
 * `validate` fails and the agent's ingest / heartbeat start returning 401.
 *
 * This is a self-contained reimplementation of ActivityTrack's external
 * `convex-api-tokens` component, so the intranet Convex deployment needs no
 * extra Convex component installed for the merge.
 */

/** Mint a fresh token for a device, store its hash, return the raw token once. */
export async function issueDeviceToken(
  ctx: MutationCtx,
  deviceDocId: import("../_generated/dataModel").Id<"devices">
): Promise<string> {
  const token = randomToken();
  await ctx.db.patch(deviceDocId, {
    tokenHash: await sha256hex(token),
    tokenIssued: true,
  });
  return token;
}

/** Revoke a device's token (e.g. on disable/remove). */
export async function invalidateDeviceToken(
  ctx: MutationCtx,
  deviceDocId: import("../_generated/dataModel").Id<"devices">
): Promise<void> {
  await ctx.db.patch(deviceDocId, { tokenHash: undefined, tokenIssued: false });
}

/**
 * Validate a raw device token and confirm the owning device is still active.
 * Returns `{ deviceId }` on success, or `null` when the token is unknown or the
 * device is disabled. Also refreshes `lastSeen`.
 */
export async function validateDeviceToken(
  ctx: MutationCtx,
  token: string
): Promise<{ deviceId: string } | null> {
  if (!token) return null;
  const tokenHash = await sha256hex(token);
  const device = await ctx.db
    .query("devices")
    .withIndex("by_tokenHash", q => q.eq("tokenHash", tokenHash))
    .unique();
  if (!device || device.status === "disabled") return null;
  return { deviceId: device.deviceId };
}

/**
 * Internal entry point for the device-keyed httpActions (/ingest, /agent/*):
 * they can't touch the db directly, so they hop through this mutation.
 */
export const validateInternal = internalMutation({
  args: { token: v.string() },
  handler: (ctx, { token }) => validateDeviceToken(ctx, token),
});

/**
 * Guard for the server-to-server mutations the Elysia API layer calls on the
 * device's behalf (token validation + the unauthenticated register/poll). The
 * device itself holds no secret — Elysia attaches `ACTIVITYTRACK_SIGNAL_SECRET`.
 */
export function assertSignalSecret(secret: string): void {
  const expected = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!expected || !safeEqual(secret, expected)) {
    throw appError("auth.forbidden", "Invalid signal secret");
  }
}

/** Public, secret-guarded validator for the Elysia API layer (heartbeat). */
export const validate = mutation({
  args: { secret: v.string(), token: v.string() },
  handler: (ctx, { secret, token }) => {
    assertSignalSecret(secret);
    return validateDeviceToken(ctx, token);
  },
});
