/**
 * Phase 4 of docs/future-features/21_auth-consolidation.md: unlocking the
 * Applicant Management vault with a passkey, as an alternative to typing
 * its password. The actual WebAuthn assertion is verified in apps/api
 * (Web Crypto isn't available the same way here) — these tests exercise
 * what's left on the Convex side: `status`'s `hasPasskey` flag and the
 * server-key-gated `apiUnlockViaPasskey` mutation apps/api calls once it's
 * already confirmed the assertion resolves to the caller's own account.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { hashPassword } from "./activity/lib/crypto";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("./**/*.ts"),
    ...import.meta.glob("./**/*.js"),
  }).filter(([path]) => !/\.(test|config)\.ts$/.test(path) && !path.endsWith(".d.ts")),
) as Record<string, () => Promise<unknown>>;

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

async function seedMember(
  t: T,
  opts: { clerkUserId: string; applicantAccess?: boolean; role?: "admin" | "employee" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: `${opts.clerkUserId}@advantisgroup.de`,
      role: opts.role ?? "employee",
      applicantAccess: opts.applicantAccess ?? true,
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedPasskey(t: T, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) =>
    ctx.db.insert("passkeys", {
      userId,
      credentialId: `cred_${userId}`,
      publicKey: "pk",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Test passkey",
      createdAt: Date.now(),
    }),
  );
}

/** Phase 7 of docs/future-features/21_auth-consolidation.md: an unlock
 * attempt is refused outright unless this area's 14-day intranet
 * re-verification is current — seeded here so `apiUnlockViaPasskey` tests
 * that aren't themselves testing that gate can get past it. */
async function seedAreaTrust(t: T, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) =>
    ctx.db.insert("areaStepUps", {
      userId,
      area: "applicant_vault",
      verifiedAt: Date.now(),
      method: "email_code",
    }),
  );
}

/** A real, verifiable vault password — needed for Phase 8 tests that
 * exercise `unlock`'s password path rather than just reading the row back. */
async function seedVaultPassword(t: T, userId: Id<"users">, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await t.run(async (ctx) =>
    ctx.db.insert("applicantVaultPasswords", { userId, hash, updatedAt: Date.now() }),
  );
}

/** Phase 8's admin toggle, pre-enabled with a `SetAt` far enough in the past
 * that the grace period has already elapsed by the time a test reads it. */
async function seedLegacyPasswordSunset(
  t: T,
  admin: Id<"users">,
  opts: { applicantVault?: boolean; elapsedDays?: number } = {},
) {
  const setAt = Date.now() - (opts.elapsedDays ?? 31) * 86_400_000;
  await t.run(async (ctx) =>
    ctx.db.insert("authPolicy", {
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
      performanceLegacyPasswordSunsetEnabled: false,
      performanceLegacyPasswordSunsetSetAt: 0,
      applicantVaultLegacyPasswordSunsetEnabled: opts.applicantVault ?? false,
      applicantVaultLegacyPasswordSunsetSetAt: setAt,
      legacyPasswordGraceDays: 30,
      updatedAt: Date.now(),
      updatedByUserId: admin,
    }),
  );
}

describe("status", () => {
  test("hasPasskey is false with none registered, true once one exists", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });

    const before = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(before.hasPasskey).toBe(false);

    await seedPasskey(t, userId);
    const after = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(after.hasPasskey).toBe(true);
  });
});

describe("apiUnlockViaPasskey", () => {
  test("unlocks the vault for an applicant-area member", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await seedPasskey(t, userId);
    await seedAreaTrust(t, userId);

    await t.mutation(api.applicantVault.apiUnlockViaPasskey, {
      serverKey,
      clerkUserId: "alice",
    });

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
    expect(status.expiresAt).not.toBeNull();

    const auditRows = await t.run(async (ctx) =>
      ctx.db
        .query("applicantAuditLog")
        .filter((q) => q.eq(q.field("actorUserId"), userId))
        .collect(),
    );
    expect(auditRows.some((r) => r.action === "vault_unlocked_via_passkey")).toBe(true);
  });

  test("rejects a caller with no applicant-area access", async () => {
    const t = setup();
    await seedMember(t, { clerkUserId: "outsider", applicantAccess: false });

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey,
        clerkUserId: "outsider",
      }),
    ).rejects.toThrow("You do not have permission");
  });

  test("rejects an unknown clerkUserId", async () => {
    const t = setup();

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey,
        clerkUserId: "nobody",
      }),
    ).rejects.toThrow("You do not have permission");
  });

  test("rejects a wrong server key", async () => {
    const t = setup();
    await seedMember(t, { clerkUserId: "alice" });

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey: "wrong",
        clerkUserId: "alice",
      }),
    ).rejects.toThrow("Invalid server key");
  });

  test("an admin without the applicantAccess flag can still unlock", async () => {
    const t = setup();
    const userId = await seedMember(t, {
      clerkUserId: "admin",
      applicantAccess: false,
      role: "admin",
    });
    await seedPasskey(t, userId);
    await seedAreaTrust(t, userId);

    await t.mutation(api.applicantVault.apiUnlockViaPasskey, {
      serverKey,
      clerkUserId: "admin",
    });

    const status = await asUser(t, "admin").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
  });
});

describe("Phase 7 of docs/future-features/21_auth-consolidation.md: area re-verification", () => {
  test("status reports needsAreaStepUp true with no prior area clearance", async () => {
    const t = setup();
    await seedMember(t, { clerkUserId: "alice" });

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.needsAreaStepUp).toBe(true);
    expect(status.areaStepUpRequiredLevel).toBe(1);
    expect(status.areaStepUpAvailableMethods).toEqual(["email_code"]);
  });

  test("status reports needsAreaStepUp false once the area was cleared within 14 days", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await seedAreaTrust(t, userId);

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.needsAreaStepUp).toBe(false);
    expect(status.areaStepUpRequiredLevel).toBeNull();
  });

  test("an unlock attempt is refused without area trust, even with the right passkey", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await seedPasskey(t, userId);

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, { serverKey, clerkUserId: "alice" }),
    ).rejects.toThrow("Re-verify your identity");

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(false);
  });

  test("a clearance older than 14 days no longer trusts the area", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await t.run(async (ctx) =>
      ctx.db.insert("areaStepUps", {
        userId,
        area: "applicant_vault",
        verifiedAt: Date.now() - 15 * 86_400_000,
        method: "email_code",
      }),
    );

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.needsAreaStepUp).toBe(true);
  });

  test("an 'always require step-up' preference still counts a moments-old clearance", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await seedAreaTrust(t, userId);
    await t.run(async (ctx) =>
      ctx.db.insert("areaSecurityPreferences", {
        userId,
        area: "applicant_vault",
        mode: "always_step_up",
        updatedAt: Date.now(),
      }),
    );

    // Rejecting the step-up someone just completed would be a permanent
    // lockout, not extra security — see `isAreaTrusted`'s
    // ALWAYS_STEP_UP_FRESHNESS_MS.
    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.needsAreaStepUp).toBe(false);
  });

  test("an 'always require step-up' preference demands a fresh clearance once the freshness window passes", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "bob" });
    await t.run(async (ctx) => {
      // Well within the normal 14-day trust_device window, but past
      // always_step_up's much shorter freshness window.
      await ctx.db.insert("areaStepUps", {
        userId,
        area: "applicant_vault",
        verifiedAt: Date.now() - 10 * 60_000,
        method: "email_code",
      });
      await ctx.db.insert("areaSecurityPreferences", {
        userId,
        area: "applicant_vault",
        mode: "always_step_up",
        updatedAt: Date.now(),
      });
    });

    const status = await asUser(t, "bob").query(api.applicantVault.status, {});
    expect(status.needsAreaStepUp).toBe(true);
  });
});

describe("Phase 8 of docs/future-features/21_auth-consolidation.md: legacy password grace period", () => {
  test("password unlock still works while the sunset is off", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "rita" });
    await seedAreaTrust(t, userId);
    await seedVaultPassword(t, userId, "correct-horse");
    await seedPasskey(t, userId);

    await asUser(t, "rita").action(api.applicantVault.unlock, { password: "correct-horse" });

    const status = await asUser(t, "rita").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
  });

  test("password unlock is refused once the sunset has elapsed, for a member with a passkey", async () => {
    const t = setup();
    const admin = await seedMember(t, { clerkUserId: "sam" });
    await seedLegacyPasswordSunset(t, admin, { applicantVault: true });
    const userId = await seedMember(t, { clerkUserId: "tara" });
    await seedAreaTrust(t, userId);
    await seedVaultPassword(t, userId, "correct-horse");
    await seedPasskey(t, userId);

    await expect(
      asUser(t, "tara").action(api.applicantVault.unlock, { password: "correct-horse" }),
    ).rejects.toThrow("Password unlock has moved");
  });

  test("a member with no passkey is never sunset — there's no other way in", async () => {
    const t = setup();
    const admin = await seedMember(t, { clerkUserId: "uma" });
    await seedLegacyPasswordSunset(t, admin, { applicantVault: true });
    const userId = await seedMember(t, { clerkUserId: "victor" });
    await seedAreaTrust(t, userId);
    await seedVaultPassword(t, userId, "correct-horse");

    await asUser(t, "victor").action(api.applicantVault.unlock, { password: "correct-horse" });

    const status = await asUser(t, "victor").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
  });

  test("passkey unlock is unaffected by the sunset, whatever the password's state", async () => {
    const t = setup();
    const admin = await seedMember(t, { clerkUserId: "wendy" });
    await seedLegacyPasswordSunset(t, admin, { applicantVault: true });
    const userId = await seedMember(t, { clerkUserId: "xavier" });
    await seedAreaTrust(t, userId);
    await seedPasskey(t, userId);

    await t.mutation(api.applicantVault.apiUnlockViaPasskey, {
      serverKey,
      clerkUserId: "xavier",
    });

    const status = await asUser(t, "xavier").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
  });

  test("a wrong password is refused before the sunset check ever runs", async () => {
    const t = setup();
    const admin = await seedMember(t, { clerkUserId: "yara" });
    await seedLegacyPasswordSunset(t, admin, { applicantVault: true });
    const userId = await seedMember(t, { clerkUserId: "zane" });
    await seedAreaTrust(t, userId);
    await seedVaultPassword(t, userId, "correct-horse");
    await seedPasskey(t, userId);

    await expect(
      asUser(t, "zane").action(api.applicantVault.unlock, { password: "wrong-password" }),
    ).rejects.toThrow("Incorrect password");
  });
});
