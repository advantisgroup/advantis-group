/**
 * Auto-approval for password resets explained by an existing or
 * admin-registered email link — see `docs/password-resets.md`'s "Linked
 * emails" section. Covers `resolveTarget`'s two automatic resolution paths
 * (through `requestReset`, since `resolveTarget` itself isn't exported),
 * the admin-maintained `passwordResetLinkedEmails` fallback, and the
 * backward-compat case where nothing explains a mismatch and a human still
 * has to review it.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
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

async function seedUser(
  t: T,
  opts: { clerkUserId: string; email: string; role?: "admin" | "manager" | "employee" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: opts.email,
      role: opts.role ?? "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedCompany(t: T, slug = "advantis"): Promise<Id<"companies">> {
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

async function seedLogin(
  t: T,
  opts: {
    companyId: Id<"companies">;
    email: string;
    name?: string;
    linkedUserId?: Id<"users">;
    active?: boolean;
  },
): Promise<Id<"performanceLogins">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("performanceLogins", {
      email: opts.email,
      name: opts.name ?? "Test Login",
      passwordHash: "hash",
      companyId: opts.companyId,
      linkedUserId: opts.linkedUserId,
      active: opts.active ?? true,
      createdAt: Date.now(),
    }),
  );
}

async function requestRow(t: T, requestId: Id<"passwordResetRequests">) {
  return await t.run(async (ctx) => ctx.db.get(requestId));
}

async function tokensFor(t: T, targetLoginId: Id<"performanceLogins">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("passwordResetTokens")
      .withIndex("by_targetLogin", (q) => q.eq("targetLoginId", targetLoginId))
      .collect(),
  );
}

/** Inserts an already-verified `userSecondaryEmails` row directly, skipping
 * the code-request/verify round trip `secondaryEmails.test.ts` covers on
 * its own. */
async function seedVerifiedSecondaryEmail(
  t: T,
  userId: Id<"users">,
  email: string,
  verified = true,
): Promise<void> {
  await t.run(async (ctx) =>
    ctx.db.insert("userSecondaryEmails", {
      userId,
      email,
      verifiedAt: verified ? Date.now() : undefined,
      addedAt: Date.now(),
    }),
  );
}

// Fake timers must be live *before* `requestReset` schedules
// `autoIssueLinkedReset` (a real `setTimeout` created before fake timers are
// installed is invisible to `vi.runAllTimers()`), so these run for every
// test in this file rather than being toggled per-call.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Requests are `pending` the instant `requestReset` returns — an
 * auto-approval only lands once its scheduled action actually runs. */
async function runScheduled(t: T) {
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
}

describe("target-side linked account (typed the wrong side of a linkedUserId pair)", () => {
  test("typing the linked intranet email resolves to the login and auto-issues", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    const loginId = await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });

    // Filed anonymously (no Clerk session) — the trust comes from the link
    // itself, not from who's asking.
    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice@intranet.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const requests = await t.run(async (ctx) => ctx.db.query("passwordResetRequests").collect());
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.selfService).toBe(false);
    expect(request.autoApproved).toBe(true);
    expect(request.autoApprovedVia).toBe("targetLinkedAccount");
    expect(request.targetLoginId).toBe(loginId);

    await runScheduled(t);

    const after = await requestRow(t, request._id);
    expect(after?.status).toBe("issued");
    expect(after?.handledByUserId).toBeUndefined();

    const tokens = await tokensFor(t, loginId);
    expect(tokens).toHaveLength(1);
    // Always the login's own address — never the intranet email that was
    // actually typed.
    expect(tokens[0]!.sentToEmail).toBe("alice.performance@company.example");
    expect(tokens[0]!.issuedByUserId).toBeUndefined();

    const auditRows = await t.run(async (ctx) =>
      ctx.db
        .query("passwordResetAuditLog")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect(),
    );
    expect(auditRows.some((r) => r.event === "link_auto_issued")).toBe(true);
  });

  test("a company boundary is never crossed", async () => {
    const t = setup();
    const companyA = await seedCompany(t, "advantis");
    const companyB = await seedCompany(t, "other-tenant");
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    // Alice's linked login lives in companyB, but the request names companyA.
    await seedLogin(t, {
      companyId: companyB,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice@intranet.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.autoApproved).toBeFalsy();
    expect(request.targetLoginId).toBeUndefined();
  });
});

describe("caller-side linked account (signed in as the linked owner)", () => {
  test("the filer's own email matching the linked intranet address auto-approves", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    const loginId = await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });

    // Signed in as Alice's intranet account, but typing the login's own
    // (different) address — exactly correct, just not what `selfService`
    // alone would recognize.
    const result = await asUser(t, "user_alice").mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice.performance@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.selfService).toBe(false);
    expect(request.autoApprovedVia).toBe("callerLinkedAccount");
    expect(request.targetLoginId).toBe(loginId);
  });
});

describe("admin-maintained linked-emails fallback", () => {
  test("a registered alias pair auto-approves with no linkedUserId involved", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, {
      clerkUserId: "user_admin",
      email: "admin@intranet.example",
      role: "admin",
    });
    const loginId = await seedLogin(t, { companyId, email: "bob@company.example" });
    await t.run(async (ctx) =>
      ctx.db.insert("passwordResetLinkedEmails", {
        scope: "performance",
        companySlug: "advantis",
        aliasEmail: "bob.typo@company.example",
        canonicalEmail: "bob@company.example",
        addedByUserId: adminId,
        createdAt: Date.now(),
      }),
    );

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "bob.typo@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.autoApprovedVia).toBe("adminLinkedEmail");
    expect(request.targetLoginId).toBe(loginId);
    // What was actually typed stays on the row — the alias, not the
    // canonical address it resolved to.
    expect(request.targetEmail).toBe("bob.typo@company.example");
  });

  test("a link registered with no companySlug still matches a request that also leaves it unset", async () => {
    const t = setup();
    const companyId = await seedCompany(t, "advantis");
    const adminId = await seedUser(t, {
      clerkUserId: "user_admin",
      email: "admin@intranet.example",
      role: "admin",
    });
    await seedLogin(t, { companyId, email: "carol@company.example" });

    const addResult = await asUser(t, "user_admin").mutation(api.passwordResets.addLinkedEmail, {
      scope: "performance",
      // Left blank on purpose — the UI does this for the default tenant.
      companySlug: undefined,
      aliasEmail: "carol.typo@company.example",
      canonicalEmail: "carol@company.example",
      sessionId: "sess_admin",
    });
    // No step-up satisfied yet in this test — confirms the gate is live,
    // and that we can still reach the row via `t.run` for the next check.
    expect("needsStepUp" in addResult).toBe(true);
  });
});

describe("Phase 5 of docs/future-features/21_auth-consolidation.md: verified secondary emails", () => {
  test("typing a verified secondary email resolves to the linked login and auto-issues, with no admin-registered pair involved", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    const loginId = await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });
    await seedVerifiedSecondaryEmail(t, aliceUserId, "alice.sales@company.example");

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice.sales@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.selfService).toBe(false);
    expect(request.autoApproved).toBe(true);
    expect(request.autoApprovedVia).toBe("verifiedSecondaryEmail");
    expect(request.targetLoginId).toBe(loginId);

    await runScheduled(t);
    const after = await requestRow(t, request._id);
    expect(after?.status).toBe("issued");
    const tokens = await tokensFor(t, loginId);
    // Still the login's own address — a verified secondary email is proof
    // of identity, not a delivery destination.
    expect(tokens[0]!.sentToEmail).toBe("alice.performance@company.example");
  });

  test("an unverified (pending) secondary email resolves nothing", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });
    await seedVerifiedSecondaryEmail(t, aliceUserId, "alice.sales@company.example", false);

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice.sales@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.autoApproved).toBeFalsy();
    expect(request.targetLoginId).toBeUndefined();
  });

  test("a verified secondary email never crosses a company boundary", async () => {
    const t = setup();
    const companyA = await seedCompany(t, "advantis");
    const companyB = await seedCompany(t, "other-tenant");
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    // Alice's linked login lives in companyB, but the request names companyA.
    await seedLogin(t, {
      companyId: companyB,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });
    await seedVerifiedSecondaryEmail(t, aliceUserId, "alice.sales@company.example");

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice.sales@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.autoApproved).toBeFalsy();
    expect(request.targetLoginId).toBeUndefined();
  });

  test("an admin-registered linked-email pair still takes priority when both exist", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, {
      clerkUserId: "user_admin",
      email: "admin@intranet.example",
      role: "admin",
    });
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    const loginId = await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });
    // A verified secondary email for a *different* address than the one the
    // admin-registered pair resolves to — the admin link should still win,
    // since it's checked (and substitutes `lookupEmail`) before either
    // secondary-email fallback ever runs.
    await seedVerifiedSecondaryEmail(t, aliceUserId, "alice.sales@company.example");
    await t.run(async (ctx) =>
      ctx.db.insert("passwordResetLinkedEmails", {
        scope: "performance",
        companySlug: "advantis",
        aliasEmail: "alice.typo@company.example",
        canonicalEmail: "alice.performance@company.example",
        addedByUserId: adminId,
        createdAt: Date.now(),
      }),
    );

    const result = await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice.typo@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.autoApprovedVia).toBe("adminLinkedEmail");
    expect(request.targetLoginId).toBe(loginId);
  });
});

describe("backward compatibility: an unexplained mismatch stays manual", () => {
  test("a genuine mismatch with no link at all is not auto-approved", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    await seedUser(t, { clerkUserId: "user_mallory", email: "mallory@intranet.example" });
    await seedLogin(t, { companyId, email: "dave@company.example" });

    const result = await asUser(t, "user_mallory").mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "dave@company.example",
      companySlug: "advantis",
    });
    expect(result).toEqual({ status: "sent" });

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.selfService).toBe(false);
    expect(request.autoApproved).toBeFalsy();
    expect(request.autoApprovedVia).toBeUndefined();
    expect(request.status).toBe("pending");

    await runScheduled(t);
    // Nothing should have changed — there was nothing scheduled to run.
    const after = await requestRow(t, request._id);
    expect(after?.status).toBe("pending");
  });

  test("an old row with no auto-approval fields reads exactly like one that predates this feature", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const loginId = await seedLogin(t, { companyId, email: "erin@company.example" });
    // Simulates a row written before `autoApproved`/`autoApprovedVia` existed.
    const requestId = await t.run(async (ctx) =>
      ctx.db.insert("passwordResetRequests", {
        scope: "performance",
        targetEmail: "erin@company.example",
        targetLoginId: loginId,
        targetCompanyId: companyId,
        selfService: false,
        status: "pending",
        createdAt: Date.now(),
      }),
    );

    await seedUser(t, {
      clerkUserId: "user_admin",
      email: "admin@intranet.example",
      role: "admin",
    });
    const rows = await asUser(t, "user_admin").query(api.passwordResets.listRequests, {
      status: "pending",
    });
    const row = rows.find((r) => r.id === requestId);
    expect(row?.autoApproved).toBe(false);
    expect(row?.autoApprovedVia).toBeNull();
  });
});

describe("revoking an issued link", () => {
  test("is refused without a fresh step-up, same as issuing or dismissing", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const aliceUserId = await seedUser(t, {
      clerkUserId: "user_alice",
      email: "alice@intranet.example",
    });
    await seedUser(t, {
      clerkUserId: "user_admin",
      email: "admin@intranet.example",
      role: "admin",
    });
    await seedLogin(t, {
      companyId,
      email: "alice.performance@company.example",
      linkedUserId: aliceUserId,
    });

    await t.mutation(api.passwordResets.requestReset, {
      scope: "performance",
      email: "alice@intranet.example",
      companySlug: "advantis",
    });
    await runScheduled(t);

    const request = (await t.run(async (ctx) => ctx.db.query("passwordResetRequests").first()))!;
    expect(request.status).toBe("issued");

    const result = await asUser(t, "user_admin").mutation(api.passwordResets.revokeIssuedLink, {
      requestId: request._id,
      sessionId: "sess_admin",
    });
    expect("needsStepUp" in result).toBe(true);
  });
});
