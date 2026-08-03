import { type MutationCtx, type QueryCtx } from "../_generated/server";

/** How recently an admin must have proven who they are before an action that
 * can hand out access to someone else's account goes through. */
export const REVERIFICATION_MAX_AGE_MINUTES = 10;

/**
 * The exact shape `@clerk/shared`'s `reverificationError()` produces, and the
 * only thing `useReverification()` recognises. A Convex function *returns*
 * this instead of throwing: the hook inspects the resolved value, opens
 * Clerk's step-up modal, and re-runs the call once the user has verified.
 */
export interface ReverificationHint {
  clerk_error: {
    type: "forbidden";
    reason: "reverification-error";
    metadata: {
      reverification: { level: "first_factor"; afterMinutes: number };
    };
  };
}

export function reverificationHint(): ReverificationHint {
  return {
    clerk_error: {
      type: "forbidden",
      reason: "reverification-error",
      metadata: {
        reverification: {
          level: "first_factor",
          afterMinutes: REVERIFICATION_MAX_AGE_MINUTES,
        },
      },
    },
  };
}

/**
 * Whether the caller's Clerk session has been verified recently enough.
 *
 * Reads Clerk's `fva` ("factor verification age") claim — `"<minutes since
 * first factor>,<minutes since second factor>"`, with `-1` for "never". `fva`
 * is a Clerk default claim included on every session token automatically —
 * the Dashboard's JWT Templates editor now refuses to let you add it
 * manually ("You can't use the reserved claim: fva"), so there's nothing to
 * configure here. If it's ever missing, this reads as unverified and stays
 * blocked. Failing closed is deliberate — a missing claim is indistinguishable
 * from a session that was never re-verified, and guessing in the permissive
 * direction would silently turn the whole gate off.
 *
 * A missing claim is *not* what causes a legitimate step-up to keep failing
 * on retry, though — that's almost always `PasswordResetsPanel.tsx`'s
 * `refreshConvexAuth`, which exists because Convex caches its auth token
 * independently of Clerk's session and won't have picked up a verification
 * that just happened without being told to refetch.
 */
export async function isRecentlyVerified(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const fva = identity.fva;
  if (typeof fva !== "string") return false;
  const firstFactorAge = Number(fva.split(",")[0]);
  if (!Number.isFinite(firstFactorAge) || firstFactorAge < 0) return false;
  return firstFactorAge <= REVERIFICATION_MAX_AGE_MINUTES;
}

/**
 * TEMPORARY diagnostic: surfaces exactly what `ctx.auth.getUserIdentity()`
 * is handing back for the `fva` claim, so a `reverification_failed` audit
 * row shows the raw value instead of just the boolean verdict. Remove once
 * we've confirmed whether `fva` is landing on the token at all — see the
 * discussion on the reverification-retry bug this is diagnosing.
 */
export async function debugFvaClaim(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return "no-identity";
  return `fva=${JSON.stringify(identity.fva)}`;
}
