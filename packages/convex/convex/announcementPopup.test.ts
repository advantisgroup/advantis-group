/** Pop-up for new announcements: who sees it and what confirming does. */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import { POPUP_SINCE } from "./announcements";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(POPUP_SINCE + 10 * 3_600_000);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"admin" | "alice", Id<"users">>;
  for (const [clerkUserId, role] of [
    ["admin", "admin"],
    ["alice", "employee"],
  ] as const) {
    ids[clerkUserId] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  const post = (title: string, publishedAt: number) =>
    t.run((ctx) =>
      ctx.db.insert("announcements", {
        title,
        body: `<p>${title}</p>`,
        authorUserId: ids.admin,
        pinned: false,
        audience: { kind: "all" },
        attachmentStorageIds: [],
        publishedAt,
        createdAt: publishedAt,
      }),
    );
  return {
    t,
    ids,
    post,
    admin: t.withIdentity({ subject: "admin" }),
    alice: t.withIdentity({ subject: "alice" }),
  };
}

test("new announcements pop up until confirmed; old ones and own ones don't", async () => {
  const s = await setup();
  await s.post("Alt", POPUP_SINCE - 60_000);
  const first = await s.post("Neu 1", POPUP_SINCE + 60_000);
  await s.post("Neu 2", POPUP_SINCE + 120_000);
  await s.post("Geplant", Date.now() + 3_600_000);

  const queue = await s.alice.query(api.announcements.popupQueue, {});
  expect(queue.map((a) => a.title)).toEqual(["Neu 1", "Neu 2"]);
  // The author doesn't confirm their own announcement.
  expect(await s.admin.query(api.announcements.popupQueue, {})).toEqual([]);

  await s.alice.mutation(api.announcements.confirmPopup, { announcementId: first });
  expect((await s.alice.query(api.announcements.popupQueue, {})).map((a) => a.title)).toEqual([
    "Neu 2",
  ]);
  // Confirming counts as read and as the read receipt.
  const [reads, acks] = await s.t.run(async (ctx) => [
    await ctx.db.query("announcementReads").collect(),
    await ctx.db.query("announcementAcks").collect(),
  ]);
  expect(reads).toHaveLength(1);
  expect(acks).toHaveLength(1);

  // "Alle als gelesen markieren" doesn't skip the pop-up.
  await s.alice.mutation(api.announcements.markAllRead, {});
  expect(await s.alice.query(api.announcements.popupQueue, {})).toHaveLength(1);
});
