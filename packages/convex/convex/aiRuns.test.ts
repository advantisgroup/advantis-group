/**
 * AI runs and drafts: the two tables that exist so work survives a refresh.
 *
 * The API half (the model call, encryption) lives in apps/api; these tests
 * call the `api*` functions the way that service does and check what the
 * browser-side queries then let each person see.
 */
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { versionsToDrop } from "./drafts/drafts";
import schema from "./schema";
import { modules } from "./test.setup";

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** An employee who may use AI — the `use_ai` capability via a custom role,
 * which is what `apiStart` checks before it opens a run. */
async function seedUser(t: T, clerkUserId: string, { ai = true }: { ai?: boolean } = {}) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
    });
    if (!ai) return;
    const roleId = await ctx.db.insert("customRoles", {
      name: `ai-${clerkUserId}`,
      capabilities: ["use_ai"],
      createdBy: userId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(userId, { customRoleIds: [roleId] });
  });
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
      await t.mutation(api.aiRuns.apiProgress, {
        serverKey,
        runId,
        phase: "writing",
        outputChars: 4,
      }),
    ).toEqual({ cancelled: true });

    await t.mutation(api.aiRuns.apiFinish, { serverKey, runId, output: "late", outputChars: 4 });
    expect(await alice.query(api.aiRuns.get, { runId })).toMatchObject({ status: "cancelled" });
  });

  test("a run needs the use_ai capability, which managers have by their tier", async () => {
    const t = setup();
    await seedUser(t, "user_carol", { ai: false });
    await expect(startChatRun(t, "user_carol")).rejects.toThrow(/no_capability/);

    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("clerkUserId"), "user_carol"))
        .first();
      await ctx.db.patch(user!._id, { role: "manager" });
    });
    expect(await startChatRun(t, "user_carol")).toBeDefined();
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

    await alice.mutation(api.drafts.drafts.save, { ...key, data: '{"title":"Hallo"}' });
    await bob.mutation(api.drafts.drafts.save, { ...key, data: '{"title":"Moin"}' });

    expect(await alice.query(api.drafts.drafts.get, key)).toMatchObject({
      data: '{"title":"Hallo"}',
    });
    expect(await bob.query(api.drafts.drafts.get, key)).toMatchObject({ data: '{"title":"Moin"}' });

    await alice.mutation(api.drafts.drafts.discard, key);
    expect(await alice.query(api.drafts.drafts.get, key)).toBeNull();
    expect(await bob.query(api.drafts.drafts.get, key)).not.toBeNull();
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

    await expect(alice.mutation(api.drafts.drafts.save, { ...key, data: "{}" })).rejects.toThrow();

    const unlockId = await t.run((ctx) =>
      ctx.db.insert("applicantVaultUnlocks", {
        userId,
        unlockedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );
    await alice.mutation(api.drafts.drafts.save, { ...key, data: '{"name":"Jana"}' });
    expect(await alice.query(api.drafts.drafts.get, key)).toMatchObject({
      data: '{"name":"Jana"}',
    });

    await t.run((ctx) => ctx.db.patch(unlockId, { expiresAt: Date.now() - 1 }));
    expect(await alice.query(api.drafts.drafts.get, key)).toBeNull();
  });

  test("a pause makes a version, and going back to one branches off instead of deleting", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const alice = await seedUser(t, "user_alice");
      const key = { surface: "blogPost" as const, subjectKey: "new" };
      const save = (title: string) =>
        alice.mutation(api.drafts.drafts.save, { ...key, data: JSON.stringify({ title }) });
      const history = () => alice.query(api.drafts.drafts.listVersions, key);

      await save("A");
      vi.advanceTimersByTime(1_000);
      await save("AB");
      expect((await history()).versions).toHaveLength(0);

      vi.advanceTimersByTime(30_000);
      await save("ABC");
      const [ab] = (await history()).versions;
      expect(ab).toMatchObject({ data: '{"title":"AB"}', parentId: null });

      const { previousVersionId } = await alice.mutation(api.drafts.drafts.restoreVersion, {
        ...key,
        versionId: ab._id,
      });
      const afterRestore = await history();
      expect(afterRestore.headId).toBe(ab._id);
      expect(afterRestore.versions[0]).toMatchObject({
        _id: previousVersionId,
        data: '{"title":"ABC"}',
        parentId: ab._id,
      });
      expect(await alice.query(api.drafts.drafts.get, key)).toMatchObject({
        data: '{"title":"AB"}',
      });

      vi.advanceTimersByTime(30_000);
      await save("ABX");
      vi.advanceTimersByTime(30_000);
      await save("ABXY");
      const { versions, headId } = await history();
      expect(versions.map((v) => v.data)).toEqual([
        '{"title":"ABX"}',
        '{"title":"ABC"}',
        '{"title":"AB"}',
      ]);
      expect(versions.filter((v) => v.parentId === ab._id)).toHaveLength(2);
      expect(headId).toBe(versions[0]._id);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a shared version is readable by who it's shared with, and no one else", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const alice = await seedUser(t, "user_alice");
      const bob = await seedUser(t, "user_bob");
      const carol = await seedUser(t, "user_carol");
      const bobId = await t.run(async (ctx) => {
        const user = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("clerkUserId"), "user_bob"))
          .first();
        return user!._id;
      });
      const draftId = await alice.mutation(api.drafts.drafts.create, { surface: "blogPost" });
      const key = { surface: "blogPost" as const, subjectKey: draftId };
      await alice.mutation(api.drafts.drafts.save, {
        ...key,
        data: '{"title":"Launch post"}',
        href: `/blog/draft/${draftId}`,
      });

      const versionId = await alice.mutation(api.drafts.shares.share, {
        ...key,
        userIds: [bobId],
        name: "Shared with Bob",
      });
      expect(await bob.query(api.drafts.shares.get, { versionId })).toMatchObject({
        data: '{"title":"Launch post"}',
        isOwner: false,
        canContinue: true,
      });
      expect(await carol.query(api.drafts.shares.get, { versionId })).toBeNull();
      await expect(
        carol.mutation(api.drafts.shares.addComment, { versionId, body: "hi" }),
      ).rejects.toThrow();

      await bob.mutation(api.drafts.shares.addComment, { versionId, body: "Looks good" });
      expect(await alice.query(api.drafts.shares.listComments, { versionId })).toHaveLength(1);
      const aliceNotifications = await alice.query(api.notifications.notifications.list, {});
      expect(aliceNotifications[0]).toMatchObject({ type: "draft_comment" });

      // What Alice writes afterwards isn't shared.
      vi.advanceTimersByTime(30_000);
      await alice.mutation(api.drafts.drafts.save, { ...key, data: '{"title":"Launch post v2"}' });
      expect(await bob.query(api.drafts.shares.get, { versionId })).toMatchObject({
        data: '{"title":"Launch post"}',
      });

      const href = await bob.mutation(api.drafts.shares.continueFrom, { versionId });
      expect(href).toMatch(/^\/blog\/draft\//);
      expect(href).not.toContain(draftId);

      await alice.mutation(api.drafts.shares.unshare, { versionId, userId: bobId });
      expect(await bob.query(api.drafts.shares.get, { versionId })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("old versions thin out, named ones stay", () => {
    const now = 100 * 86_400_000;
    const minutesAgo = (m: number, name?: string) => ({ savedAt: now - m * 60_000, name });
    const versions = [
      minutesAgo(1),
      minutesAgo(30),
      minutesAgo(121),
      minutesAgo(122),
      minutesAgo(123, "Sent for review"),
    ];
    expect(versionsToDrop(versions, now)).toEqual([versions[3]]);
  });
});
