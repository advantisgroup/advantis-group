/**
 * ⌘K's server search: each group only holds what the searching person can
 * open — their own tickets and chats, updates meant for them, the blog only
 * for its editors.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const user = (clerkUserId: string, role: "employee" | "manager") =>
    t.run((ctx) =>
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
  const alice = await user("alice", "employee");
  const bob = await user("bob", "employee");
  const manager = await user("manager", "manager");
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const [owner, nr] of [
      [alice, 1],
      [bob, 2],
    ] as const) {
      await ctx.db.insert("itTickets", {
        nr,
        category: "Hardware",
        date: "2026-09-01",
        createdByName: "x",
        createdByUserId: owner,
        status: "offen",
        topic: "Drucker streikt",
        createdAt: now,
      });
    }
    await ctx.db.insert("updates", {
      type: "incident",
      title: "Drucker im 2. Stock gestört",
      summary: "Wir arbeiten dran",
      bodyFormat: "markdown",
      body: "",
      authorUserId: manager,
      audience: { kind: "all" },
      revision: 1,
      emailRequested: false,
      source: "ui",
      publishedAt: now,
      startedAt: now,
      createdAt: now,
    });
    // Scheduled for next week: not visible to anyone but its author yet.
    await ctx.db.insert("updates", {
      type: "maintenance",
      title: "Drucker-Wartung geplant",
      summary: "Noch geheim",
      bodyFormat: "markdown",
      body: "",
      authorUserId: manager,
      audience: { kind: "all" },
      revision: 1,
      emailRequested: false,
      source: "ui",
      publishedAt: now + 7 * 24 * 60 * 60 * 1000,
      startedAt: now,
      createdAt: now,
    });
    await ctx.db.insert("blogPosts", {
      slug: "drucker",
      language: "de",
      title: "Drucker im Wandel",
      excerpt: "Warum Drucker bleiben",
      body: "",
      authorUserId: manager,
      authorName: "Manager",
      status: "published",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const chat = async (members: Id<"users">[], body: string) => {
      const conversationId = await ctx.db.insert("conversations", {
        type: "group",
        name: "Team",
        createdByUserId: members[0],
        lastMessageAt: now,
        createdAt: now,
      });
      for (const userId of members) {
        await ctx.db.insert("conversationMembers", {
          conversationId,
          userId,
          lastReadAt: now,
          joinedAt: now,
        });
      }
      await ctx.db.insert("messages", {
        conversationId,
        senderUserId: members[0],
        body,
        attachments: [],
        linkPreviews: [],
        createdAt: now,
      });
    };
    await chat([alice, manager], "Der Drucker ist wieder leer");
    await chat([bob], "Drucker-Geheimnis von Bob");
  });
  return t;
}

describe("palette search", () => {
  test("finds each kind, limited to what the person may open", async () => {
    const t = await setup();
    const res = await t
      .withIdentity({ subject: "alice" })
      .query(api.org.search.everything, { query: "drucker" });
    expect(res.tickets.map((h) => h.title)).toEqual(["#1 Drucker streikt"]);
    expect(res.updates.map((h) => h.title)).toEqual(["Drucker im 2. Stock gestört"]);
    expect(res.blog).toEqual([]);
    expect(res.chat.map((h) => h.title)).toEqual(["Der Drucker ist wieder leer"]);
  });

  test("the blog shows up for those who manage it", async () => {
    const t = await setup();
    const res = await t
      .withIdentity({ subject: "manager" })
      .query(api.org.search.everything, { query: "drucker" });
    expect(res.blog.map((h) => h.title)).toEqual(["Drucker im Wandel"]);
  });

  test("short queries return nothing", async () => {
    const t = await setup();
    const res = await t
      .withIdentity({ subject: "alice" })
      .query(api.org.search.everything, { query: "dr" });
    expect(Object.values(res).every((group) => group.length === 0)).toBe(true);
  });
});
