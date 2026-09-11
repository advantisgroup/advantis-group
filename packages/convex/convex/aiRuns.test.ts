/**
 * AI runs and drafts: the two tables that exist so work survives a refresh.
 *
 * The API half (the model call, encryption) lives in apps/api; these tests
 * call the `api*` functions the way that service does and check what the
 * browser-side queries then let each person see.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
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

async function seedUser(t: T, clerkUserId: string) {
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return t.withIdentity({ subject: clerkUserId });
}

function startChatRun(t: T, clerkUserId = "user_alice", subjectKey = "wikiChat:1") {
  return t.mutation(api.aiRuns.apiStart, { serverKey, clerkUserId, kind: "wikiChat", subjectKey });
}

describe("aiRuns", () => {
  test("a run is only visible to the person who started it", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const bob = await seedUser(t, "user_bob");
    const runId = await startChatRun(t);

    expect(await alice.query(api.aiRuns.get, { runId })).toMatchObject({ status: "running" });
    expect(await bob.query(api.aiRuns.get, { runId })).toBeNull();
    expect(
      await t.query(api.aiRuns.apiGet, { serverKey, clerkUserId: "user_bob", runId }),
    ).toBeNull();
  });

  test("a live subject refuses a second run, a stale one hands over", async () => {
    const t = setup();
    await seedUser(t, "user_alice");
    const first = await startChatRun(t);

    await expect(startChatRun(t)).rejects.toThrow();

    await t.run((ctx) => ctx.db.patch(first, { heartbeatAt: Date.now() - 60_000 }));
    const second = await startChatRun(t);
    expect(second).not.toBe(first);
    expect(await t.run((ctx) => ctx.db.get(first))).toMatchObject({
      status: "error",
      errorCode: "interrupted",
    });
  });

  test("stopping a run reaches the API on its next heartbeat and can't be undone by it", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const runId = await startChatRun(t);

    await alice.mutation(api.aiRuns.cancel, { runId });
    expect(
      await t.mutation(api.aiRuns.apiProgress, { serverKey, runId, phase: "writing", outputChars: 4 }),
    ).toEqual({ cancelled: true });

    await t.mutation(api.aiRuns.apiFinish, { serverKey, runId, output: "late", outputChars: 4 });
    expect(await alice.query(api.aiRuns.get, { runId })).toMatchObject({ status: "cancelled" });
  });

  test("the dock keeps a finished result until it has been seen", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const runId = await startChatRun(t);
    await t.mutation(api.aiRuns.apiFinish, { serverKey, runId, output: "sealed", outputChars: 6 });

    expect(await alice.query(api.aiRuns.dock, {})).toHaveLength(1);
    await alice.mutation(api.aiRuns.markSeen, { runId });
    expect(await alice.query(api.aiRuns.dock, {})).toHaveLength(0);
  });
});

describe("drafts", () => {
  test("a draft belongs to its author alone", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const bob = await seedUser(t, "user_bob");
    const key = { surface: "blogPost" as const, subjectKey: "new" };

    await alice.mutation(api.drafts.save, { ...key, data: '{"title":"Hallo"}' });
    await bob.mutation(api.drafts.save, { ...key, data: '{"title":"Moin"}' });

    expect(await alice.query(api.drafts.get, key)).toMatchObject({ data: '{"title":"Hallo"}' });
    expect(await bob.query(api.drafts.get, key)).toMatchObject({ data: '{"title":"Moin"}' });

    await alice.mutation(api.drafts.discard, key);
    expect(await alice.query(api.drafts.get, key)).toBeNull();
    expect(await bob.query(api.drafts.get, key)).not.toBeNull();
  });

  test("applicant drafts stay behind the vault", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const key = { surface: "cvReview" as const, subjectKey: "run_1" };
    const userId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("clerkUserId"), "user_alice"))
        .first();
      await ctx.db.patch(user!._id, { applicantAccess: true });
      return user!._id;
    });

    await expect(alice.mutation(api.drafts.save, { ...key, data: "{}" })).rejects.toThrow();

    const unlockId = await t.run((ctx) =>
      ctx.db.insert("applicantVaultUnlocks", {
        userId,
        unlockedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );
    await alice.mutation(api.drafts.save, { ...key, data: '{"name":"Jana"}' });
    expect(await alice.query(api.drafts.get, key)).toMatchObject({ data: '{"name":"Jana"}' });

    await t.run((ctx) => ctx.db.patch(unlockId, { expiresAt: Date.now() - 1 }));
    expect(await alice.query(api.drafts.get, key)).toBeNull();
  });
});
