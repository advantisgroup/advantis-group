/**
 * Phase 1 of docs/future-features/21_auth-consolidation.md: resolving a
 * Performance login's `linkedUserId` by matching its email against an
 * intranet account, without an admin picking it — scoped to Advantis (the
 * only company with intranet accounts at all), never overriding a human's
 * own choice, and never claiming an account another login already holds.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { hashPassword } from "./activity/lib/crypto";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("./**/*.ts"),
    ...import.meta.glob("./**/*.js"),
  }).filter(([path]) => !/\.(test|config)\.ts$/.test(path) && !path.endsWith(".d.ts")),
) as Record<string, () => Promise<unknown>>;

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

async function seedCompany(t: T, slug: string): Promise<Id<"companies">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", {
      name: slug,
      slug,
      domain: `${slug}.example.com`,
      status: "active",
      adminBootstrapEmails: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedUser(
  t: T,
  opts: { clerkUserId: string; email: string; status?: "active" | "suspended" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: opts.email,
      role: "employee",
      status: opts.status ?? "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedLogin(
  t: T,
  opts: { companyId: Id<"companies">; email: string; linkedUserId?: Id<"users"> },
): Promise<Id<"performanceLogins">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("performanceLogins", {
      email: opts.email,
      name: "Test Login",
      passwordHash: "hash",
      companyId: opts.companyId,
      linkedUserId: opts.linkedUserId,
      active: true,
      createdAt: Date.now(),
    }),
  );
}

/** Like `seedLogin`, but with a real, verifiable password hash — needed for
 * Phase 8 tests that exercise `login`'s password path rather than just
 * reading the row back. */
async function seedLoginWithPassword(
  t: T,
  opts: { companyId: Id<"companies">; email: string; password: string; linkedUserId?: Id<"users"> },
): Promise<Id<"performanceLogins">> {
  const passwordHash = await hashPassword(opts.password);
  return await t.run(async (ctx) =>
    ctx.db.insert("performanceLogins", {
      email: opts.email,
      name: "Test Login",
      passwordHash,
      companyId: opts.companyId,
      linkedUserId: opts.linkedUserId,
      active: true,
      createdAt: Date.now(),
    }),
  );
}

/** Phase 8 of docs/future-features/21_auth-consolidation.md's admin toggle,
 * pre-enabled with a `SetAt` far enough in the past that the grace period
 * has already elapsed by the time a test reads it. */
async function seedLegacyPasswordSunset(
  t: T,
  admin: Id<"users">,
  opts: { performance?: boolean; applicantVault?: boolean; elapsedDays?: number } = {},
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
      performanceLegacyPasswordSunsetEnabled: opts.performance ?? false,
      performanceLegacyPasswordSunsetSetAt: setAt,
      applicantVaultLegacyPasswordSunsetEnabled: opts.applicantVault ?? false,
      applicantVaultLegacyPasswordSunsetSetAt: setAt,
      legacyPasswordGraceDays: 30,
      updatedAt: Date.now(),
      updatedByUserId: admin,
    }),
  );
}

async function seedRole(t: T, companyId: Id<"companies">): Promise<Id<"companyRoles">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("companyRoles", {
      companyId,
      name: "Employee",
      permissions: [],
      isBuiltIn: true,
      createdAt: Date.now(),
    }),
  );
}

/** A cross-company super-admin session token — bypasses per-company
 * permission checks entirely, so `createLogin`'s own admin gate needs no
 * separate role/permission seeding. */
async function seedSuperAdminSession(t: T): Promise<string> {
  const loginId = await t.run(async (ctx) =>
    ctx.db.insert("performanceLogins", {
      email: "root@advantisgroup.de",
      name: "Root",
      passwordHash: "hash",
      isSuperAdmin: true,
      active: true,
      createdAt: Date.now(),
    }),
  );
  const { token } = await t.mutation(internal.performanceAuth.createSession, { loginId });
  return token;
}

describe("findAutoLinkCandidateForCompany", () => {
  test("matches an active Advantis intranet account by email", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });

    const candidate = await t.query(internal.performanceAuth.findAutoLinkCandidateForCompany, {
      companyId: advantis,
      email: "alice@advantisgroup.de",
    });
    expect(candidate).toBe(user);
  });

  test("never matches for a non-Advantis company — that table is Advantis's own staff only", async () => {
    const t = setup();
    const otherCo = await seedCompany(t, "acme");
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });

    const candidate = await t.query(internal.performanceAuth.findAutoLinkCandidateForCompany, {
      companyId: otherCo,
      email: "alice@advantisgroup.de",
    });
    expect(candidate).toBeNull();
  });

  test("skips a suspended account", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    await seedUser(t, {
      clerkUserId: "bob",
      email: "bob@advantisgroup.de",
      status: "suspended",
    });

    const candidate = await t.query(internal.performanceAuth.findAutoLinkCandidateForCompany, {
      companyId: advantis,
      email: "bob@advantisgroup.de",
    });
    expect(candidate).toBeNull();
  });

  test("skips an account already claimed by a different login", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "carl", email: "carl@advantisgroup.de" });
    await seedLogin(t, {
      companyId: advantis,
      email: "other@advantisgroup.de",
      linkedUserId: user,
    });

    const candidate = await t.query(internal.performanceAuth.findAutoLinkCandidateForCompany, {
      companyId: advantis,
      email: "carl@advantisgroup.de",
    });
    expect(candidate).toBeNull();
  });
});

describe("performanceAuth.reconcileAutoLinks", () => {
  test("links every unlinked Advantis login whose email matches an active account", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "dana", email: "dana@advantisgroup.de" });
    const loginId = await seedLogin(t, { companyId: advantis, email: "dana@advantisgroup.de" });

    const { linked } = await t.mutation(internal.performanceAuth.reconcileAutoLinks, {});
    expect(linked).toBe(1);

    const login = await t.run(async (ctx) => ctx.db.get(loginId));
    expect(login?.linkedUserId).toBe(user);
    expect(login?.autoLinkedVia).toBe("email_match");
  });

  test("never overrides a login that's already linked", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const original = await seedUser(t, { clerkUserId: "eve", email: "eve@advantisgroup.de" });
    const decoy = await seedUser(t, { clerkUserId: "eve2", email: "eve2@advantisgroup.de" });
    const loginId = await seedLogin(t, {
      companyId: advantis,
      email: "eve2@advantisgroup.de",
      linkedUserId: original,
    });
    void decoy;

    const { linked } = await t.mutation(internal.performanceAuth.reconcileAutoLinks, {});
    expect(linked).toBe(0);

    const login = await t.run(async (ctx) => ctx.db.get(loginId));
    expect(login?.linkedUserId).toBe(original);
    expect(login?.autoLinkedVia).toBeUndefined();
  });

  test("does nothing when Advantis has no logins to reconcile", async () => {
    const t = setup();
    await seedCompany(t, "acme");

    const { linked } = await t.mutation(internal.performanceAuth.reconcileAutoLinks, {});
    expect(linked).toBe(0);
  });
});

describe("createLogin — Phase 3: auto-linked accounts skip the password requirement", () => {
  test("an auto-linkable email needs no password at all", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "frank", email: "frank@advantisgroup.de" });
    const roleId = await seedRole(t, advantis);
    const token = await seedSuperAdminSession(t);

    const { id } = await t.action(api.performanceAuth.createLogin, {
      token,
      email: "frank@advantisgroup.de",
      name: "Frank",
      roleId,
      companyId: advantis,
    });

    const login = await t.run(async (ctx) => ctx.db.get(id));
    expect(login?.linkedUserId).toBe(user);
    expect(login?.autoLinkedVia).toBe("email_match");
    expect(login?.passwordHash).toBeTruthy();
  });

  test("an email with no auto-link candidate still requires a password", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const roleId = await seedRole(t, advantis);
    const token = await seedSuperAdminSession(t);

    await expect(
      t.action(api.performanceAuth.createLogin, {
        token,
        email: "nobody@advantisgroup.de",
        name: "Nobody",
        roleId,
        companyId: advantis,
      }),
    ).rejects.toThrow("Password must be at least 8 characters.");
  });

  test("an admin-picked linkedUserId still needs no password, same as before", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "grace", email: "grace@advantisgroup.de" });
    const roleId = await seedRole(t, advantis);
    const token = await seedSuperAdminSession(t);

    const { id } = await t.action(api.performanceAuth.createLogin, {
      token,
      email: "grace-work@example.com",
      name: "Grace",
      roleId,
      companyId: advantis,
      linkedUserId: user,
    });

    const login = await t.run(async (ctx) => ctx.db.get(id));
    expect(login?.linkedUserId).toBe(user);
    expect(login?.autoLinkedVia).toBeUndefined();
  });
});

describe("Phase 7 of docs/future-features/21_auth-consolidation.md: area re-verification", () => {
  test("validateSession reports needsAreaStepUp for a linked account with no prior clearance", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "hank", email: "hank@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "hank@advantisgroup.de", linkedUserId: user });

    const session = await asUser(t, "hank").query(api.performanceAuth.validateSession, {
      token: "",
    });
    expect(session.valid).toBe(false);
    expect((session as { needsAreaStepUp?: boolean }).needsAreaStepUp).toBe(true);
  });

  test("validateSession resolves once the area has a fresh clearance", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "iris", email: "iris@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "iris@advantisgroup.de", linkedUserId: user });
    await t.run(async (ctx) =>
      ctx.db.insert("areaStepUps", {
        userId: user,
        area: "performance",
        verifiedAt: Date.now(),
        method: "email_code",
      }),
    );

    const session = await asUser(t, "iris").query(api.performanceAuth.validateSession, {
      token: "",
    });
    expect(session.valid).toBe(true);
    if (session.valid) expect(session.viaClerk).toBe(true);
  });

  test("a clearance older than 14 days no longer resolves the linked login", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "jill", email: "jill@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "jill@advantisgroup.de", linkedUserId: user });
    await t.run(async (ctx) =>
      ctx.db.insert("areaStepUps", {
        userId: user,
        area: "performance",
        verifiedAt: Date.now() - 15 * 86_400_000,
        method: "email_code",
      }),
    );

    const session = await asUser(t, "jill").query(api.performanceAuth.validateSession, {
      token: "",
    });
    expect(session.valid).toBe(false);
  });

  test("createSessionForLinkedAccount refuses to mint a token without area trust", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "kate", email: "kate@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "kate@advantisgroup.de", linkedUserId: user });

    const result = await asUser(t, "kate").mutation(
      api.performanceAuth.createSessionForLinkedAccount,
      {},
    );
    expect(result).toBeNull();
  });

  test("a promoted token stops resolving once its area trust lapses, even though the token itself hasn't expired", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "liam", email: "liam@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "liam@advantisgroup.de", linkedUserId: user });
    await t.run(async (ctx) =>
      ctx.db.insert("areaStepUps", {
        userId: user,
        area: "performance",
        verifiedAt: Date.now(),
        method: "email_code",
      }),
    );

    const token = await asUser(t, "liam").mutation(
      api.performanceAuth.createSessionForLinkedAccount,
      {},
    );
    expect(token).not.toBeNull();

    // Trust lapses — the promoted token's own `expiresAt` is untouched, but
    // it must stop resolving anyway (see `resolveActiveSession`'s
    // `viaClerk` re-check).
    await t.run(async (ctx) => {
      const trust = await ctx.db
        .query("areaStepUps")
        .withIndex("by_user_area", (q) => q.eq("userId", user).eq("area", "performance"))
        .unique();
      if (trust) await ctx.db.patch(trust._id, { verifiedAt: Date.now() - 15 * 86_400_000 });
    });

    const session = await t.query(api.performanceAuth.validateSession, { token: token!.token });
    expect(session.valid).toBe(false);
  });

  test("a real password login's session is unaffected by area trust", async () => {
    const t = setup();
    const loginId = await t.run(async (ctx) =>
      ctx.db.insert("performanceLogins", {
        email: "pw@advantisgroup.de",
        name: "Password Login",
        passwordHash: "hash",
        isSuperAdmin: true,
        active: true,
        createdAt: Date.now(),
      }),
    );
    const { token } = await t.mutation(internal.performanceAuth.createSession, { loginId });

    const session = await t.query(api.performanceAuth.validateSession, { token });
    expect(session.valid).toBe(true);
  });

  test("the 'always require step-up' preference blocks resolution however recent the clearance", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "mona", email: "mona@advantisgroup.de" });
    await seedLogin(t, { companyId: advantis, email: "mona@advantisgroup.de", linkedUserId: user });
    await t.run(async (ctx) => {
      await ctx.db.insert("areaStepUps", {
        userId: user,
        area: "performance",
        verifiedAt: Date.now(),
        method: "email_code",
      });
      await ctx.db.insert("areaSecurityPreferences", {
        userId: user,
        area: "performance",
        mode: "always_step_up",
        updatedAt: Date.now(),
      });
    });

    const session = await asUser(t, "mona").query(api.performanceAuth.validateSession, {
      token: "",
    });
    expect(session.valid).toBe(false);
  });
});

describe("Phase 8 of docs/future-features/21_auth-consolidation.md: legacy password grace period", () => {
  test("a linked account's password still works while the sunset is off", async () => {
    const t = setup();
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "nora", email: "nora@advantisgroup.de" });
    await seedLoginWithPassword(t, {
      companyId: advantis,
      email: "nora@advantisgroup.de",
      password: "correct-horse",
      linkedUserId: user,
    });

    const result = await t.action(api.performanceAuth.login, {
      slug: "advantis",
      email: "nora@advantisgroup.de",
      password: "correct-horse",
    });
    expect(result.token).toBeTruthy();
  });

  test("a linked account's password is refused once the sunset has elapsed", async () => {
    const t = setup();
    const admin = await seedUser(t, {
      clerkUserId: "sunset_admin",
      email: "sunset_admin@advantisgroup.de",
    });
    await seedLegacyPasswordSunset(t, admin, { performance: true });
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "oscar", email: "oscar@advantisgroup.de" });
    await seedLoginWithPassword(t, {
      companyId: advantis,
      email: "oscar@advantisgroup.de",
      password: "correct-horse",
      linkedUserId: user,
    });

    await expect(
      t.action(api.performanceAuth.login, {
        slug: "advantis",
        email: "oscar@advantisgroup.de",
        password: "correct-horse",
      }),
    ).rejects.toThrow("Password sign-in for this account has moved");
  });

  test("an unlinked login's password never sunsets — there's no other way in", async () => {
    const t = setup();
    const admin = await seedUser(t, {
      clerkUserId: "sunset_admin2",
      email: "sunset_admin2@advantisgroup.de",
    });
    await seedLegacyPasswordSunset(t, admin, { performance: true });
    const advantis = await seedCompany(t, "advantis");
    await seedLoginWithPassword(t, {
      companyId: advantis,
      email: "standalone@company.example",
      password: "correct-horse",
    });

    const result = await t.action(api.performanceAuth.login, {
      slug: "advantis",
      email: "standalone@company.example",
      password: "correct-horse",
    });
    expect(result.token).toBeTruthy();
  });

  test("a wrong password is refused before the sunset check ever runs, for a linked account", async () => {
    const t = setup();
    const admin = await seedUser(t, {
      clerkUserId: "sunset_admin3",
      email: "sunset_admin3@advantisgroup.de",
    });
    await seedLegacyPasswordSunset(t, admin, { performance: true });
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "pat", email: "pat@advantisgroup.de" });
    await seedLoginWithPassword(t, {
      companyId: advantis,
      email: "pat@advantisgroup.de",
      password: "correct-horse",
      linkedUserId: user,
    });

    await expect(
      t.action(api.performanceAuth.login, {
        slug: "advantis",
        email: "pat@advantisgroup.de",
        password: "wrong-password",
      }),
    ).rejects.toThrow("Email or password is incorrect");
  });

  test("a linked account still works within the grace period, even with the sunset enabled", async () => {
    const t = setup();
    const admin = await seedUser(t, {
      clerkUserId: "sunset_admin4",
      email: "sunset_admin4@advantisgroup.de",
    });
    await seedLegacyPasswordSunset(t, admin, { performance: true, elapsedDays: 5 });
    const advantis = await seedCompany(t, "advantis");
    const user = await seedUser(t, { clerkUserId: "quinn", email: "quinn@advantisgroup.de" });
    await seedLoginWithPassword(t, {
      companyId: advantis,
      email: "quinn@advantisgroup.de",
      password: "correct-horse",
      linkedUserId: user,
    });

    const result = await t.action(api.performanceAuth.login, {
      slug: "advantis",
      email: "quinn@advantisgroup.de",
      password: "correct-horse",
    });
    expect(result.token).toBeTruthy();
  });

  test("legacyPasswordSunsetNotice reports the deadline generically, with no account lookup", async () => {
    const t = setup();
    const admin = await seedUser(t, {
      clerkUserId: "sunset_admin5",
      email: "sunset_admin5@advantisgroup.de",
    });
    await seedLegacyPasswordSunset(t, admin, { performance: true });

    const notice = await t.query(api.performanceAuth.legacyPasswordSunsetNotice, {});
    expect(notice.enabled).toBe(true);
    expect(notice.deadlineAt).not.toBeNull();
  });

  test("legacyPasswordSunsetNotice reports disabled when the toggle is off", async () => {
    const t = setup();

    const notice = await t.query(api.performanceAuth.legacyPasswordSunsetNotice, {});
    expect(notice.enabled).toBe(false);
    expect(notice.deadlineAt).toBeNull();
  });
});
