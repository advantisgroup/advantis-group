import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { sha256hex } from "./activity/lib/crypto";
import {
  effectiveRole,
  getUserByClerkId,
  MANAGER_ROLES,
  requireAdmin,
  requireUser,
  type Role,
} from "./lib/auth";
import { trackEvent } from "./lib/analytics";
import { displayName } from "./lib/users";
import {
  availableMethodsFor,
  checkSatisfied,
  getOrDefaultPolicy,
  hasNonPasskeyVerification,
  issueEmailCode,
  LEVEL,
  recordExternalVerification,
  recordPasskeyVerification,
  resolveSignInRequirement,
  verifyEmailCode,
} from "./lib/stepUp";

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

const scopeValidator = v.union(v.literal("off"), v.literal("all"), v.literal("managers_and_up"));

const policyFieldsValidator = {
  requireMfaScope: scopeValidator,
  requireMfaRetroactive: v.boolean(),
  requireMfaForDestructive: v.boolean(),
  destructiveActionTtlMinutes: v.number(),
  minDestructiveLevel: v.number(),
  requirePasskeyScope: scopeValidator,
  requirePasskeyRetroactive: v.boolean(),
  gracePeriodDays: v.number(),
  exemptUserIds: v.array(v.id("users")),
};

// --- Org-wide policy (admin only) ---------------------------------------------

export const orgPolicy = query({
  args: {},
  returns: v.object({ ...policyFieldsValidator, updatedAt: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const policy = await getOrDefaultPolicy(ctx);
    return {
      requireMfaScope: policy.requireMfaScope,
      requireMfaRetroactive: policy.requireMfaRetroactive,
      requireMfaForDestructive: policy.requireMfaForDestructive,
      destructiveActionTtlMinutes: policy.destructiveActionTtlMinutes,
      minDestructiveLevel: policy.minDestructiveLevel,
      requirePasskeyScope: policy.requirePasskeyScope,
      requirePasskeyRetroactive: policy.requirePasskeyRetroactive,
      gracePeriodDays: policy.gracePeriodDays,
      exemptUserIds: policy.exemptUserIds,
      updatedAt: policy.updatedAt,
    };
  },
});

export const setOrgPolicy = mutation({
  args: policyFieldsValidator,
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db.query("authPolicy").first();
    const now = Date.now();

    // Only bumped when the fields that actually gate enforcement change —
    // editing, say, the destructive-action TTL must not reset "does this
    // account predate the MFA requirement" for everyone.
    const mfaChanged =
      !existing ||
      existing.requireMfaScope !== args.requireMfaScope ||
      existing.requireMfaRetroactive !== args.requireMfaRetroactive;
    const passkeyChanged =
      !existing ||
      existing.requirePasskeyScope !== args.requirePasskeyScope ||
      existing.requirePasskeyRetroactive !== args.requirePasskeyRetroactive;

    const doc = {
      ...args,
      mfaPolicySetAt: mfaChanged ? now : (existing?.mfaPolicySetAt ?? now),
      passkeyPolicySetAt: passkeyChanged ? now : (existing?.passkeyPolicySetAt ?? now),
      updatedAt: now,
      updatedByUserId: admin._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("authPolicy", doc);
    }

    await ctx.db.insert("stepUpAuditLog", {
      userId: admin._id,
      event: "policy_changed",
      detail: `mfa=${args.requireMfaScope}(retro=${args.requireMfaRetroactive}) passkey=${args.requirePasskeyScope}(retro=${args.requirePasskeyRetroactive})`,
      at: now,
    });
    await trackEvent(ctx, {
      event: "org_auth_policy_changed",
      distinctId: admin.clerkUserId,
      properties: {
        requireMfaScope: args.requireMfaScope,
        requireMfaRetroactive: args.requireMfaRetroactive,
        requirePasskeyScope: args.requirePasskeyScope,
        requirePasskeyRetroactive: args.requirePasskeyRetroactive,
        requireMfaForDestructive: args.requireMfaForDestructive,
      },
    });
    return { ok: true };
  },
});

const contextValidator = v.union(
  v.literal("sign_in"),
  v.literal("destructive"),
  v.literal("admin_reverify"),
);
const stepMethodValidator = v.union(
  v.literal("email_code"),
  v.literal("totp"),
  v.literal("recovery_code"),
  v.literal("passkey"),
);

// --- Email code ---------------------------------------------------------------
//
// Server-key-gated like the rest of this file's `api*` functions — every call
// from apps/api impersonates a resolved `clerkUserId` rather than forwarding
// the browser's own Clerk JWT to Convex, matching totp.ts/passkeys.ts. The
// frontend's `<StepUpForm>` always talks to apps/api's `/auth/step-up/*`
// routes, never to these directly.

export const apiRequestEmailCode = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), sessionId: v.string(), context: contextValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
    const code = await issueEmailCode(ctx, user, args.sessionId, args.context);
    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "admin-verification-code",
      to: user.email,
      data: { code, expiresInMinutes: 10 },
    });
    return { ok: true };
  },
});

export const apiSubmitEmailCode = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    sessionId: v.string(),
    code: v.string(),
    context: contextValidator,
  },
  returns: v.object({ ok: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) return { ok: false, message: "User not found" };
    const result = await verifyEmailCode(ctx, user, args.sessionId, args.code, args.context);
    if (result.ok) return { ok: true };
    const message =
      result.reason === "wrong_code"
        ? `Incorrect code. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`
        : result.reason === "expired"
          ? "This code has expired. Request a new one."
          : result.reason === "too_many_attempts"
            ? "Too many incorrect attempts. Request a new code."
            : "No code is waiting. Request one first.";
    return { ok: false, message };
  },
});

// --- Called from apps/api after it verifies TOTP/recovery-code itself --------

export const apiRecordVerification = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    sessionId: v.string(),
    method: v.union(v.literal("totp"), v.literal("recovery_code")),
    ok: v.boolean(),
    context: contextValidator,
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) return { ok: false };
    await recordExternalVerification(ctx, {
      userId: user._id,
      sessionId: args.sessionId,
      method: args.method,
      ok: args.ok,
      context: args.context,
    });
    return { ok: true };
  },
});

// --- Passkey ticket handoff (see apps/api/src/lib/passkeys.ts) ---------------

export const apiIssuePasskeyTicket = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.object({ ticket: v.string() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await ctx.db.insert("stepUpPasskeyTickets", {
      userId: user._id,
      tokenHash: await sha256hex(ticket),
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    return { ticket };
  },
});

/** Server-key-gated rather than a plain user-session mutation — called from
 * apps/api right after `setActive()`, before Convex's own client has
 * necessarily picked up the freshly-created session, so this can't rely on
 * `ctx.auth` naming the right identity yet. */
export const apiClaimPasskeyTicket = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), ticket: v.string(), sessionId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) return { ok: false };
    const tokenHash = await sha256hex(args.ticket);
    const row = await ctx.db
      .query("stepUpPasskeyTickets")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row || row.usedAt || row.expiresAt <= Date.now() || row.userId !== user._id) {
      return { ok: false };
    }
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    await recordPasskeyVerification(ctx, user, args.sessionId);
    return { ok: true };
  },
});

// --- Device/risk signal (see apps/api's device-evaluate route) ---------------

export const apiEvaluateDevice = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), sessionId: v.string(), deviceHash: v.string() },
  returns: v.object({ newDevice: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });

    const now = Date.now();
    const existing = await ctx.db
      .query("knownDevices")
      .withIndex("by_user_hash", (q) =>
        q.eq("userId", user._id).eq("deviceHash", args.deviceHash),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
    } else {
      await ctx.db.insert("knownDevices", {
        userId: user._id,
        deviceHash: args.deviceHash,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }

    // A brand new device is only "suspicious" if this user already had a
    // different one on file — a first-ever sign-in isn't a risk signal.
    let flagAsNew = false;
    if (!existing) {
      const priorDevices = await ctx.db
        .query("knownDevices")
        .withIndex("by_user_hash", (q) => q.eq("userId", user._id))
        .collect();
      flagAsNew = priorDevices.length > 1;
    }

    // Upsert: AppGate re-fires this once per Clerk session, but "once per
    // session" only holds per browser tab/mount — a page refresh resets the
    // guarding ref and re-triggers the same (user, session) call. A blind
    // insert here left a second row behind every time, which made the
    // `by_user_session` read in `resolveSignInRequirement` throw and crash
    // the whole app. `.collect()` (not `.unique()`) so an account that
    // already accumulated duplicate rows before this fix self-heals here
    // instead of needing them deleted by hand — keep the newest, drop the
    // rest.
    const existingSignals = await ctx.db
      .query("sessionRiskSignals")
      .withIndex("by_user_session", (q) =>
        q.eq("userId", user._id).eq("sessionId", args.sessionId),
      )
      .collect();
    const [keep, ...duplicates] = existingSignals;
    for (const dup of duplicates) await ctx.db.delete(dup._id);
    if (keep) {
      await ctx.db.patch(keep._id, { newDevice: flagAsNew, evaluatedAt: now });
    } else {
      await ctx.db.insert("sessionRiskSignals", {
        userId: user._id,
        sessionId: args.sessionId,
        newDevice: flagAsNew,
        evaluatedAt: now,
      });
    }
    if (flagAsNew) {
      await ctx.db.insert("stepUpAuditLog", {
        userId: user._id,
        event: "new_device_detected",
        context: "sign_in",
        at: now,
      });
      await trackEvent(ctx, {
        event: "new_device_detected",
        distinctId: user.clerkUserId,
        properties: {},
      });
    }
    return { newDevice: flagAsNew };
  },
});

// --- The status the client gate polls -----------------------------------------

export const status = query({
  args: { sessionId: v.string() },
  returns: v.union(
    v.object({ state: v.literal("satisfied") }),
    v.object({
      state: v.literal("warning"),
      graceDeadline: v.number(),
      needsPasskeyEnrollment: v.boolean(),
    }),
    v.object({
      state: v.literal("needs_verification"),
      requiredLevel: v.number(),
      availableMethods: v.array(stepMethodValidator),
    }),
    v.object({
      state: v.literal("needs_enrollment"),
      needsMfa: v.boolean(),
      needsPasskey: v.boolean(),
    }),
  ),
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);
    const req = await resolveSignInRequirement(ctx, user, sessionId);

    if (req.needsMfaEnrollment || req.needsPasskeyEnrollment) {
      return {
        state: "needs_enrollment" as const,
        needsMfa: req.needsMfaEnrollment,
        needsPasskey: req.needsPasskeyEnrollment,
      };
    }

    const levelSatisfied = await checkSatisfied(ctx, {
      userId: user._id,
      sessionId,
      requiredLevel: req.requiredLevel,
    });
    const nonPasskeySatisfied =
      !req.requireNonPasskeyFactor || (await hasNonPasskeyVerification(ctx, user._id, sessionId));
    if (!levelSatisfied || !nonPasskeySatisfied) {
      return {
        state: "needs_verification" as const,
        requiredLevel: Math.max(req.requiredLevel, req.requireNonPasskeyFactor ? LEVEL.email_code : 0),
        availableMethods: await availableMethodsFor(ctx, user._id),
      };
    }

    const graceDeadlines = [req.mfaGraceDeadline, req.passkeyGraceDeadline].filter(
      (d): d is number => d !== null,
    );
    if (graceDeadlines.length > 0) {
      return {
        state: "warning" as const,
        graceDeadline: Math.min(...graceDeadlines),
        needsPasskeyEnrollment: req.passkeyGraceDeadline !== null,
      };
    }

    return { state: "satisfied" as const };
  },
});

// --- Personal sign-in preference ----------------------------------------------
//
// Plain user-session query/mutation, same upsert shape as
// notifications.ts's getPreferences/setPreferences — called directly from
// the browser, not routed through apps/api like the step-up flows above.

export const securityPreference = query({
  args: {},
  returns: v.object({ alwaysRequireMfaAtSignIn: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const pref = await ctx.db
      .query("securityPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { alwaysRequireMfaAtSignIn: pref?.alwaysRequireMfaAtSignIn === true };
  },
});

export const setSecurityPreference = mutation({
  args: { alwaysRequireMfaAtSignIn: v.boolean() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { alwaysRequireMfaAtSignIn }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("securityPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { alwaysRequireMfaAtSignIn, updatedAt: now });
    } else {
      await ctx.db.insert("securityPreferences", {
        userId: user._id,
        alwaysRequireMfaAtSignIn,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

// --- Security standard (admin only) -------------------------------------------

/** Exact, DB-backed adoption numbers and a list of accounts that don't yet
 * meet the current policy — the thing this whole feature was partly built to
 * replace "go look in the Convex dashboard" with. PostHog carries the
 * behavioral/funnel side (enrollment drop-off, step-up pass rate over time);
 * this carries the live compliance answer, which needs to be exact, not a
 * round trip through an analytics query. */
export const orgStandard = query({
  args: {},
  returns: v.object({
    totalActive: v.number(),
    mfaEnrolledCount: v.number(),
    mfaEnrolledPct: v.number(),
    passkeyEnrolledCount: v.number(),
    passkeyEnrolledPct: v.number(),
    nonCompliant: v.array(
      v.object({
        userId: v.id("users"),
        name: v.string(),
        role: v.string(),
        missing: v.array(v.union(v.literal("mfa"), v.literal("passkey"))),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const totpDocs = await ctx.db.query("totpCredentials").collect();
    const totpUserIds = new Set(totpDocs.filter((d) => d.verifiedAt).map((d) => d.userId));
    const passkeyDocs = await ctx.db.query("passkeys").collect();
    const passkeyUserIds = new Set(passkeyDocs.map((d) => d.userId));
    const policy = await getOrDefaultPolicy(ctx);

    const inScope = (scope: "off" | "all" | "managers_and_up", role: Role) =>
      scope === "all" || (scope === "managers_and_up" && MANAGER_ROLES.includes(role));

    const mfaEnrolledCount = users.filter(
      (u) => totpUserIds.has(u._id) || passkeyUserIds.has(u._id),
    ).length;
    const passkeyEnrolledCount = users.filter((u) => passkeyUserIds.has(u._id)).length;

    const nonCompliant: {
      userId: (typeof users)[number]["_id"];
      name: string;
      role: string;
      missing: ("mfa" | "passkey")[];
    }[] = [];
    for (const u of users) {
      if (nonCompliant.length >= 200) break;
      if (policy.exemptUserIds.includes(u._id)) continue;
      const role = effectiveRole(u);
      const missing: ("mfa" | "passkey")[] = [];
      if (
        inScope(policy.requireMfaScope, role) &&
        !totpUserIds.has(u._id) &&
        !passkeyUserIds.has(u._id)
      ) {
        missing.push("mfa");
      }
      if (inScope(policy.requirePasskeyScope, role) && !passkeyUserIds.has(u._id)) {
        missing.push("passkey");
      }
      if (missing.length > 0) {
        nonCompliant.push({ userId: u._id, name: displayName(u), role: u.role, missing });
      }
    }

    return {
      totalActive: users.length,
      mfaEnrolledCount,
      mfaEnrolledPct: users.length ? mfaEnrolledCount / users.length : 0,
      passkeyEnrolledCount,
      passkeyEnrolledPct: users.length ? passkeyEnrolledCount / users.length : 0,
      nonCompliant,
    };
  },
});

/** Drops `knownDevices` rows nobody's signed in from in ~180 days — a rolling
 * recognition list, not a permanent log. Scheduled from crons.ts. */
export const purgeStaleDevices = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("knownDevices")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", cutoff))
      .take(500);
    await Promise.all(stale.map((d) => ctx.db.delete(d._id)));
    return { deleted: stale.length };
  },
});
