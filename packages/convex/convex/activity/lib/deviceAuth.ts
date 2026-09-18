import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { safeEqual, sha256hex, randomToken } from "./crypto";
import { appError } from "../../lib/errors";

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
  deviceDocId: Id<"devices">,
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
  deviceDocId: Id<"devices">,
): Promise<void> {
  await ctx.db.patch(deviceDocId, { tokenHash: undefined, tokenIssued: false });
}

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
