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

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { sha256hex } from "./activity/lib/crypto";

// convex-test wants every function module plus `_generated`. The extglob
// pattern from its docs (`!(*.*.*)`) silently misses `_generated/*.js` under
// this Vite version, and a missing `_generated` is the one thing it can't
// recover from — so glob broadly and drop the non-modules by hand.
const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("./**/*.ts"),
    ...import.meta.glob("./**/*.js"),
  }).filter(([path]) => !/\.(test|config)\.ts$/.test(path) && !path.endsWith(".d.ts")),
) as Record<string, () => Promise<unknown>>;

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
) {
  await t.mutation(api.stepUp.apiRequestEmailCode, {
    serverKey,
    clerkUserId,
    sessionId,
    context: "sign_in",
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

    const result = await t.mutation(api.stepUp.apiSubmitEmailCode, {
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

    await t.mutation(api.stepUp.apiRecordVerification, {
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

    await t.mutation(api.stepUp.apiRecordVerification, {
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

    const { ticket } = await t.mutation(api.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });
    const claim = await t.mutation(api.stepUp.apiClaimPasskeyTicket, {
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

    await t.mutation(api.stepUp.apiRecordVerification, {
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
    const { ticket } = await t.mutation(api.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });

    const first = await t.mutation(api.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: SESSION,
    });
    const second = await t.mutation(api.stepUp.apiClaimPasskeyTicket, {
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
    const { ticket } = await t.mutation(api.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });

    const stolen = await t.mutation(api.stepUp.apiClaimPasskeyTicket, {
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

    const result = await t.mutation(api.stepUp.apiSubmitEmailCode, {
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
      await t.mutation(api.stepUp.apiSubmitEmailCode, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        code: "000000",
        context: "sign_in",
      });
    }
    const fifth = await t.mutation(api.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "000000",
      context: "sign_in",
    });
    // Even the right code is dead now — the row is gone.
    const afterwards = await t.mutation(api.stepUp.apiSubmitEmailCode, {
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

    const wrongSession = await t.mutation(api.stepUp.apiSubmitEmailCode, {
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
      t.mutation(api.stepUp.apiRequestEmailCode, {
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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

    expect(status.state).toBe("satisfied");
  });

  test("a second device raises a level 1 check that an email code clears", async () => {
    const t = setup();
    const userId = await seedUser(t);
    const evaluate = (deviceHash: string) =>
      t.mutation(api.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash,
      });

    // The first device anyone signs in from is not itself a risk signal.
    expect(await evaluate("device_laptop")).toEqual({ newDevice: false });
    expect(await evaluate("device_phone")).toEqual({ newDevice: true });

    const gated = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(gated).toMatchObject({ state: "needs_verification", requiredLevel: 1 });

    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const cleared = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(cleared.state).toBe("satisfied");
  });

  test("re-evaluating the same session cannot lower a raised flag", async () => {
    const t = setup();
    await seedUser(t);
    const evaluate = (deviceHash: string) =>
      t.mutation(api.stepUp.apiEvaluateDevice, {
        serverKey,
        clerkUserId: "user_alice",
        sessionId: SESSION,
        deviceHash,
      });

    await evaluate("device_laptop");
    await evaluate("device_phone");
    // A page refresh re-fires this route; the device is familiar by now.
    await evaluate("device_phone");

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(status.state).toBe("needs_verification");
  });

  test("an org MFA policy with no credential asks for enrollment, not a code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

    expect(status).toEqual({ state: "needs_enrollment", needsMfa: true, needsPasskey: false });
  });

  test("an org MFA policy scoped to managers leaves employees alone", async () => {
    const t = setup();
    const employeeId = await seedUser(t, { clerkUserId: "user_alice" });
    await seedUser(t, { clerkUserId: "user_boss", role: "manager" });
    await seedPolicy(t, employeeId, { requireMfaScope: "managers_and_up" });

    expect(
      (await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION })).state,
    ).toBe("satisfied");
    expect(
      (await asUser(t, "user_boss").query(api.stepUp.status, { sessionId: SESSION })).state,
    ).toBe("needs_enrollment");
  });

  test("an org MFA policy will not accept an email code", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

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

    await t.mutation(api.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "sign_in",
    });

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(status.state).toBe("satisfied");
  });

  test("a passkey-only account is offered the passkey route, not a dead-end form", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPasskey(t, userId);
    await seedPolicy(t, userId, { requireMfaScope: "all" });

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
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

    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(status.state).toBe("satisfied");
  });
});

describe("always-require-MFA preference", () => {
  test("a passkey alone no longer satisfies sign-in, but an email code finishes it", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedPasskey(t, userId);
    await asUser(t, "user_alice").mutation(api.stepUp.setSecurityPreference, {
      alwaysRequireMfaAtSignIn: true,
    });

    const { ticket } = await t.mutation(api.stepUp.apiIssuePasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.stepUp.apiClaimPasskeyTicket, {
      serverKey,
      clerkUserId: "user_alice",
      ticket,
      sessionId: SESSION,
    });

    const afterPasskey = await asUser(t, "user_alice").query(api.stepUp.status, {
      sessionId: SESSION,
    });
    expect(afterPasskey).toMatchObject({ state: "needs_verification", requiredLevel: 1 });

    await plantEmailCode(t, "user_alice", userId, "123456");
    await t.mutation(api.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const afterCode = await asUser(t, "user_alice").query(api.stepUp.status, {
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

    const first = await t.mutation(api.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "abcde-fghjk",
    });
    const second = await t.mutation(api.totp.apiVerifyRecoveryCode, {
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

    await t.mutation(api.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    await t.mutation(api.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "recovery_code",
      ok: true,
      context: "sign_in",
    });

    // The level was high enough to clear the policy, so this is not the old
    // "verified and still locked out" dead end — it's the re-enrollment step.
    const status = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });
    expect(status).toEqual({ state: "needs_enrollment", needsMfa: true, needsPasskey: false });

    const totpStatus = await t.query(api.totp.apiStatus, { serverKey, clerkUserId: "user_alice" });
    expect(totpStatus).toEqual({ enrolled: true, needsRotation: true });
  });

  test("a retired authenticator lets enrollment start again without a removal first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedTotp(t, userId);
    await seedRecoveryCodes(t, userId, ["ABCDE-FGHJK"]);

    const before = await t.query(api.totp.apiEnrollmentContext, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });
    const after = await t.query(api.totp.apiEnrollmentContext, {
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

    await t.mutation(api.totp.apiVerifyRecoveryCode, {
      serverKey,
      clerkUserId: "user_alice",
      code: "ABCDE-FGHJK",
    });

    const gate = await t.query(api.stepUp.apiDestructiveGate, {
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

    const gate = await t.query(api.stepUp.apiDestructiveGate, {
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
    await t.mutation(api.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const gate = await t.query(api.stepUp.apiDestructiveGate, {
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
    await t.mutation(api.stepUp.apiSubmitEmailCode, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      code: "123456",
      context: "sign_in",
    });

    const afterEmail = await t.query(api.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    expect(afterEmail).toMatchObject({ satisfied: false, requiredLevel: 2 });
    expect(afterEmail.availableMethods).not.toContain("email_code");

    await t.mutation(api.stepUp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
      method: "totp",
      ok: true,
      context: "destructive",
    });

    const afterTotp = await t.query(api.stepUp.apiDestructiveGate, {
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
    await t.mutation(api.stepUp.apiSubmitEmailCode, {
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

    const gate = await t.query(api.stepUp.apiDestructiveGate, {
      serverKey,
      clerkUserId: "user_alice",
      sessionId: SESSION,
    });
    const signIn = await asUser(t, "user_alice").query(api.stepUp.status, { sessionId: SESSION });

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

    const gate = await t.query(api.stepUp.apiDestructiveGate, {
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

    const before = await t.query(api.totp.apiSecretForVerification, {
      serverKey,
      clerkUserId: "user_alice",
    });
    await t.mutation(api.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: true,
      usedStep: 58_000_000,
    });
    const after = await t.query(api.totp.apiSecretForVerification, {
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
    await t.mutation(api.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: true,
      usedStep: 58_000_000,
    });

    await t.mutation(api.totp.apiRecordVerification, {
      serverKey,
      clerkUserId: "user_alice",
      ok: false,
    });

    const after = await t.query(api.totp.apiSecretForVerification, {
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
      t.query(api.stepUp.apiDestructiveGate, {
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
    };

    await admin.mutation(api.stepUp.setOrgPolicy, base);
    const first = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    await admin.mutation(api.stepUp.setOrgPolicy, { ...base, destructiveActionTtlMinutes: 25 });
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
    };

    await admin.mutation(api.stepUp.setOrgPolicy, base);
    const first = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    await admin.mutation(api.stepUp.setOrgPolicy, { ...base, requireMfaScope: "all" });
    const second = await t.run(async (ctx) => ctx.db.query("authPolicy").first());

    expect(second!.mfaPolicySetAt).toBeGreaterThanOrEqual(first!.mfaPolicySetAt);
    expect(second!.requireMfaScope).toBe("all");
  });

  test("only an admin can read or write the policy", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "user_alice" });

    await expect(asUser(t, "user_alice").query(api.stepUp.orgPolicy, {})).rejects.toThrow();
  });
});
