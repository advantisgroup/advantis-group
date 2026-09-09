import { ConvexError } from "convex/values";

import { safeEqual, sha256hex } from "../activity/lib/crypto";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { effectiveRole, MANAGER_ROLES } from "./auth";
import { trackEvent } from "./analytics";

export type StepMethod = "email_code" | "totp" | "recovery_code" | "passkey";
export type StepUpContext = "sign_in" | "destructive" | "admin_reverify";

export const LEVEL: Record<StepMethod, number> = {
  email_code: 1,
  // Same level as the authenticator it stands in for. A recovery code is the
  // lost-phone escape hatch, so ranking it below an org MFA requirement made
  // it unable to satisfy the one situation it exists for — the code verified,
  // burned itself, and left the user exactly as locked out as before. It
  // costs a re-enrollment instead: see `recoveryUsedAt` on totpCredentials.
  recovery_code: 2,
  totp: 2,
  passkey: 3,
};

/** The bar an org-wide "require MFA" policy sets — level 2 (TOTP or
 * passkey), deliberately excluding a bare email code. An org turning this on
 * wants a real second factor, not just "click the link in your inbox again",
 * which barely raises the bar over the password alone. Email code stays
 * available as the weaker, always-on method for risk-based nudges and admin
 * reverification, just not as what satisfies an org policy on its own. */
const ORG_MFA_LEVEL = 2;

/** Admin reverification bar (password-reset dismiss/issue) — level 1 (any
 * method, including a fresh email code) within a 10-minute window. Matches
 * the retired `adminVerification.ts`'s `REVERIFICATION_MAX_AGE_MINUTES`. */
export const ORG_REVERIFY_LEVEL = LEVEL.email_code;
export const REVERIFY_FRESHNESS_MS = 10 * 60_000;

/** How long a freshly-issued email code stays enterable. */
const CODE_TTL_MS = 10 * 60_000;
/** Failed guesses allowed against one code before it's invalidated outright. */
const MAX_ATTEMPTS = 5;
/** Minimum gap between two code requests for the same (user, session). */
const REQUEST_COOLDOWN_MS = 60_000;

export interface StepUpHint {
  needsStepUp: true;
  requiredLevel: number;
  availableMethods: StepMethod[];
}

export function needsStepUpHint(requiredLevel: number, availableMethods: StepMethod[]): StepUpHint {
  return { needsStepUp: true, requiredLevel, availableMethods };
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = bytes[0]! % 1_000_000;
  return code.toString().padStart(6, "0");
}

async function recordVerified(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: string,
  method: StepMethod,
  context: StepUpContext,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("stepUpVerifications", {
    userId: user._id,
    sessionId,
    method,
    level: LEVEL[method],
    context,
    verifiedAt: now,
  });
  await ctx.db.insert("stepUpAuditLog", {
    userId: user._id,
    event: "verified",
    context,
    detail: method,
    at: now,
  });
  await trackEvent(ctx, {
    event: "stepup_verified",
    distinctId: user.clerkUserId,
    properties: { context, method, level: LEVEL[method] },
  });
}

async function recordFailed(
  ctx: MutationCtx,
  user: Doc<"users">,
  method: StepMethod,
  context: StepUpContext,
  reason: string,
): Promise<void> {
  await ctx.db.insert("stepUpAuditLog", {
    userId: user._id,
    event: "failed",
    context,
    detail: `${method}:${reason}`,
    at: Date.now(),
  });
  await trackEvent(ctx, {
    event: "stepup_failed",
    distinctId: user.clerkUserId,
    properties: { context, method, reason },
  });
}

/**
 * Does the current (user, session) already have a recorded step at
 * `requiredLevel` or higher? `freshnessMs`, when given, additionally
 * requires that step to have happened within that window — used for
 * destructive-action re-verification, not for sign-in (a sign-in-time check
 * should survive the whole session, not expire mid-use).
 */
export async function checkSatisfied(
  ctx: QueryCtx | MutationCtx,
  args: { userId: Id<"users">; sessionId: string; requiredLevel: number; freshnessMs?: number },
): Promise<boolean> {
  if (args.requiredLevel <= 0) return true;
  const rows = await ctx.db
    .query("stepUpVerifications")
    .withIndex("by_user_session", (q) =>
      q.eq("userId", args.userId).eq("sessionId", args.sessionId),
    )
    .collect();
  const now = Date.now();
  return rows.some(
    (row) =>
      row.level >= args.requiredLevel &&
      (args.freshnessMs === undefined || now - row.verifiedAt <= args.freshnessMs),
  );
}

/** Which methods a user could actually use right now, for the frontend's
 * method switcher — email code is always available, TOTP/recovery only once
 * enrolled.
 *
 * `minLevel` filters out anything that would verify successfully and still
 * leave the requirement unmet. Offering such a method is worse than offering
 * nothing: the server says `ok: true`, the screen congratulates the user, and
 * the gate never opens. Nothing in this list is a dead end. */
export async function availableMethodsFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  minLevel = 0,
): Promise<StepMethod[]> {
  const methods: StepMethod[] = ["email_code"];
  const totp = await ctx.db
    .query("totpCredentials")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (totp?.verifiedAt) {
    if (!totp.recoveryUsedAt) methods.push("totp");
    const hasUnusedRecovery = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .first();
    if (hasUnusedRecovery) methods.push("recovery_code");
  }
  return methods.filter((method) => LEVEL[method] >= minLevel);
}

/** Whether signing in again with a passkey would clear this requirement —
 * the escape hatch for someone whose only strong credential is a passkey and
 * who therefore has no code they can type. */
export async function passkeyWouldSatisfy(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  requirement: Pick<SignInRequirement, "requiredLevel" | "requireNonPasskeyFactor">,
): Promise<boolean> {
  if (requirement.requireNonPasskeyFactor) return false;
  if (LEVEL.passkey < requirement.requiredLevel) return false;
  const passkey = await ctx.db
    .query("passkeys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return !!passkey;
}

/** Mints and stores a fresh email code for (user, session), mailing the
 * plaintext to the caller. Throws while inside the request cooldown. */
export async function issueEmailCode(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: string,
  context: StepUpContext,
): Promise<string> {
  const now = Date.now();
  const existing = await ctx.db
    .query("stepUpChallenges")
    .withIndex("by_user_session", (q) => q.eq("userId", user._id).eq("sessionId", sessionId))
    .unique();
  if (existing && now - existing.createdAt < REQUEST_COOLDOWN_MS) {
    throw new ConvexError({
      code: "cooldown",
      message: "A code was just sent. Wait a moment before requesting another.",
    });
  }

  const code = generateCode();
  if (existing) await ctx.db.delete(existing._id);
  await ctx.db.insert("stepUpChallenges", {
    userId: user._id,
    sessionId,
    codeHash: await sha256hex(code),
    attempts: 0,
    expiresAt: now + CODE_TTL_MS,
    createdAt: now,
  });
  await ctx.db.insert("stepUpAuditLog", {
    userId: user._id,
    event: "challenge_issued",
    context,
    at: now,
  });
  await trackEvent(ctx, {
    event: "stepup_challenge_issued",
    distinctId: user.clerkUserId,
    properties: { context },
  });
  return code;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts"; attemptsLeft?: number }
  | { ok: false; reason: "wrong_code"; attemptsLeft: number };

/** Checks `code` against the (user, session)'s live email-code row, records
 * a `stepUpVerifications` row (level 1) on success. */
export async function verifyEmailCode(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: string,
  code: string,
  context: StepUpContext,
): Promise<VerifyResult> {
  const row = await ctx.db
    .query("stepUpChallenges")
    .withIndex("by_user_session", (q) => q.eq("userId", user._id).eq("sessionId", sessionId))
    .unique();
  if (!row) return { ok: false, reason: "no_code" };
  if (row.expiresAt <= Date.now()) {
    await ctx.db.delete(row._id);
    await recordFailed(ctx, user, "email_code", context, "expired");
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await ctx.db.delete(row._id);
    await recordFailed(ctx, user, "email_code", context, "too_many_attempts");
    return { ok: false, reason: "too_many_attempts" };
  }

  const candidateHash = await sha256hex(code.trim());
  if (!safeEqual(candidateHash, row.codeHash)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(row._id);
      await recordFailed(ctx, user, "email_code", context, "too_many_attempts");
      return { ok: false, reason: "too_many_attempts" };
    }
    await ctx.db.patch(row._id, { attempts });
    await recordFailed(ctx, user, "email_code", context, "wrong_code");
    return { ok: false, reason: "wrong_code", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  await ctx.db.patch(row._id, { verifiedAt: Date.now() });
  await recordVerified(ctx, user, sessionId, "email_code", context);
  return { ok: true };
}

/** Called by apps/api after it independently verifies TOTP/recovery-code
 * (that crypto lives there, not in Convex) — records the outcome. */
export async function recordExternalVerification(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    sessionId: string;
    method: "totp" | "recovery_code";
    ok: boolean;
    context: StepUpContext;
  },
): Promise<void> {
  const user = await ctx.db.get(args.userId);
  if (!user) return;
  if (args.ok) {
    await recordVerified(ctx, user, args.sessionId, args.method, args.context);
  } else {
    await recordFailed(ctx, user, args.method, args.context, "wrong_code");
  }
}

/** Records a passkey-sign-in claim (level 3) — the one method the frontend
 * itself is not trusted to self-report; see stepUpPasskeyTickets and
 * `claimPasskeyTicket` in stepUp.ts. */
export async function recordPasskeyVerification(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: string,
): Promise<void> {
  await recordVerified(ctx, user, sessionId, "passkey", "sign_in");
}

// --- Org policy + per-session sign-in requirement ---------------------------

type PolicyRow = Doc<"authPolicy">;
type DefaultPolicy = Omit<PolicyRow, "_id" | "_creationTime" | "updatedByUserId"> & {
  updatedByUserId?: Id<"users">;
};

const DEFAULT_POLICY: DefaultPolicy = {
  requireMfaScope: "off",
  requireMfaRetroactive: false,
  mfaPolicySetAt: 0,
  requireMfaForDestructive: false,
  destructiveActionTtlMinutes: 10,
  minDestructiveLevel: 1,
  requirePasskeyScope: "off",
  requirePasskeyRetroactive: false,
  passkeyPolicySetAt: 0,
  gracePeriodDays: 0,
  exemptUserIds: [],
  updatedAt: 0,
};

/** The org policy row, or sensible all-off defaults when none has been set
 * yet — mirrors `featureFlags`' "absent row = default" convention, just for
 * a whole settings object instead of one key. Singleton: at most one row
 * ever exists, so `.first()` is the whole lookup. */
export async function getOrDefaultPolicy(
  ctx: QueryCtx | MutationCtx,
): Promise<PolicyRow | DefaultPolicy> {
  return (await ctx.db.query("authPolicy").first()) ?? DEFAULT_POLICY;
}

function graceDeadlineFor(
  policySetAt: number,
  retroactive: boolean,
  accountPredatesPolicy: boolean,
  gracePeriodDays: number,
): number | null {
  if (!retroactive || !accountPredatesPolicy || gracePeriodDays <= 0) return null;
  return policySetAt + gracePeriodDays * 86_400_000;
}

export interface SignInRequirement {
  /** Satisfied by any method at this level or higher, passkey included. 0 = nothing required. */
  requiredLevel: number;
  /** The user's own "always require MFA, even after a passkey" preference —
   * checked separately because a passkey (level 3) would otherwise trivially
   * satisfy any level-based check, defeating the point of the preference. */
  requireNonPasskeyFactor: boolean;
  needsMfaEnrollment: boolean;
  mfaGraceDeadline: number | null;
  needsPasskeyEnrollment: boolean;
  passkeyGraceDeadline: number | null;
}

/** Combines org policy + this user's own preference + role + this session's
 * risk signal into what today's sign-in needs. The one function `stepUp.status`
 * (the query AppGate polls) builds its response from. */
export async function resolveSignInRequirement(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  sessionId: string,
): Promise<SignInRequirement> {
  const policy = await getOrDefaultPolicy(ctx);
  if (policy.exemptUserIds.includes(user._id)) {
    return {
      requiredLevel: 0,
      requireNonPasskeyFactor: false,
      needsMfaEnrollment: false,
      mfaGraceDeadline: null,
      needsPasskeyEnrollment: false,
      passkeyGraceDeadline: null,
    };
  }

  const role = effectiveRole(user);
  const inScope = (scope: PolicyRow["requireMfaScope"]) =>
    scope === "all" || (scope === "managers_and_up" && MANAGER_ROLES.includes(role));

  const mfaAccountPredatesPolicy = user.createdAt < policy.mfaPolicySetAt;
  const mfaApplies = inScope(policy.requireMfaScope) && (
    !mfaAccountPredatesPolicy || policy.requireMfaRetroactive
  );
  const mfaGraceDeadline = graceDeadlineFor(
    policy.mfaPolicySetAt,
    policy.requireMfaRetroactive,
    mfaAccountPredatesPolicy,
    policy.gracePeriodDays,
  );
  const inMfaGrace = mfaGraceDeadline !== null && Date.now() < mfaGraceDeadline;

  const passkeyAccountPredatesPolicy = user.createdAt < policy.passkeyPolicySetAt;
  const passkeyApplies = inScope(policy.requirePasskeyScope) && (
    !passkeyAccountPredatesPolicy || policy.requirePasskeyRetroactive
  );
  const passkeyGraceDeadline = graceDeadlineFor(
    policy.passkeyPolicySetAt,
    policy.requirePasskeyRetroactive,
    passkeyAccountPredatesPolicy,
    policy.gracePeriodDays,
  );
  const inPasskeyGrace = passkeyGraceDeadline !== null && Date.now() < passkeyGraceDeadline;

  const totp = await ctx.db
    .query("totpCredentials")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  const hasPasskeyCred = await ctx.db
    .query("passkeys")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  // A TOTP row whose recovery code has been spent is a credential the user
  // told us they've lost — it keeps working for this session's sign-in, but
  // it no longer counts as "this account has MFA", which is what pushes them
  // into re-enrollment on the way in.
  const hasQualifyingMfaCredential = (!!totp?.verifiedAt && !totp.recoveryUsedAt) || !!hasPasskeyCred;

  const needsMfaEnrollment = mfaApplies && !inMfaGrace && !hasQualifyingMfaCredential;
  const needsPasskeyEnrollment = passkeyApplies && !inPasskeyGrace && !hasPasskeyCred;

  const pref = await ctx.db
    .query("securityPreferences")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  // `.first()` off a descending scan, not `.unique()`: `apiEvaluateDevice`
  // upserts going forward, but this read must stay crash-proof against any
  // row this account already accumulated before that fix existed — take the
  // most recently evaluated signal rather than throwing on more than one.
  const riskSignal = await ctx.db
    .query("sessionRiskSignals")
    .withIndex("by_user_session", (q) => q.eq("userId", user._id).eq("sessionId", sessionId))
    .order("desc")
    .first();

  let requiredLevel = 0;
  if (mfaApplies && !needsMfaEnrollment) requiredLevel = Math.max(requiredLevel, ORG_MFA_LEVEL);
  if (riskSignal?.newDevice) requiredLevel = Math.max(requiredLevel, LEVEL.email_code);

  return {
    requiredLevel,
    requireNonPasskeyFactor: pref?.alwaysRequireMfaAtSignIn === true,
    needsMfaEnrollment,
    // `inMfaGrace`/`inPasskeyGrace` are purely time-windowed — they don't
    // know whether the user already enrolled. Without the credential check
    // here too, the grace-period banner (and its "which policy is this
    // about" flag in `stepUp.status`) kept nagging about a requirement the
    // user had already fulfilled, for as long as the grace window lasted.
    mfaGraceDeadline: inMfaGrace && !hasQualifyingMfaCredential ? mfaGraceDeadline : null,
    needsPasskeyEnrollment,
    passkeyGraceDeadline: inPasskeyGrace && !hasPasskeyCred ? passkeyGraceDeadline : null,
  };
}

/** Whether this (user, session) has cleared any method *other than* passkey
 * at level 1+ — what the "always require MFA even after a passkey"
 * preference actually checks (see `SignInRequirement.requireNonPasskeyFactor`). */
export async function hasNonPasskeyVerification(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  sessionId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .query("stepUpVerifications")
    .withIndex("by_user_session", (q) => q.eq("userId", userId).eq("sessionId", sessionId))
    .collect();
  return rows.some((row) => row.method !== "passkey" && row.level >= 1);
}
