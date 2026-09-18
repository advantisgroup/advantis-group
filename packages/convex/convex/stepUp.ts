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
  AREA_REVERIFY_DEFAULT_DAYS,
  AREA_REVERIFY_LEVEL,
  areaReverifyWindowMs,
  availableMethodsFor,
  checkSatisfied,
  destructiveRequirement,
  getAreaPreference,
  getOrDefaultPolicy,
  hasNonPasskeyVerification,
  hasOptedOutOfDeviceTracking,
  isAreaTrusted,
  issueEmailCode,
  LEGACY_PASSWORD_GRACE_DEFAULT_DAYS,
  legacyPasswordSunsetDeadline,
  LEVEL,
  passkeyWouldSatisfy,
  recordAreaStepUp,
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
  // Phase 7 of docs/future-features/21_auth-consolidation.md.
  areaReverifyDays: v.number(),
  // Phase 8: whether *this* toggle is on, not when it was turned on — the
  // handler computes `SetAt` itself, same as `mfaPolicySetAt` above.
  performanceLegacyPasswordSunsetEnabled: v.boolean(),
  applicantVaultLegacyPasswordSunsetEnabled: v.boolean(),
  legacyPasswordGraceDays: v.number(),
};

// --- Org-wide policy (admin only) ---------------------------------------------

export const orgPolicy = query({
  args: {},
  returns: v.object({
    ...policyFieldsValidator,
    // Derived, not directly settable — see `legacyPasswordSunsetDeadline`.
    performanceLegacyPasswordSunsetDeadline: v.union(v.number(), v.null()),
    applicantVaultLegacyPasswordSunsetDeadline: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  }),
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
      areaReverifyDays: policy.areaReverifyDays ?? AREA_REVERIFY_DEFAULT_DAYS,
      performanceLegacyPasswordSunsetEnabled:
        policy.performanceLegacyPasswordSunsetEnabled === true,
      applicantVaultLegacyPasswordSunsetEnabled:
        policy.applicantVaultLegacyPasswordSunsetEnabled === true,
      legacyPasswordGraceDays: policy.legacyPasswordGraceDays ?? LEGACY_PASSWORD_GRACE_DEFAULT_DAYS,
      performanceLegacyPasswordSunsetDeadline: legacyPasswordSunsetDeadline(policy, "performance"),
      applicantVaultLegacyPasswordSunsetDeadline: legacyPasswordSunsetDeadline(
        policy,
        "applicant_vault",
      ),
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
    // Phase 8: bumped whenever the toggle itself changes, in either
    // direction — turning it back on after turning it off restarts the
    // clock rather than resuming the old deadline, same as the two above.
    const performanceSunsetChanged =
      (existing?.performanceLegacyPasswordSunsetEnabled === true) !==
      args.performanceLegacyPasswordSunsetEnabled;
    const applicantVaultSunsetChanged =
      (existing?.applicantVaultLegacyPasswordSunsetEnabled === true) !==
      args.applicantVaultLegacyPasswordSunsetEnabled;

    const doc = {
      ...args,
      mfaPolicySetAt: mfaChanged ? now : (existing?.mfaPolicySetAt ?? now),
      passkeyPolicySetAt: passkeyChanged ? now : (existing?.passkeyPolicySetAt ?? now),
      performanceLegacyPasswordSunsetSetAt: performanceSunsetChanged
        ? now
        : (existing?.performanceLegacyPasswordSunsetSetAt ?? now),
      applicantVaultLegacyPasswordSunsetSetAt: applicantVaultSunsetChanged
        ? now
        : (existing?.applicantVaultLegacyPasswordSunsetSetAt ?? now),
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
  v.literal("area_reverify"),
);
const stepMethodValidator = v.union(
  v.literal("email_code"),
  v.literal("totp"),
  v.literal("recovery_code"),
  v.literal("passkey"),
);
const areaValidator = v.union(v.literal("performance"), v.literal("applicant_vault"));

// --- Email code ---------------------------------------------------------------
//
// Server-key-gated like the rest of this file's `api*` functions — every call
// from apps/api impersonates a resolved `clerkUserId` rather than forwarding
// the browser's own Clerk JWT to Convex, matching totp.ts/passkeys.ts. The
// frontend's `<StepUpForm>` always talks to apps/api's `/auth/step-up/*`
// routes, never to these directly.

export const apiRequestEmailCode = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    sessionId: v.string(),
    context: contextValidator,
  },
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
    // Phase 7: only meaningful (and only ever passed) with context ===
    // "area_reverify" — which linked area's 14-day trust this clearance
    // should also renew, on top of the session-scoped verification every
    // context records.
    area: v.optional(areaValidator),
  },
  returns: v.object({ ok: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) return { ok: false, message: "User not found" };
    const result = await verifyEmailCode(ctx, user, args.sessionId, args.code, args.context);
    if (result.ok) {
      if (args.context === "area_reverify" && args.area) {
        await recordAreaStepUp(ctx, user._id, args.area, "email_code");
      }
      return { ok: true };
    }
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
    area: v.optional(areaValidator),
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
    if (args.ok && args.context === "area_reverify" && args.area) {
      await recordAreaStepUp(ctx, user._id, args.area, args.method);
    }
    return { ok: true };
  },
});

// --- Passkey ticket handoff (see apps/api/src/lib/passkeys.ts) ---------------

/** Records a passkey re-verification for an existing session — the in-session
 * sibling of the ticket dance below, for when someone re-verifies with their
 * passkey instead of typing a code. apps/api has already checked the WebAuthn
 * assertion and that the credential belongs to this caller. */
export const apiRecordPasskeyStepUp = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    sessionId: v.string(),
    context: contextValidator,
    area: v.optional(areaValidator),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) return { ok: false };
    await recordPasskeyVerification(ctx, user, args.sessionId, args.context);
    if (args.context === "area_reverify" && args.area) {
      await recordAreaStepUp(ctx, user._id, args.area, "passkey");
    }
    return { ok: true };
  },
});

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
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    ticket: v.string(),
    sessionId: v.string(),
  },
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

// --- Destructive-action gate (see apps/api's totp/passkey removal routes) ----

/** Asked by apps/api immediately before it removes an authenticator app or a
 * passkey. Returns the hint shape the frontend already knows from
 * `passwordResets.ts` rather than throwing, so the caller can put a
 * `<StepUpDialog>` in front of the action and retry it. */
export const apiDestructiveGate = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), sessionId: v.string() },
  returns: v.object({
    satisfied: v.boolean(),
    requiredLevel: v.number(),
    availableMethods: v.array(stepMethodValidator),
  }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
    const { requiredLevel, freshnessMs } = await destructiveRequirement(ctx, user);
    const satisfied = await checkSatisfied(ctx, {
      userId: user._id,
      sessionId: args.sessionId,
      requiredLevel,
      freshnessMs,
    });
    return {
      satisfied,
      requiredLevel,
      availableMethods: satisfied
        ? []
        : await availableMethodsFor(ctx, user._id, requiredLevel, { includePasskey: true }),
    };
  },
});

// --- Device/risk signal (see apps/api's device-evaluate route) ---------------

export const apiEvaluateDevice = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    sessionId: v.string(),
    deviceHash: v.string(),
    // Phase 7: a coarse "Chrome on macOS"-style label, used only as the
    // default `name` on first sight of a device — never overwrites a name
    // the user picked themselves in /settings.
    deviceLabel: v.optional(v.string()),
  },
  returns: v.object({ newDevice: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });

    const now = Date.now();
    // Phase 7: a device only ever counts as trusted while the account opted
    // into recognition at all — declining costs convenience (near-universal
    // step-up via `isAreaTrusted`/`resolveSignInRequirement`'s existing
    // `newDevice` check), never security, and needs no separate code path
    // here beyond simply never stamping a `trustedUntil`.
    const trackingOptedOut = await hasOptedOutOfDeviceTracking(ctx, user._id);
    const trustedUntil = trackingOptedOut ? undefined : now + (await areaReverifyWindowMs(ctx));

    const existing = await ctx.db
      .query("knownDevices")
      .withIndex("by_user_hash", (q) => q.eq("userId", user._id).eq("deviceHash", args.deviceHash))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now, trustedUntil });
    } else {
      await ctx.db.insert("knownDevices", {
        userId: user._id,
        deviceHash: args.deviceHash,
        firstSeenAt: now,
        lastSeenAt: now,
        name: args.deviceLabel,
        trustedUntil,
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
      .withIndex("by_user_session", (q) => q.eq("userId", user._id).eq("sessionId", args.sessionId))
      .collect();
    const [keep, ...duplicates] = existingSignals;
    for (const dup of duplicates) await ctx.db.delete(dup._id);
    if (keep) {
      // Write-once per session: a re-evaluation must never *clear* a flag an
      // earlier one raised. The first call for a new device inserts it into
      // `knownDevices` above, so every later call in the same session sees a
      // familiar device and computes `flagAsNew: false` — and since a page
      // refresh re-fires this route (AppGate's guarding ref is per-mount),
      // reloading the step-up screen used to downgrade the signal, drop
      // `requiredLevel` back to 0 and let the gate disappear unverified.
      // Only a genuinely new Clerk session (new sessionId → new row) gets a
      // fresh verdict; clearing this one happens by passing the gate, which
      // records a verification that satisfies the level.
      await ctx.db.patch(keep._id, {
        newDevice: keep.newDevice || flagAsNew,
        evaluatedAt: now,
      });
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
      /** True when signing in again with a passkey would clear this — the
       * only route left for someone whose sole strong factor is a passkey,
       * since there's no code they can type in. */
      passkeyFallback: v.boolean(),
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
      const requiredLevel = Math.max(
        req.requiredLevel,
        req.requireNonPasskeyFactor ? LEVEL.email_code : 0,
      );
      return {
        state: "needs_verification" as const,
        requiredLevel,
        // Only methods that would actually clear `requiredLevel` — see
        // `availableMethodsFor`. An empty list plus no passkey fallback is a
        // real state, not a bug: the screen says so instead of rendering a
        // form that can't succeed.
        availableMethods: await availableMethodsFor(ctx, user._id, requiredLevel),
        passkeyFallback: await passkeyWouldSatisfy(ctx, user._id, req),
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

// --- Phase 7: per-area access status + preference -----------------------------
//
// Plain user-session queries/mutations, called directly by each area's own
// entry point (the Performance login page, the HR vault gate) — the actual
// enforcement lives server-side in `performanceAuth.ts`/`applicantVault.ts`
// (a blocked area simply can't be resolved/unlocked); this is only what
// tells the frontend *why*, so it can show a step-up form instead of a dead
// end.

export const areaAccessStatus = query({
  args: { area: areaValidator },
  returns: v.union(
    v.object({ state: v.literal("satisfied") }),
    v.object({
      state: v.literal("needs_verification"),
      requiredLevel: v.number(),
      availableMethods: v.array(stepMethodValidator),
    }),
  ),
  handler: async (ctx, { area }) => {
    const user = await requireUser(ctx);
    if (await isAreaTrusted(ctx, user._id, area)) return { state: "satisfied" as const };
    return {
      state: "needs_verification" as const,
      requiredLevel: AREA_REVERIFY_LEVEL,
      availableMethods: await availableMethodsFor(ctx, user._id, AREA_REVERIFY_LEVEL, {
        includePasskey: true,
      }),
    };
  },
});

export const areaPreference = query({
  args: { area: areaValidator },
  returns: v.object({ mode: v.union(v.literal("always_step_up"), v.literal("trust_device")) }),
  handler: async (ctx, { area }) => {
    const user = await requireUser(ctx);
    return { mode: await getAreaPreference(ctx, user._id, area) };
  },
});

export const setAreaPreference = mutation({
  args: {
    area: areaValidator,
    mode: v.union(v.literal("always_step_up"), v.literal("trust_device")),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { area, mode }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("areaSecurityPreferences")
      .withIndex("by_user_area", (q) => q.eq("userId", user._id).eq("area", area))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { mode, updatedAt: now });
    } else {
      await ctx.db.insert("areaSecurityPreferences", {
        userId: user._id,
        area,
        mode,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

// --- Phase 7: trusted devices (/settings) --------------------------------------

export const trustedDevices = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("knownDevices"),
      name: v.string(),
      firstSeenAt: v.number(),
      lastSeenAt: v.number(),
      trusted: v.boolean(),
      trustedUntil: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("knownDevices")
      .withIndex("by_user_hash", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    return rows
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((d) => ({
        id: d._id,
        name: d.name ?? "Unrecognized device",
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        trusted: d.trustedUntil !== undefined && d.trustedUntil > now,
        trustedUntil: d.trustedUntil ?? null,
      }));
  },
});

export const renameDevice = mutation({
  args: { deviceId: v.id("knownDevices"), name: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { deviceId, name }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device || device.userId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Device not found" });
    }
    const trimmed = name.trim().slice(0, 60);
    await ctx.db.patch(deviceId, { name: trimmed || undefined });
    return { ok: true };
  },
});

/** Forgets a device outright rather than just clearing `trustedUntil` — the
 * whole point of `knownDevices` is recognition, so the next visit from this
 * browser has to look genuinely new again (forcing a fresh step-up via the
 * existing `newDevice` risk signal), not merely "known but untrusted". */
export const revokeDeviceTrust = mutation({
  args: { deviceId: v.id("knownDevices") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { deviceId }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db.get(deviceId);
    if (!device || device.userId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Device not found" });
    }
    await ctx.db.delete(deviceId);
    await ctx.db.insert("stepUpAuditLog", {
      userId: user._id,
      event: "device_trust_revoked",
      at: Date.now(),
    });
    return { ok: true };
  },
});

// --- Personal sign-in preference ----------------------------------------------
//
// Plain user-session query/mutation, same upsert shape as
// notifications.ts's getPreferences/setPreferences — called directly from
// the browser, not routed through apps/api like the step-up flows above.

export const securityPreference = query({
  args: {},
  returns: v.object({
    alwaysRequireMfaAtSignIn: v.boolean(),
    deviceTrackingOptOut: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const pref = await ctx.db
      .query("securityPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return {
      alwaysRequireMfaAtSignIn: pref?.alwaysRequireMfaAtSignIn === true,
      deviceTrackingOptOut: pref?.deviceTrackingOptOut === true,
    };
  },
});

export const setSecurityPreference = mutation({
  args: {
    alwaysRequireMfaAtSignIn: v.optional(v.boolean()),
    deviceTrackingOptOut: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("securityPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    const patch = {
      alwaysRequireMfaAtSignIn:
        args.alwaysRequireMfaAtSignIn ?? existing?.alwaysRequireMfaAtSignIn ?? false,
      deviceTrackingOptOut: args.deviceTrackingOptOut ?? existing?.deviceTrackingOptOut ?? false,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("securityPreferences", { userId: user._id, ...patch });
    }
    return { ok: true };
  },
});

// --- Personal security activity ------------------------------------------------

/**
 * The user's own security history, merged from the three audit tables that
 * have been collecting it since each feature shipped without anything ever
 * showing it to them.
 *
 * Lives here rather than in its own module purely because this repo can't run
 * `convex codegen` without a deployment, so a new file wouldn't be typed in
 * `_generated/api.d.ts`. Reads are per-user and indexed; the tables grow
 * without bound, so this takes a bounded slice of each rather than collecting.
 */
export const securityActivity = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      id: v.string(),
      source: v.union(v.literal("passkey"), v.literal("totp"), v.literal("step_up")),
      event: v.string(),
      detail: v.optional(v.string()),
      at: v.number(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    const take = Math.min(Math.max(limit ?? 20, 1), 50);

    // Each table is read newest-first on its own index, then the three are
    // merged — taking `take` from each guarantees the merged top `take` is
    // correct however lopsided the distribution is.
    const [passkeyRows, totpRows, stepUpRows] = await Promise.all([
      ctx.db
        .query("passkeyAuditLog")
        .withIndex("by_user_at", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(take),
      ctx.db
        .query("totpAuditLog")
        .withIndex("by_user_at", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(take),
      ctx.db
        .query("stepUpAuditLog")
        .withIndex("by_user_at", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(take),
    ]);

    const merged = [
      ...passkeyRows.map((row) => ({
        id: row._id as string,
        source: "passkey" as const,
        event: row.event as string,
        at: row.at,
      })),
      ...totpRows.map((row) => ({
        id: row._id as string,
        source: "totp" as const,
        event: row.event as string,
        at: row.at,
      })),
      ...stepUpRows
        // Noise, not history: a code being issued is the system talking to
        // itself, and the verification that follows already says what
        // happened. Policy changes are an admin action about the org, not an
        // event on this account.
        .filter((row) => row.event !== "challenge_issued" && row.event !== "policy_changed")
        .map((row) => ({
          id: row._id as string,
          source: "step_up" as const,
          event: row.event as string,
          ...(row.detail !== undefined ? { detail: row.detail } : {}),
          at: row.at,
        })),
    ];

    return merged.sort((a, b) => b.at - a.at).slice(0, take);
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

/** Phase 7's admin-visible companion metric to `orgStandard` above — the
 * device-trust opt-in/opt-out split and each area's "always step up" vs.
 * "trust device" preference split, so the org default set via
 * `setOrgPolicy`'s `areaReverifyDays` isn't the only thing visible on
 * `/admin/authentication`. */
export const areaStandard = query({
  args: {},
  returns: v.object({
    areaReverifyDays: v.number(),
    deviceTrackingOptOutCount: v.number(),
    deviceTrackingOptInCount: v.number(),
    byArea: v.array(
      v.object({
        area: areaValidator,
        alwaysStepUpCount: v.number(),
        trustDeviceCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    // Both preference tables are read unscoped and then filtered down to
    // this set — a deactivated user's stale row must not keep counting
    // against `users.length`, which would otherwise let these subtractions
    // go negative.
    const activeUserIds = new Set(users.map((u) => u._id));
    const prefs = await ctx.db.query("securityPreferences").collect();
    const deviceTrackingOptOutCount = prefs.filter(
      (p) => p.deviceTrackingOptOut === true && activeUserIds.has(p.userId),
    ).length;
    const areaPrefs = await ctx.db.query("areaSecurityPreferences").collect();
    const byArea = (["performance", "applicant_vault"] as const).map((area) => {
      const alwaysStepUpCount = areaPrefs.filter(
        (p) => p.area === area && p.mode === "always_step_up" && activeUserIds.has(p.userId),
      ).length;
      return {
        area,
        alwaysStepUpCount,
        trustDeviceCount: users.length - alwaysStepUpCount,
      };
    });
    const policy = await getOrDefaultPolicy(ctx);
    return {
      areaReverifyDays: policy.areaReverifyDays ?? AREA_REVERIFY_DEFAULT_DAYS,
      deviceTrackingOptOutCount,
      deviceTrackingOptInCount: users.length - deviceTrackingOptOutCount,
      byArea,
    };
  },
});

/** Phase 8's admin-visible companion metric — the migration's tail made
 * visible instead of silent, per the plan's own ask: "a per-area
 * count/countdown of accounts still on their legacy password, N days
 * left." The deadline is a single shared clock per area (whoever turned the
 * toggle on set it for everyone at once), so there's one countdown, not one
 * per account — what varies per account is only whether it's affected at
 * all. */
export const legacyPasswordStandard = query({
  args: {},
  returns: v.object({
    performance: v.object({
      enabled: v.boolean(),
      deadlineAt: v.union(v.number(), v.null()),
      accountsStillOnLegacyPassword: v.number(),
    }),
    applicantVault: v.object({
      enabled: v.boolean(),
      deadlineAt: v.union(v.number(), v.null()),
      accountsStillOnLegacyPassword: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const policy = await getOrDefaultPolicy(ctx);

    // Only a *linked* login is ever affected — one with no `linkedUserId`
    // has no password-less fallback, so it's never in scope here at all,
    // whether or not the sunset is enabled.
    const linkedLogins = await ctx.db
      .query("performanceLogins")
      .filter((q) =>
        q.and(q.neq(q.field("linkedUserId"), undefined), q.eq(q.field("active"), true)),
      )
      .collect();

    // Only a vault password belonging to a member who's also registered a
    // passkey is ever affected — same reasoning, the passkey is the only
    // other way in.
    const vaultPasswordRows = await ctx.db.query("applicantVaultPasswords").collect();
    const passkeyUserIds = new Set((await ctx.db.query("passkeys").collect()).map((p) => p.userId));
    const vaultAccountsWithFallback = vaultPasswordRows.filter((row) =>
      passkeyUserIds.has(row.userId),
    ).length;

    return {
      performance: {
        enabled: policy.performanceLegacyPasswordSunsetEnabled === true,
        deadlineAt: legacyPasswordSunsetDeadline(policy, "performance"),
        accountsStillOnLegacyPassword: linkedLogins.length,
      },
      applicantVault: {
        enabled: policy.applicantVaultLegacyPasswordSunsetEnabled === true,
        deadlineAt: legacyPasswordSunsetDeadline(policy, "applicant_vault"),
        accountsStillOnLegacyPassword: vaultAccountsWithFallback,
      },
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
