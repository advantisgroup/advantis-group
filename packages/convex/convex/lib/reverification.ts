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
 * Confirmed by logging the raw claim in production: Clerk's Dashboard blocks
 * `fva` as a claim *name* on custom JWT Templates outright ("You can't use
 * the reserved claim: fva") — it doesn't mean the claim is already included,
 * it means a hand-built template can never carry it, full stop. `identity.fva`
 * was reading as `undefined` on every request, not stale — genuinely absent.
 *
 * The `convex` JWT Template maps the same `{{user.factor_verification_age}}`
 * shortcode under a non-reserved key, `reverificationAge`, instead. `fva`
 * itself is kept as a fallback for if/when this project switches to Clerk's
 * native Convex integration (Dashboard → Configure → Integrations), which
 * mints its own session token with `fva` as a true default claim and needs
 * no hand-built template at all.
 *
 * The claim comes back as a comma-delimited string (`"<age>,<age>"`) through
 * our `reverificationAge` template mapping — shortcode interpolation in a
 * JSON string field always stringifies. The `fva` fallback, if Clerk's
 * native integration ever populates it, may instead hand back the raw
 * `[number, number]` tuple, since that path isn't going through string
 * interpolation. Accept either so the fallback isn't silently dead on
 * arrival if that ever kicks in.
 */
function firstFactorAgeFromClaim(value: unknown): number | undefined {
  if (typeof value === "string") {
    const age = Number(value.split(",")[0]);
    return Number.isFinite(age) ? age : undefined;
  }
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value[0];
  }
  return undefined;
}

/**
 * Whether the caller's Clerk session has been verified recently enough.
 *
 * Reads the factor-verification-age claim, minutes since the first factor
 * was verified (`-1` for "never") — see `firstFactorAgeFromClaim` for which
 * claim name that actually is, its shape, and why. If it's ever missing,
 * this reads as unverified and stays blocked. Failing closed is deliberate —
 * a missing claim is indistinguishable from a session that was never
 * re-verified, and guessing in the permissive direction would silently turn
 * the whole gate off.
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
  const firstFactorAge = firstFactorAgeFromClaim(identity.reverificationAge ?? identity.fva);
  if (firstFactorAge === undefined || firstFactorAge < 0) return false;
  return firstFactorAge <= REVERIFICATION_MAX_AGE_MINUTES;
}

/**
 * TEMPORARY diagnostic: surfaces exactly what `ctx.auth.getUserIdentity()`
 * is handing back for both possible claim names, so a `reverification_failed`
 * audit row shows the raw values instead of just the boolean verdict. Remove
 * once `reverificationAge` has been confirmed working for a few real
 * step-ups.
 */
export async function debugFvaClaim(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return "no-identity";
  return `reverificationAge=${JSON.stringify(identity.reverificationAge)} fva=${JSON.stringify(identity.fva)}`;
}
