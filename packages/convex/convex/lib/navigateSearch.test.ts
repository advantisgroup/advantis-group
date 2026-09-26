/**
 * The wayfinder's lookups: each finds only what the asking person could open
 * themselves, and every hit carries the link that opens it.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedUser(
  t: T,
  clerkUserId: string,
  extra: { firstName?: string; jobTitle?: string } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
      ...extra,
    }),
  );
}

function search(
  t: T,
  clerkUserId: string,
  kind: "tickets" | "people" | "events" | "pages",
  query: string,
) {
  return t.query(api.aiRuns.apiNavigateSearch, { serverKey, clerkUserId, kind, query });
}

async function seedTicket(t: T, userId: Id<"users">, nr: number, topic: string) {
  return t.run((ctx) =>
    ctx.db.insert("itTickets", {
      nr,
      category: "Hardware",
      date: "2026-09-01",
      createdByName: "Test",
      createdByUserId: userId,
      status: "offen",
      topic,
      createdAt: Date.now() + nr,
    }),
  );
}

describe("navigate search", () => {
  test("tickets: only your own, found by what they're about, linked straight to them", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const bob = await seedUser(t, "user_bob");
    const printer = await seedTicket(t, alice, 1, "Drucker druckt nicht");
    await seedTicket(t, alice, 2, "VPN bricht ab");
    await seedTicket(t, bob, 3, "Drucker im 2. Stock");

    const hits = await search(t, "user_alice", "tickets", "drucker");
    expect(hits).toEqual([
      expect.objectContaining({ key: `ticket:${printer}`, href: `/it-tickets?ticket=${printer}` }),
    ]);
    // An empty query is "my tickets", newest first.
    expect((await search(t, "user_alice", "tickets", "")).map((h) => h.title)).toEqual([
      "#2 VPN bricht ab",
      "#1 Drucker druckt nicht",
    ]);
  });

  test("people link to their profile in the directory", async () => {
    const t = setup();
    await seedUser(t, "user_alice");
    const jana = await seedUser(t, "user_jana", { firstName: "Jana", jobTitle: "Buchhaltung" });
    const hits = await search(t, "user_alice", "people", "buchhaltung");
    expect(hits).toEqual([
      expect.objectContaining({ key: `person:${jana}`, href: `/directory?user=${jana}` }),
    ]);
  });

  test("events outside your audience stay hidden", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const bob = await seedUser(t, "user_bob");
    const soon = Date.now() + 86_400_000;
    const event = (title: string, userIds: Id<"users">[]) =>
      t.run((ctx) =>
        ctx.db.insert("events", {
          title,
          start: soon,
          end: soon + 3_600_000,
          allDay: false,
          createdByUserId: bob,
          audience: { kind: "users", userIds },
          createdAt: Date.now(),
        }),
      );
    const mine = await event("Sommerfest", [alice]);
    await event("Sommerfest Planung", [bob]);

    const hits = await search(t, "user_alice", "events", "sommerfest");
    expect(hits.map((h) => h.href)).toEqual([`/calendar?event=${mine}`]);
  });

  test("pages come with their deep links, and hidden pages stay hidden", async () => {
    const t = setup();
    await seedUser(t, "user_alice");
    const hits = await search(t, "user_alice", "pages", "ticket melden");
    expect(hits.map((h) => h.href)).toContain("/it-tickets?new=1");
    expect(await search(t, "user_alice", "pages", "feature flags")).toEqual([]);
  });

  test("the starting context lists pages and your newest tickets by key", async () => {
    const t = setup();
    const alice = await seedUser(t, "user_alice");
    const ticket = await seedTicket(t, alice, 7, "Monitor flackert");
    const context = await t.query(api.aiRuns.apiNavigateContext, {
      serverKey,
      clerkUserId: "user_alice",
    });
    expect(context.hrefByKey["page:/calendar"]).toBe("/calendar");
    expect(context.hrefByKey[`ticket:${ticket}`]).toBe(`/it-tickets?ticket=${ticket}`);
    expect(context.hrefByKey["page:/admin"]).toBeUndefined();
    expect(context.text).toContain("#7 Monitor flackert");
  });
});
