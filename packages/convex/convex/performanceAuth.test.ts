/**
 * Phase 1 of docs/future-features/21_auth-consolidation.md: resolving a
 * Performance login's `linkedUserId` by matching its email against an
 * intranet account, without an admin picking it — scoped to Advantis (the
 * only company with intranet accounts at all), never overriding a human's
 * own choice, and never claiming an account another login already holds.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
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
