/**
 * The auth layer, walked through end to end.
 *
 * Everything here drives the real Convex functions against convex-test's
 * in-memory backend — no stubbing of the step-up engine itself. The point is
 * to pin down the two things that are easy to get quietly wrong: which
 * *level* each verification method records, and whether a given (policy,
 * credential, risk) combination actually opens the gate.
 *
 * Two seams are simulated rather than exercised, because they don't live in
 * Convex:
 *   - the email code is only ever mailed, so `plantEmailCode` rewrites the
 *     challenge row's hash to a code the test knows;
 *   - TOTP/recovery signature checking happens in apps/api, which then calls
 *     `apiRecordVerification` — so tests call that directly, the same way the
 *     API service does.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { sha256hex } from "../activity/lib/crypto";

// convex-test wants every function module plus `_generated`. The extglob
// pattern from its docs (`!(*.*.*)`) silently misses `_generated/*.js` under
// this Vite version, and a missing `_generated` is the one thing it can't
// recover from — so glob broadly and drop the non-modules by hand.

const serverKey = "test-server-key";
const SESSION = "sess_primary";
const DAY = 86_400_000;

function setup() {
  return convexTest(schema, modules);
}

/** Inferred from `setup` rather than written out, so `t.run`'s ctx keeps the
 * real data model and index names instead of degrading to the system tables. */
type T = ReturnType<typeof setup>;

async function seedUser(
  t: T,
  opts: { clerkUserId?: string; role?: "admin" | "manager" | "employee"; createdAt?: number } = {},
): Promise<Id<"users">> {
  const clerkUserId = opts.clerkUserId ?? "user_alice";
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: opts.role ?? "employee",
      status: "active",
      external: false,
      createdAt: opts.createdAt ?? Date.now(),
    }),
  );
}

/** The org policy row, with everything not named left at its "off" default. */
async function seedPolicy(
  t: T,
  updatedByUserId: Id<"users">,
  patch: Partial<{
    requireMfaScope: "off" | "all" | "managers_and_up";
    requireMfaRetroactive: boolean;
    mfaPolicySetAt: number;
    requireMfaForDestructive: boolean;
    destructiveActionTtlMinutes: number;
    minDestructiveLevel: number;
    requirePasskeyScope: "off" | "all" | "managers_and_up";
    requirePasskeyRetroactive: boolean;
    passkeyPolicySetAt: number;
    gracePeriodDays: number;
    exemptUserIds: Id<"users">[];
    areaReverifyDays: number;
    performanceLegacyPasswordSunsetEnabled: boolean;
    performanceLegacyPasswordSunsetSetAt: number;
    applicantVaultLegacyPasswordSunsetEnabled: boolean;
    applicantVaultLegacyPasswordSunsetSetAt: number;
    legacyPasswordGraceDays: number;
  }> = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("authPolicy", {
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
      updatedAt: Date.now(),
      updatedByUserId,
      ...patch,
    });
  });
}

async function seedTotp(t: T, userId: Id<"users">, { verified = true } = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert("totpCredentials", {
      userId,
      secretCiphertext: "ciphertext",
      createdAt: Date.now(),
      ...(verified ? { verifiedAt: Date.now() } : {}),
    });
  });
}

async function seedRecoveryCodes(t: T, userId: Id<"users">, codes: string[]) {
  await t.run(async (ctx) => {
    for (const code of codes) {
      await ctx.db.insert("totpRecoveryCodes", {
        userId,
        codeHash: await sha256hex(code),
        createdAt: Date.now(),
      });
    }
  });
}

async function seedPasskey(t: T, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("passkeys", {
      userId,
      credentialId: `cred_${userId}`,
      publicKey: "pk",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      name: "Test key",
      createdAt: Date.now(),
    });
  });
}

/** Request a code, then swap the stored hash for one the test knows. */
async function plantEmailCode(
  t: T,
  clerkUserId: string,
  userId: Id<"users">,
  code: string,
  sessionId = SESSION,
  context: "sign_in" | "destructive" | "admin_reverify" | "area_reverify" = "sign_in",
) {
  await t.mutation(api.security.stepUp.apiRequestEmailCode, {
    serverKey,
    clerkUserId,
    sessionId,
    context,
  });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("stepUpChallenges")
      .withIndex("by_user_session", (q) => q.eq("userId", userId).eq("sessionId", sessionId))
      .unique();
    if (!row) throw new Error("no challenge row was created");
    await ctx.db.patch(row._id, { codeHash: await sha256hex(code) });
  });
}

/** Every verification this session has banked, newest first. */
async function verifications(t: T, userId: Id<"users">, sessionId = SESSION) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("stepUpVerifications")
      .withIndex("by_user_session", (q) => q.eq("userId", userId).eq("sessionId", sessionId))
      .collect(),
  );
}

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

// ---------------------------------------------------------------------------

describe("verification levels", () => {
  test("an email code banks level 1", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456");

    const result = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    expect(result.ok).toBe(true);
    const rows = await verifications(t, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "email_code", level: 1, context: "sign_in" });
  });

  test("an authenticator code banks level 2", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);

    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "sign_in",
    });

    const rows = await verifications(t, userId);
    expect(rows[0]).toMatchObject({ method: "totp", level: 2 });
  });

  test("a recovery code banks level 2, the same as the authenticator it replaces", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);

    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "recovery_code",
      ok: true,
      context: "sign_in",
    });

    const rows = await verifications(t, userId);
    expect(rows[0]).toMatchObject({ method: "recovery_code", level: 2 });
  });

  test("a claimed passkey ticket banks level 3", async () => {
    const t = setup();
    const userId = await seedUser(t);

    const { ticket } = await t.mutation(api.security.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });
    const claim = await t.mutation(api.security.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: SESSION,
    });

    expect(claim.ok).toBe(true);
    const rows = await verifications(t, userId);
    expect(rows[0]).toMatchObject({ method: "passkey", level: 3 });
  });

  test("a failed attempt banks nothing", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);

    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: false,
      context: "sign_in",
    });

    expect(await verifications(t, userId)).toHaveLength(0);
  });
});

describe("passkey tickets", () => {
  test("a ticket is single-use", async () => {
    const t = setup();
    await seedUser(t);
    const { ticket } = await t.mutation(api.security.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });

    const first = await t.mutation(api.security.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: SESSION,
    });
    const second = await t.mutation(api.security.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: "sess_other",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  test("a ticket cannot be claimed by a different account", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_alice" });
    await seedUser(t, { clerkUserId: "user_mallory" });
    const { ticket } = await t.mutation(api.security.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });

    const stolen = await t.mutation(api.security.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_mallory",
      ticket,
      sessionId: SESSION,
    });

    expect(stolen.ok).toBe(false);
  });
});

describe("email codes", () => {
  test("a wrong code counts down the attempts and never banks a level", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456");

    const result = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "000000",
      context: "sign_in",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("4 attempts left");
    expect(await verifications(t, userId)).toHaveLength(0);
  });

  test("the fifth wrong guess burns the code outright", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456");

    for (let attempt = 0; attempt < 4; attempt++) {
      await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        code: "000000",
        context: "sign_in",
      });
    }
    const fifth = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "000000",
      context: "sign_in",
    });
    // Even the right code is dead now — the row is gone.
    const afterwards = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    expect(fifth.message).toContain("Too many");
    expect(afterwards.ok).toBe(false);
    expect(await verifications(t, userId)).toHaveLength(0);
  });

  test("a code issued for one session does not clear another", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456", "sess_a");

    const wrongSession = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: "sess_b",
      code: "123456",
      context: "sign_in",
    });

    expect(wrongSession.ok).toBe(false);
    expect(await verifications(t, userId, "sess_b")).toHaveLength(0);
  });

  test("requesting a second code straight away is refused", async () => {
    const t = setup();
    await seedUser(t);
    const request = () =>
      t.mutation(api.security.stepUp.apiRequestEmailCode, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        context: "sign_in",
      });

    await request();
    await expect(request()).rejects.toThrow();
  });
});

describe("the sign-in gate", () => {
  test("nothing required, nothing asked", async () => {
    const t = setup();
    await seedUser(t);

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(status.state).toBe("satisfied");
  });

  test("a second device raises a level 1 check that an email code clears", async () => {
    const t = setup();
    const userId = await seedUser(t);
    const evaluate = (deviceHash: string) =>
      t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash,
      });

    // The first device anyone signs in from is not itself a risk signal.
    expect(await evaluate("device_laptop")).toEqual({ newDevice: false });
    expect(await evaluate("device_phone")).toEqual({ newDevice: true });

    const gated = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(gated).toMatchObject({ state: "needs_verification", requiredLevel: 1 });

    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const cleared = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(cleared.state).toBe("satisfied");
  });

  test("re-evaluating the same session cannot lower a raised flag", async () => {
    const t = setup();
    await seedUser(t);
    const evaluate = (deviceHash: string) =>
      t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash,
      });

    await evaluate("device_laptop");
    await evaluate("device_phone");
    // A page refresh re-fires this route; the device is familiar by now.
    await evaluate("device_phone");

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status.state).toBe("needs_verification");
  });

  test("an org MFA policy with no credential asks for enrollment, not a code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(status).toEqual({ state: "needs_enrollment", needsMfa: true, needsPasskey: false });
  });

  test("an org MFA policy scoped to managers leaves employees alone", async () => {
    const t = setup();
    const employeeId = await seedUser(t, { clerkUserId: "user_alice" });
    await seedUser(t, { clerkUserId: "user_boss", role: "manager" });
    await seedPolicy(t, employeeId, { requireMfaScope: "managers_and_up" });

    expect(
      (await asUser(t, "user_alice").query(api.security.stepUp.status, { sessionId: SESSION }))
        .state,
    ).toBe("satisfied");
    expect(
      (await asUser(t, "user_boss").query(api.security.stepUp.status, { sessionId: SESSION }))
        .state,
    ).toBe("needs_enrollment");
  });

  test("an org MFA policy will not accept an email code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(status).toMatchObject({ state: "needs_verification", requiredLevel: 2 });
    // The regression this guards: an offered email code verifies fine and
    // still leaves the gate shut, stranding the user on a success screen.
    if (status.state !== "needs_verification") throw new Error("expected needs_verification");
    expect(status.availableMethods).not.toContain("email_code");
    expect(status.availableMethods).toContain("totp");
  });

  test("an authenticator code clears an org MFA policy", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "sign_in",
    });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status.state).toBe("satisfied");
  });

  test("a passkey-only account is offered the passkey route, not a dead-end form", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPasskey(t, userId);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(status).toMatchObject({
      state: "needs_verification",
      requiredLevel: 2,
      availableMethods: [],
      passkeyFallback: true,
    });
  });

  test("an exempt account is asked for nothing at all", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPolicy(t, userId, { requireMfaScope: "all", exemptUserIds: [userId] });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status.state).toBe("satisfied");
  });

  // Regression: the grace period used to raise the org's level 2 while
  // deliberately *not* sending the user to enrollment, so an account with no
  // second factor was asked for a level it had no credential to reach — a
  // hard block, from the feature whose entire job is not to block yet.
  test("a grace period warns an existing account instead of blocking it", async () => {
    const t = setup();
    const userId = await seedUser(t, { createdAt: Date.now() - 30 * DAY });
    await seedPolicy(t, userId, {
      requireMfaScope: "all",
      requireMfaRetroactive: true,
      mfaPolicySetAt: Date.now() - DAY,
      gracePeriodDays: 7,
    });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(status.state).toBe("warning");
    if (status.state !== "warning") throw new Error("expected warning");
    expect(status.graceDeadline).toBeGreaterThan(Date.now());
  });

  test("the requirement bites the moment the grace period runs out", async () => {
    const t = setup();
    const userId = await seedUser(t, { createdAt: Date.now() - 30 * DAY });
    await seedPolicy(t, userId, {
      requireMfaScope: "all",
      requireMfaRetroactive: true,
      mfaPolicySetAt: Date.now() - 10 * DAY,
      gracePeriodDays: 7,
    });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status).toEqual({ state: "needs_enrollment", needsMfa: true, needsPasskey: false });
  });

  test("a grace period does not nag someone who already enrolled", async () => {
    const t = setup();
    const userId = await seedUser(t, { createdAt: Date.now() - 30 * DAY });
    await seedTotp(t, userId);
    await seedPolicy(t, userId, {
      requireMfaScope: "all",
      requireMfaRetroactive: true,
      mfaPolicySetAt: Date.now() - DAY,
      gracePeriodDays: 7,
    });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status.state).toBe("satisfied");
  });

  test("an account that predates a non-retroactive policy is left alone", async () => {
    const t = setup();
    const userId = await seedUser(t, { createdAt: Date.now() - 30 * DAY });
    await seedPolicy(t, userId, {
      requireMfaScope: "all",
      requireMfaRetroactive: false,
      mfaPolicySetAt: Date.now() - DAY,
    });

    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status.state).toBe("satisfied");
  });
});

describe("always-require-MFA preference", () => {
  test("a passkey alone no longer satisfies sign-in, but an email code finishes it", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPasskey(t, userId);
    await asUser(t, "user_alice").mutation(api.security.stepUp.setSecurityPreference, {
      alwaysRequireMfaAtSignIn: true,
    });

    const { ticket } = await t.mutation(api.security.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.security.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: SESSION,
    });

    const afterPasskey = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(afterPasskey).toMatchObject({ state: "needs_verification", requiredLevel: 1 });

    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const afterCode = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(afterCode.state).toBe("satisfied");
  });
});

describe("recovery codes", () => {
  test("a valid code is accepted once and only once", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);

    const first = await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "abcde-fghjk",
    });
    const second = await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  test("spending one retires the authenticator and forces a new setup", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "recovery_code",
      ok: true,
      context: "sign_in",
    });

    // The level was high enough to clear the policy, so this is not the old
    // "verified and still locked out" dead end — it's the re-enrollment step.
    const status = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });
    expect(status).toEqual({ state: "needs_enrollment", needsMfa: true, needsPasskey: false });

    const totpStatus = await t.query(api.security.totp.apiStatus, {
      serverKey,
      clerkUserId: "user_alice",
    });
    expect(totpStatus).toMatchObject({ enrolled: true, needsRotation: true });
  });

  test("the remaining count drops as codes are spent", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK", "KLMNP-QRSTU", "VWXYZ-23456"]);

    const before = await t.query(api.security.totp.apiStatus, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    const after = await t.query(api.security.totp.apiStatus, {
      serverKey,
      clerkUserId: "user_alice",
    });

    expect(before).toMatchObject({ recoveryCodesRemaining: 3, recoveryCodesTotal: 3 });
    expect(after).toMatchObject({ recoveryCodesRemaining: 2, recoveryCodesTotal: 3 });
  });

  test("regenerating issues a full fresh set and voids every old code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);

    const { recoveryCodes } = await t.mutation(api.security.totp.apiRegenerateRecoveryCodes, {
      serverKey,
      clerkUserId: "user_alice",
    });
    const old = await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    const fresh = await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: recoveryCodes[0]!,
    });

    expect(recoveryCodes).toHaveLength(8);
    expect(old.ok).toBe(false);
    expect(fresh.ok).toBe(true);
  });

  test("regenerating needs an authenticator to regenerate for", async () => {
    const t = setup();
    await seedUser(t);

    await expect(
      t.mutation(api.security.totp.apiRegenerateRecoveryCodes, {
        serverKey,
        clerkUserId: "user_alice",
      }),
    ).rejects.toThrow();
  });
});

describe("security activity", () => {
  test("merges all three audit trails, newest first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);

    // One event into each table, in a known order.
    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "sign_in",
    });
    await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("passkeyAuditLog", {
        userId,
        event: "created",
        at: Date.now() + 1000,
      });
    });

    const activity = await asUser(t, "user_alice").query(api.security.stepUp.securityActivity, {});

    expect(activity[0]).toMatchObject({ source: "passkey", event: "created" });
    expect(activity.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(["passkey", "totp", "step_up"]),
    );
    for (let i = 1; i < activity.length; i++) {
      expect(activity[i]!.at).toBeLessThanOrEqual(activity[i - 1]!.at);
    }
  });

  test("a verification carries the method that satisfied it", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "sign_in",
    });

    const activity = await asUser(t, "user_alice").query(api.security.stepUp.securityActivity, {});
    const stepUp = activity.find((entry) => entry.source === "step_up");

    expect(stepUp).toMatchObject({ event: "verified", detail: "totp" });
  });

  test("housekeeping rows stay out of it", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.mutation(api.security.stepUp.apiRequestEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      context: "sign_in",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("stepUpAuditLog", {
        userId,
        event: "policy_changed",
        detail: "mfa=all",
        at: Date.now(),
      });
    });

    const activity = await asUser(t, "user_alice").query(api.security.stepUp.securityActivity, {});

    // `challenge_issued` is the system talking to itself, and a policy change
    // is about the org, not this account.
    expect(activity.map((entry) => entry.event)).not.toContain("challenge_issued");
    expect(activity.map((entry) => entry.event)).not.toContain("policy_changed");
  });

  test("one account never sees another's history", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_alice" });
    const malloryId = await seedUser(t, { clerkUserId: "user_mallory" });
    await t.run(async (ctx) => {
      await ctx.db.insert("passkeyAuditLog", {
        userId: malloryId,
        event: "created",
        at: Date.now(),
      });
    });

    const activity = await asUser(t, "user_alice").query(api.security.stepUp.securityActivity, {});
    expect(activity).toHaveLength(0);
  });

  test("a retired authenticator lets enrollment start again without a removal first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);

    const before = await t.query(api.security.totp.apiEnrollmentContext, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    const after = await t.query(api.security.totp.apiEnrollmentContext, {
      serverKey,
      clerkUserId: "user_alice",
    });

    expect(before?.hasVerified).toBe(true);
    expect(after?.hasVerified).toBe(false);
  });

  test("a retired authenticator stops being offered as a step-up method", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK", "KLMNP-QRSTU"]);
    await seedPolicy(t, userId, { requireMfaForDestructive: true, minDestructiveLevel: 2 });

    await t.mutation(api.security.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });

    const gate = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    expect(gate.availableMethods).not.toContain("totp");
    expect(gate.availableMethods).toContain("recovery_code");
  });
});

describe("the destructive-action gate", () => {
  test("a fresh session has not earned a removal, even with no policy set", async () => {
    const t = setup();
    await seedUser(t);

    const gate = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });

    expect(gate).toMatchObject({ satisfied: false, requiredLevel: 1 });
    expect(gate.availableMethods).toContain("email_code");
  });

  test("an email code earns it", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const gate = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    expect(gate.satisfied).toBe(true);
  });

  test("the org policy raises the bar above an email code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedPolicy(t, userId, { requireMfaForDestructive: true, minDestructiveLevel: 2 });

    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const afterEmail = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    expect(afterEmail).toMatchObject({ satisfied: false, requiredLevel: 2 });
    expect(afterEmail.availableMethods).not.toContain("email_code");

    await t.mutation(api.security.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "destructive",
    });

    const afterTotp = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    expect(afterTotp.satisfied).toBe(true);
  });

  test("a verification older than the window stops counting", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    // Sign-in checks are meant to survive the session; the destructive gate
    // deliberately does not.
    await t.run(async (ctx) => {
      const [row] = await ctx.db
        .query("stepUpVerifications")
        .withIndex("by_user_session", (q) => q.eq("userId", userId).eq("sessionId", SESSION))
        .collect();
      await ctx.db.patch(row!._id, { verifiedAt: Date.now() - 30 * 60_000 });
    });

    const gate = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    const signIn = await asUser(t, "user_alice").query(api.security.stepUp.status, {
      sessionId: SESSION,
    });

    expect(gate.satisfied).toBe(false);
    expect(signIn.state).toBe("satisfied");
  });

  test("an exempt account still owes the baseline check", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPolicy(t, userId, {
      requireMfaForDestructive: true,
      minDestructiveLevel: 2,
      exemptUserIds: [userId],
    });

    const gate = await t.query(api.security.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });

    expect(gate).toMatchObject({ satisfied: false, requiredLevel: 1 });
  });
});

describe("TOTP replay state", () => {
  test("an accepted code's step is stored so the next check can reject a replay", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);

    const before = await t.query(api.security.totp.apiSecretForVerification, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.security.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: true,
      usedStep: 58_000_000,
    });
    const after = await t.query(api.security.totp.apiSecretForVerification, {
      serverKey,
      clerkUserId: "user_alice",
    });

    expect(before?.lastUsedStep).toBeNull();
    expect(after?.lastUsedStep).toBe(58_000_000);
  });

  test("a rejected code does not advance the step", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await t.mutation(api.security.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: true,
      usedStep: 58_000_000,
    });

    await t.mutation(api.security.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: false,
    });

    const after = await t.query(api.security.totp.apiSecretForVerification, {
      serverKey,
      clerkUserId: "user_alice",
    });
    expect(after?.lastUsedStep).toBe(58_000_000);
  });
});

describe("server-key guard", () => {
  test("a wrong key is refused", async () => {
    const t = setup();
    await seedUser(t);

    await expect(
      t.query(api.security.stepUp.apiDestructiveGate, {
        serverKey: "not-the-key",
        clerkUserId: "user_alice",
        sessionId: SESSION,
      }),
    ).rejects.toThrow();
  });
});

describe("org policy edits", () => {
  test("changing an unrelated setting does not reset who predates the MFA policy", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
    const admin = asUser(t, "user_admin");
    const base = {
      requireMfaScope: "all" as const,
      requireMfaRetroactive: false,
      requireMfaForDestructive: false,
      destructiveActionTtlMinutes: 10,
      minDestructiveLevel: 1,
      requirePasskeyScope: "off" as const,
      requirePasskeyRetroactive: false,
      gracePeriodDays: 0,
      exemptUserIds: [],
      areaReverifyDays: 14,
      performanceLegacyPasswordSunsetEnabled: false,
      applicantVaultLegacyPasswordSunsetEnabled: false,
      legacyPasswordGraceDays: 30,
    };

    await admin.mutation(api.security.stepUp.setOrgPolicy, base);
    const first = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...base,
      destructiveActionTtlMinutes: 25,
    });
    const second = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    expect(second!.mfaPolicySetAt).toBe(first!.mfaPolicySetAt);
  });

  test("changing the MFA scope does reset it", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
    const admin = asUser(t, "user_admin");
    const base = {
      requireMfaScope: "off" as const,
      requireMfaRetroactive: false,
      requireMfaForDestructive: false,
      destructiveActionTtlMinutes: 10,
      minDestructiveLevel: 1,
      requirePasskeyScope: "off" as const,
      requirePasskeyRetroactive: false,
      gracePeriodDays: 0,
      exemptUserIds: [],
      areaReverifyDays: 14,
      performanceLegacyPasswordSunsetEnabled: false,
      applicantVaultLegacyPasswordSunsetEnabled: false,
      legacyPasswordGraceDays: 30,
    };

    await admin.mutation(api.security.stepUp.setOrgPolicy, base);
    const first = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    await admin.mutation(api.security.stepUp.setOrgPolicy, { ...base, requireMfaScope: "all" });
    const second = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    expect(second!.mfaPolicySetAt).toBeGreaterThanOrEqual(first!.mfaPolicySetAt);
    expect(second!.requireMfaScope).toBe("all");
  });

  test("only an admin can read or write the policy", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_alice" });

    await expect(
      asUser(t, "user_alice").query(api.security.stepUp.orgPolicy, {}),
    ).rejects.toThrow();
  });
});

describe("Area re-verification", () => {
  describe("areaAccessStatus", () => {
    test("needs_verification with no prior clearance", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });

      const status = await asUser(t, "user_alice").query(api.security.stepUp.areaAccessStatus, {
        area: "performance",
      });
      expect(status.state).toBe("needs_verification");
    });

    test("clearing an area_reverify email code satisfies it, and only that area", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      await plantEmailCode(t, "user_alice", userId, "111222", SESSION, "area_reverify");
      const result = await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        code: "111222",
        context: "area_reverify",
        area: "performance",
      });
      expect(result.ok).toBe(true);

      const performance = await asUser(t, "user_alice").query(
        api.security.stepUp.areaAccessStatus,
        {
          area: "performance",
        },
      );
      expect(performance.state).toBe("satisfied");

      const vault = await asUser(t, "user_alice").query(api.security.stepUp.areaAccessStatus, {
        area: "applicant_vault",
      });
      expect(vault.state).toBe("needs_verification");
    });

    test("a clearance older than the org's areaReverifyDays no longer satisfies it", async () => {
      const t = setup();
      const admin = await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      await seedPolicy(t, admin, {});
      const userId = await seedUser(t, { clerkUserId: "user_bob" });
      await t.run(async (ctx) =>
        ctx.db.insert("areaStepUps", {
          userId,
          area: "performance",
          verifiedAt: Date.now() - 15 * DAY,
          method: "email_code",
        }),
      );

      const status = await asUser(t, "user_bob").query(api.security.stepUp.areaAccessStatus, {
        area: "performance",
      });
      expect(status.state).toBe("needs_verification");
    });

    test("respects an org-configured areaReverifyDays shorter than the 14-day default", async () => {
      const t = setup();
      const admin = await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      await seedPolicy(t, admin, { areaReverifyDays: 1 });
      const userId = await seedUser(t, { clerkUserId: "user_carl" });
      await t.run(async (ctx) =>
        ctx.db.insert("areaStepUps", {
          userId,
          area: "performance",
          verifiedAt: Date.now() - 2 * DAY,
          method: "email_code",
        }),
      );

      const status = await asUser(t, "user_carl").query(api.security.stepUp.areaAccessStatus, {
        area: "performance",
      });
      expect(status.state).toBe("needs_verification");
    });
  });

  describe("areaPreference / setAreaPreference", () => {
    test("defaults to trust_device", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });

      const pref = await asUser(t, "user_alice").query(api.security.stepUp.areaPreference, {
        area: "performance",
      });
      expect(pref.mode).toBe("trust_device");
    });

    test("setAreaPreference roundtrips, and a moments-old clearance still counts under always_step_up", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      await t.run(async (ctx) =>
        ctx.db.insert("areaStepUps", {
          userId,
          area: "performance",
          verifiedAt: Date.now(),
          method: "email_code",
        }),
      );

      await asUser(t, "user_alice").mutation(api.security.stepUp.setAreaPreference, {
        area: "performance",
        mode: "always_step_up",
      });

      const pref = await asUser(t, "user_alice").query(api.security.stepUp.areaPreference, {
        area: "performance",
      });
      expect(pref.mode).toBe("always_step_up");

      // A preference literally named "always require step-up" that rejects
      // the step-up someone just completed would be a permanent lockout,
      // not extra security — the fresh clearance from moments ago still
      // has to grant entry for this visit.
      const status = await asUser(t, "user_alice").query(api.security.stepUp.areaAccessStatus, {
        area: "performance",
      });
      expect(status.state).toBe("satisfied");
    });

    test("always_step_up demands a fresh clearance once the short freshness window has passed", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_bob" });
      await t.run(async (ctx) => {
        await ctx.db.insert("areaStepUps", {
          userId,
          area: "performance",
          verifiedAt: Date.now() - 10 * 60_000,
          method: "email_code",
        });
        await ctx.db.insert("areaSecurityPreferences", {
          userId,
          area: "performance",
          mode: "always_step_up",
          updatedAt: Date.now(),
        });
      });

      // Well within the normal 14-day trust_device window, but past
      // always_step_up's much shorter freshness window.
      const status = await asUser(t, "user_bob").query(api.security.stepUp.areaAccessStatus, {
        area: "performance",
      });
      expect(status.state).toBe("needs_verification");
    });
  });

  describe("trusted devices", () => {
    test("apiEvaluateDevice stamps a default name, browser/os, and a trustedUntil window on a new device", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });

      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
        browser: "Chrome",
        os: "macOS",
      });

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(1);
      expect(devices[0]!.name).toBe("Chrome on macOS");
      expect(devices[0]!.browser).toBe("Chrome");
      expect(devices[0]!.os).toBe("macOS");
      expect(devices[0]!.trusted).toBe(true);
      void userId;
    });

    test("a returning device backfills its name and browser/os instead of staying unlabeled forever", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      // Simulates a device row that predates browser/os tracking — no name,
      // no browser, no os, same as anything created before this shipped.
      await t.run(async (ctx) =>
        ctx.db.insert("knownDevices", {
          userId,
          deviceHash: "hash1",
          firstSeenAt: Date.now() - 30 * 86_400_000,
          lastSeenAt: Date.now() - 30 * 86_400_000,
        }),
      );

      const before = await asUser(t, "user_alice").query(api.security.stepUp.trustedDevices, {});
      expect(before.devices[0]!.name).toBe("Unrecognized device");

      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
        browser: "Firefox",
        os: "Windows",
      });

      const after = await asUser(t, "user_alice").query(api.security.stepUp.trustedDevices, {});
      expect(after.devices[0]!.name).toBe("Firefox on Windows");
      expect(after.devices[0]!.browser).toBe("Firefox");
    });

    test("a custom name survives a revisit — browser/os still refresh, name doesn't", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
        browser: "Chrome",
        os: "macOS",
      });
      const { devices: seeded } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      await asUser(t, "user_alice").mutation(api.security.stepUp.renameDevice, {
        deviceId: seeded[0]!.id,
        name: "My work laptop",
      });

      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
        browser: "Chrome",
        os: "macOS",
      });

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices[0]!.name).toBe("My work laptop");
    });

    test("opting out forgets stored devices, stores no new ones, and treats every session as untrusted", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: "sess_before",
        deviceHash: "hash1",
      });

      await asUser(t, "user_alice").mutation(api.security.stepUp.setSecurityPreference, {
        deviceTrackingOptOut: true,
      });
      const afterOptOut = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(afterOptOut.devices).toHaveLength(0);

      const result = await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
      });
      expect(result.newDevice).toBe(true);
      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(0);
    });

    test("visiting again never extends a device's trust; only a step-up on it does", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      const evaluate = (deviceHash: string, sessionId: string) =>
        t.mutation(api.security.stepUp.apiEvaluateDevice, {
          serverKey,
          clerkUserId: "user_alice",
          sessionId,
          deviceHash,
        });

      await evaluate("laptop", "sess_laptop");
      // A second device starts out untrusted, and a revisit doesn't change that.
      expect(await evaluate("phone", "sess_phone_1")).toEqual({ newDevice: true });
      expect(await evaluate("phone", "sess_phone_2")).toEqual({ newDevice: true });

      await plantEmailCode(t, "user_alice", userId, "123456", "sess_phone_2");
      await t.mutation(api.security.stepUp.apiSubmitEmailCode, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: "sess_phone_2",
        code: "123456",
        context: "sign_in",
      });

      expect(await evaluate("phone", "sess_phone_3")).toEqual({ newDevice: false });
      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices.every((d) => d.trusted)).toBe(true);
    });

    test("a Clerk client stays one device when its IP or browser version changes", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      const evaluate = (deviceHash: string, sessionId: string) =>
        t.mutation(api.security.stepUp.apiEvaluateDevice, {
          serverKey,
          clerkUserId: "user_alice",
          sessionId,
          clerkClientId: "client_laptop",
          deviceHash,
        });

      await evaluate("home-wifi-chrome-128", "sess_1");
      expect(await evaluate("office-chrome-129", "sess_2")).toEqual({ newDevice: false });

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(1);
    });

    test("an older hash-only device is adopted by the first client that matches, keeping its trust", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      await t.run(async (ctx) => {
        await ctx.db.insert("knownDevices", {
          userId,
          deviceHash: "other",
          firstSeenAt: Date.now() - 30 * DAY,
          lastSeenAt: Date.now() - 30 * DAY,
        });
        await ctx.db.insert("knownDevices", {
          userId,
          deviceHash: "laptop",
          firstSeenAt: Date.now() - 30 * DAY,
          lastSeenAt: Date.now() - DAY,
          trustedUntil: Date.now() + 5 * DAY,
        });
      });

      const result = await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        clerkClientId: "client_laptop",
        deviceHash: "laptop",
      });
      expect(result.newDevice).toBe(false);
      const adopted = await t.run(async (ctx) =>
        ctx.db
          .query("knownDevices")
          .withIndex("by_user_client", (q) =>
            q.eq("userId", userId).eq("clerkClientId", "client_laptop"),
          )
          .unique(),
      );
      expect(adopted?.deviceHash).toBe("laptop");
    });

    test("a second browser with the same IP and user-agent is still its own device", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      const evaluate = (clerkClientId: string, sessionId: string) =>
        t.mutation(api.security.stepUp.apiEvaluateDevice, {
          serverKey,
          clerkUserId: "user_alice",
          sessionId,
          clerkClientId,
          deviceHash: "same-network-same-browser",
        });

      await evaluate("client_a", "sess_a");
      expect(await evaluate("client_b", "sess_b")).toEqual({ newDevice: true });

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(2);
    });

    test("sessionDevices maps the caller's own sessions to their device, and nobody else's", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      await seedUser(t, { clerkUserId: "user_mallory" });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: "sess_laptop",
        clerkClientId: "client_laptop",
        deviceHash: "laptop",
      });
      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );

      const mine = await asUser(t, "user_alice").query(api.security.stepUp.sessionDevices, {
        sessionIds: ["sess_laptop", "sess_unknown"],
      });
      expect(mine).toEqual([
        { sessionId: "sess_laptop", deviceId: devices[0]!.id },
        { sessionId: "sess_unknown", deviceId: null },
      ]);

      const theirs = await asUser(t, "user_mallory").query(api.security.stepUp.sessionDevices, {
        sessionIds: ["sess_laptop"],
      });
      expect(theirs).toEqual([{ sessionId: "sess_laptop", deviceId: null }]);
    });

    test("a device whose trust has lapsed asks for a check again", async () => {
      const t = setup();
      const userId = await seedUser(t, { clerkUserId: "user_alice" });
      await t.run(async (ctx) =>
        ctx.db.insert("knownDevices", {
          userId,
          deviceHash: "laptop",
          firstSeenAt: Date.now() - 60 * 86_400_000,
          lastSeenAt: Date.now() - 20 * 86_400_000,
          trustedUntil: Date.now() - 86_400_000,
        }),
      );

      const result = await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "laptop",
      });
      expect(result.newDevice).toBe(true);
    });

    test("renameDevice updates the name; only the device's own owner may", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      await seedUser(t, { clerkUserId: "user_mallory" });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
      });
      const { devices: found } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      const device = found[0];

      await asUser(t, "user_alice").mutation(api.security.stepUp.renameDevice, {
        deviceId: device!.id,
        name: "My laptop",
      });
      const renamed = await asUser(t, "user_alice").query(api.security.stepUp.trustedDevices, {});
      expect(renamed.devices[0]!.name).toBe("My laptop");

      await expect(
        asUser(t, "user_mallory").mutation(api.security.stepUp.renameDevice, {
          deviceId: device!.id,
          name: "Hijacked",
        }),
      ).rejects.toThrow("Device not found");
    });

    test("revokeDeviceTrust forgets the device outright", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash1",
      });
      const { devices: found } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );

      await asUser(t, "user_alice").mutation(api.security.stepUp.revokeDeviceTrust, {
        deviceId: found[0]!.id,
      });

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(0);
    });

    test("forgetUntrustedDevices removes only devices that aren't currently trusted", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });
      // A trusted device.
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash: "hash-trusted",
        browser: "Chrome",
        os: "macOS",
      });
      // Two more that never passed a step-up, so never earned trust.
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: "sess_b",
        deviceHash: "hash-stale-1",
      });
      await t.mutation(api.security.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: "sess_c",
        deviceHash: "hash-stale-2",
      });

      const result = await asUser(t, "user_alice").mutation(
        api.security.stepUp.forgetUntrustedDevices,
        {},
      );
      expect(result.removed).toBe(2);

      const { devices } = await asUser(t, "user_alice").query(
        api.security.stepUp.trustedDevices,
        {},
      );
      expect(devices).toHaveLength(1);
      expect(devices[0]!.trusted).toBe(true);
    });
  });

  describe("areaStandard", () => {
    test("counts the always_step_up split per area and the device-tracking opt-out total", async () => {
      const t = setup();
      const admin = await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      const alice = await seedUser(t, { clerkUserId: "user_alice" });
      await seedUser(t, { clerkUserId: "user_bob" });
      await t.run(async (ctx) =>
        ctx.db.insert("areaSecurityPreferences", {
          userId: alice,
          area: "performance",
          mode: "always_step_up",
          updatedAt: Date.now(),
        }),
      );
      await asUser(t, "user_bob").mutation(api.security.stepUp.setSecurityPreference, {
        deviceTrackingOptOut: true,
      });

      const standard = await asUser(t, "user_admin").query(api.security.stepUp.areaStandard, {});
      expect(standard.areaReverifyDays).toBe(14);
      expect(standard.deviceTrackingOptOutCount).toBe(1);
      const performance = standard.byArea.find((a) => a.area === "performance");
      expect(performance?.alwaysStepUpCount).toBe(1);
      void admin;
    });

    test("a deactivated user's stale preference row doesn't inflate the count or go negative", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      // A suspended account can still carry an old areaSecurityPreferences
      // row from before it was deactivated — that row must not count
      // against `users.length` (active users only), or trustDeviceCount
      // goes negative.
      const suspended = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          clerkUserId: "user_gone",
          email: "user_gone@advantisgroup.de",
          role: "employee",
          status: "suspended",
          external: false,
          createdAt: Date.now(),
        }),
      );
      await t.run(async (ctx) => {
        await ctx.db.insert("areaSecurityPreferences", {
          userId: suspended,
          area: "performance",
          mode: "always_step_up",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("securityPreferences", {
          userId: suspended,
          alwaysRequireMfaAtSignIn: false,
          deviceTrackingOptOut: true,
          updatedAt: Date.now(),
        });
      });

      const standard = await asUser(t, "user_admin").query(api.security.stepUp.areaStandard, {});
      expect(standard.deviceTrackingOptOutCount).toBe(0);
      const performance = standard.byArea.find((a) => a.area === "performance");
      expect(performance?.alwaysStepUpCount).toBe(0);
      expect(performance!.trustDeviceCount).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Legacy password grace period", () => {
  const basePolicy = {
    requireMfaScope: "off" as const,
    requireMfaRetroactive: false,
    requireMfaForDestructive: false,
    destructiveActionTtlMinutes: 10,
    minDestructiveLevel: 1,
    requirePasskeyScope: "off" as const,
    requirePasskeyRetroactive: false,
    gracePeriodDays: 0,
    exemptUserIds: [],
    areaReverifyDays: 14,
    legacyPasswordGraceDays: 30,
  };

  test("orgPolicy defaults both sunsets to off with no deadline", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_admin", role: "admin" });

    const policy = await asUser(t, "user_admin").query(api.security.stepUp.orgPolicy, {});
    expect(policy.performanceLegacyPasswordSunsetEnabled).toBe(false);
    expect(policy.performanceLegacyPasswordSunsetDeadline).toBeNull();
    expect(policy.applicantVaultLegacyPasswordSunsetEnabled).toBe(false);
    expect(policy.applicantVaultLegacyPasswordSunsetDeadline).toBeNull();
    expect(policy.legacyPasswordGraceDays).toBe(30);
  });

  test("setOrgPolicy stamps a SetAt only the moment the toggle turns on, then leaves it alone", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
    const admin = asUser(t, "user_admin");

    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...basePolicy,
      performanceLegacyPasswordSunsetEnabled: false,
      applicantVaultLegacyPasswordSunsetEnabled: false,
    });
    // Still off, so this is exactly "not started yet" whatever SetAt holds
    // internally — `legacyPasswordSunsetDeadline` never reads it while
    // `enabled` is false.
    const beforeToggle = await asUser(t, "user_admin").query(api.security.stepUp.orgPolicy, {});
    expect(beforeToggle.performanceLegacyPasswordSunsetDeadline).toBeNull();

    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...basePolicy,
      performanceLegacyPasswordSunsetEnabled: true,
      applicantVaultLegacyPasswordSunsetEnabled: false,
    });
    const afterToggle = await t.run(async (ctx) => ctx.db.query("authPolicy").first());
    const setAt = afterToggle!.performanceLegacyPasswordSunsetSetAt;
    expect(setAt).toBeDefined();

    // An unrelated field changing must not restamp it.
    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...basePolicy,
      performanceLegacyPasswordSunsetEnabled: true,
      applicantVaultLegacyPasswordSunsetEnabled: false,
      legacyPasswordGraceDays: 45,
    });
    const afterUnrelatedChange = await t.run(async (ctx) => ctx.db.query("authPolicy").first());
    expect(afterUnrelatedChange!.performanceLegacyPasswordSunsetSetAt).toBe(setAt);
  });

  test("shortening the grace period can't end a running clock within a day", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
    const admin = asUser(t, "user_admin");
    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...basePolicy,
      performanceLegacyPasswordSunsetEnabled: true,
      applicantVaultLegacyPasswordSunsetEnabled: false,
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("authPolicy").first();
      await ctx.db.patch(row!._id, { performanceLegacyPasswordSunsetSetAt: Date.now() - 20 * DAY });
    });

    await expect(
      admin.mutation(api.security.stepUp.setOrgPolicy, {
        ...basePolicy,
        performanceLegacyPasswordSunsetEnabled: true,
        applicantVaultLegacyPasswordSunsetEnabled: false,
        legacyPasswordGraceDays: 10,
      }),
    ).rejects.toThrow();

    await admin.mutation(api.security.stepUp.setOrgPolicy, {
      ...basePolicy,
      performanceLegacyPasswordSunsetEnabled: true,
      applicantVaultLegacyPasswordSunsetEnabled: false,
      legacyPasswordGraceDays: 25,
    });
  });

  describe("legacyPasswordStandard", () => {
    async function seedCompany(t: T): Promise<Id<"companies">> {
      return await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Acme",
          slug: "acme",
          domain: "acme.example.com",
          status: "active",
          adminBootstrapEmails: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
    }

    async function seedPerformanceLogin(
      t: T,
      companyId: Id<"companies">,
      opts: { email: string; linkedUserId?: Id<"users"> },
    ) {
      await t.run(async (ctx) =>
        ctx.db.insert("performanceLogins", {
          email: opts.email,
          name: "Test Login",
          passwordHash: "hash",
          companyId,
          linkedUserId: opts.linkedUserId,
          active: true,
          createdAt: Date.now(),
        }),
      );
    }

    test("counts only linked, active Performance logins as still-on-legacy-password", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      const linked = await seedUser(t, { clerkUserId: "user_linked" });
      const company = await seedCompany(t);
      await seedPerformanceLogin(t, company, {
        email: "linked@acme.example.com",
        linkedUserId: linked,
      });
      await seedPerformanceLogin(t, company, { email: "standalone@acme.example.com" });

      const standard = await asUser(t, "user_admin").query(
        api.security.stepUp.legacyPasswordStandard,
        {},
      );
      expect(standard.performance.accountsStillOnLegacyPassword).toBe(1);
      expect(standard.performance.enabled).toBe(false);
    });

    test("counts only vault passwords belonging to a member who also has a passkey", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      const withPasskey = await seedUser(t, { clerkUserId: "user_alice" });
      const withoutPasskey = await seedUser(t, { clerkUserId: "user_bob" });
      await t.run(async (ctx) => {
        await ctx.db.insert("applicantVaultPasswords", {
          userId: withPasskey,
          hash: "hash",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("applicantVaultPasswords", {
          userId: withoutPasskey,
          hash: "hash",
          updatedAt: Date.now(),
        });
      });
      await seedPasskey(t, withPasskey);

      const standard = await asUser(t, "user_admin").query(
        api.security.stepUp.legacyPasswordStandard,
        {},
      );
      expect(standard.applicantVault.accountsStillOnLegacyPassword).toBe(1);
    });

    test("reports the enabled flag and deadline once the sunset is turned on", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_admin", role: "admin" });
      const admin = asUser(t, "user_admin");
      await admin.mutation(api.security.stepUp.setOrgPolicy, {
        ...basePolicy,
        performanceLegacyPasswordSunsetEnabled: true,
        applicantVaultLegacyPasswordSunsetEnabled: false,
      });

      const standard = await admin.query(api.security.stepUp.legacyPasswordStandard, {});
      expect(standard.performance.enabled).toBe(true);
      expect(standard.performance.deadlineAt).not.toBeNull();
      expect(standard.applicantVault.enabled).toBe(false);
      expect(standard.applicantVault.deadlineAt).toBeNull();
    });

    test("only an admin can read it", async () => {
      const t = setup();
      await seedUser(t, { clerkUserId: "user_alice" });

      await expect(
        asUser(t, "user_alice").query(api.security.stepUp.legacyPasswordStandard, {}),
      ).rejects.toThrow();
    });
  });
});
