import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = process.env.CONVEX_SERVER_KEY!;

async function setup() {
  const t = convexTest(schema, modules);
  const ids: Record<string, string> = {};
  for (const [key, role] of [
    ["ada", "admin"],
    ["mia", "manager"],
    ["ben", "employee"],
  ] as const) {
    ids[key] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: key,
        email: `${key}@advantisgroup.de`,
        firstName: key,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  const now = Date.now();
  const entryId = await t.run((ctx) =>
    ctx.db.insert("wikiEntries", {
      slug: "tankkarte",
      thema: "Tankkarte",
      erklaerung: "<p>Basic kostet 0,95 €.</p>",
      tags: ["uta"],
      validFrom: now - 1000,
      validUntil: now + 86_400_000,
      version: 1,
      pinned: false,
      authorUserId: ids.ada as never,
      authorName: "ada",
      createdAt: now,
      updatedAt: now,
    }),
  );
  return {
    t,
    ids,
    entryId,
    ada: t.withIdentity({ subject: "ada" }),
    mia: t.withIdentity({ subject: "mia" }),
    ben: t.withIdentity({ subject: "ben" }),
  };
}

describe("KI-Pflege", () => {
  test("only admins and the people they pick may train — managers don't by rank", async () => {
    const { ada, mia, ben, ids } = await setup();
    expect(await ada.query(api.aiTraining.access.me, {})).toEqual({ trainer: true, admin: true });
    expect((await mia.query(api.aiTraining.access.me, {})).trainer).toBe(false);
    await expect(mia.query(api.aiTraining.gaps.list, { status: "open" })).rejects.toThrow();
    await expect(
      mia.mutation(api.aiTraining.access.setTrainer, { userId: ids.ben as never, trainer: true }),
    ).rejects.toThrow();

    await ada.mutation(api.aiTraining.access.setTrainer, {
      userId: ids.ben as never,
      trainer: true,
    });
    expect((await ben.query(api.aiTraining.access.me, {})).trainer).toBe(true);
    expect(await ben.query(api.aiTraining.gaps.list, { status: "open" })).toEqual([]);
    const log = await ben.query(api.aiTraining.access.activity, {});
    expect(log[0]).toMatchObject({ action: "trainer_granted", target: "ben" });
  });

  test("the assistant knows the whole wiki and the built-in briefing", async () => {
    const { t } = await setup();
    const knowledge = await t.query(api.aiTraining.access.apiKnowledge, {
      serverKey,
      clerkUserId: "ben",
    });
    expect(knowledge.entries).toHaveLength(1);
    expect(knowledge.entries[0]).toMatchObject({
      title: "Tankkarte",
      text: "Basic kostet 0,95 €.",
    });
    expect(knowledge.rules.map((r) => r.id)).toEqual([null]);
  });

  test("reported questions are counted, not repeated, and never name the asker", async () => {
    const { t, ada, ben } = await setup();
    await ben.mutation(api.aiTraining.gaps.report, { question: "Was kostet Premium?" });
    await t.mutation(api.aiTraining.gaps.apiReport, {
      serverKey,
      clerkUserId: "ben",
      question: "was kostet premium",
    });
    const gaps = await ada.query(api.aiTraining.gaps.list, { status: "open" });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ count: 2, createdByName: null });
  });

  test("a proposal changes the wiki only when applied, and answers its gap", async () => {
    const { t, ada, entryId } = await setup();
    await ada.mutation(api.aiTraining.gaps.add, { question: "Was kostet Basic?" });
    const [gap] = await ada.query(api.aiTraining.gaps.list, { status: "open" });
    const sessionId = await ada.mutation(api.aiTraining.sessions.create, { gapId: gap._id });
    const added = await t.mutation(api.aiTraining.sessions.apiAddProposal, {
      serverKey,
      clerkUserId: "ada",
      sessionId,
      kind: "wiki_update",
      entryId,
      title: "Tankkarte",
      body: "<p>Basic kostet 0,95 €/Karte/Monat (Tarifliste 04/2026).</p>",
      tags: ["uta"],
      reason: "Einheit ergänzt",
    });
    expect(added.ok).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(entryId)))?.version).toBe(1);

    const [proposal] = await ada.query(api.aiTraining.proposals.bySession, { sessionId });
    await ada.mutation(api.aiTraining.proposals.apply, {
      proposalId: proposal._id,
      title: proposal.title,
      body: proposal.body,
      tags: proposal.tags,
      reservedSlugs: [],
    });
    const entry = await t.run((ctx) => ctx.db.get(entryId));
    expect(entry).toMatchObject({ version: 2, erklaerung: proposal.body });
    expect(await ada.query(api.aiTraining.gaps.list, { status: "open" })).toEqual([]);
    expect(await ada.query(api.aiTraining.gaps.list, { status: "answered" })).toHaveLength(1);
  });

  test("changing the briefing turns it into a rule row", async () => {
    const { t, ada } = await setup();
    await ada.mutation(api.aiTraining.rules.save, {
      ruleId: "builtin",
      title: "Grundwissen",
      text: "Cards: -660",
      active: true,
    });
    const knowledge = await t.query(api.aiTraining.access.apiKnowledge, {
      serverKey,
      clerkUserId: "ada",
    });
    expect(knowledge.rules).toHaveLength(1);
    expect(knowledge.rules[0]).toMatchObject({ title: "Grundwissen", text: "Cards: -660" });
  });

  test("a new entry from a proposal gets a free slug", async () => {
    const { t, ada } = await setup();
    const sessionId = await ada.mutation(api.aiTraining.sessions.create, {});
    await t.mutation(api.aiTraining.sessions.apiAddProposal, {
      serverKey,
      clerkUserId: "ada",
      sessionId,
      kind: "wiki_new",
      title: "Tankkarte",
      body: "<p>Neu</p>",
      tags: [],
      reason: "neu",
    });
    const [proposal] = await ada.query(api.aiTraining.proposals.bySession, { sessionId });
    const { href } = await ada.mutation(api.aiTraining.proposals.apply, {
      proposalId: proposal._id,
      title: "Tankkarte",
      body: "<p>Neu</p>",
      tags: [],
      reservedSlugs: ["tankkarte-2"],
    });
    expect(href).toBe("/guidebooks/tankkarte-3");
  });
});
