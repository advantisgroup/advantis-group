import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const ACADEMY = "wallbox-sales";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedAdmin(t: T, clerkUserId = "admin"): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedResult(t: T, data: unknown): Promise<Id<"academyResults">> {
  const participantId = await t.run(async (ctx) =>
    ctx.db.insert("academyParticipants", {
      academyId: ACADEMY,
      name: "Teilnehmer",
      email: "teilnehmer@example.com",
      code: "K7M2QX",
      createdAt: Date.now(),
    }),
  );
  return await t.run(async (ctx) =>
    ctx.db.insert("academyResults", {
      participantId,
      academyId: ACADEMY,
      data: JSON.stringify(data),
      updatedAt: Date.now(),
    }),
  );
}

async function readResult(t: T, id: Id<"academyResults">) {
  const row = await t.run(async (ctx) => ctx.db.get(id));
  return JSON.parse(row!.data) as {
    chapters: Record<string, { answers?: Record<string, number> }>;
  };
}

const SEED = {
  academyId: ACADEMY,
  pin: "1234",
  segments: [{ key: "markt", label: "Markt & Grundlagen" }],
  chapters: [
    {
      chapterId: "c1",
      title: "Der EV-Markt",
      segment: "markt",
      body: "[]",
      quiz: [
        { question: "Erste Frage?", options: ["A", "B", "C"], correctIndex: 1 },
        { question: "Zweite Frage?", options: ["A", "B"], correctIndex: 0 },
      ],
    },
  ],
};

describe("academy content migration", () => {
  test("copies the seeded content in and reports what it wrote", async () => {
    const t = setup();
    await seedAdmin(t);

    const result = await t
      .withIdentity({ subject: "admin" })
      .mutation(api.academy.content.migrate, SEED);

    expect(result.alreadyDone).toBe(false);
    expect(result.chapterCount).toBe(1);
    expect(result.questionCount).toBe(2);

    const content = await t.query(api.academy.content.list, { academyId: ACADEMY });
    expect(content.migrated).toBe(true);
    expect(content.chapters).toHaveLength(1);
    expect(content.chapters[0].quiz.map((q) => q.questionId)).toEqual(["c1-q1", "c1-q2"]);
  });

  test("rewrites stored answers from array indices onto question ids", async () => {
    const t = setup();
    await seedAdmin(t);
    // "picked option 1 on the first question, option 0 on the second"
    const resultId = await seedResult(t, {
      chapters: { c1: { answers: { "0": 1, "1": 0 }, correct: 2, total: 2 } },
      research: {},
      calls: {},
    });

    const outcome = await t
      .withIdentity({ subject: "admin" })
      .mutation(api.academy.content.migrate, SEED);
    expect(outcome.rewrittenResults).toBe(1);

    const stored = await readResult(t, resultId);
    expect(stored.chapters.c1.answers).toEqual({ "c1-q1": 1, "c1-q2": 0 });
  });

  test("leaves chapters it has no content for untouched", async () => {
    const t = setup();
    await seedAdmin(t);
    const resultId = await seedResult(t, {
      chapters: { cX: { answers: { "0": 2 } } },
      research: {},
      calls: {},
    });

    await t.withIdentity({ subject: "admin" }).mutation(api.academy.content.migrate, SEED);

    const stored = await readResult(t, resultId);
    expect(stored.chapters.cX.answers).toEqual({ "0": 2 });
  });

  test("refuses a second run rather than duplicating the content", async () => {
    const t = setup();
    await seedAdmin(t);
    const admin = t.withIdentity({ subject: "admin" });

    await admin.mutation(api.academy.content.migrate, SEED);
    const second = await admin.mutation(api.academy.content.migrate, SEED);

    expect(second.alreadyDone).toBe(true);
    const content = await t.query(api.academy.content.list, { academyId: ACADEMY });
    expect(content.chapters).toHaveLength(1);
    expect(content.chapters[0].quiz).toHaveLength(2);
  });
});

describe("academy question editing", () => {
  test("a new question never reuses a retired question's id", async () => {
    const t = setup();
    await seedAdmin(t);
    const admin = t.withIdentity({ subject: "admin" });
    await admin.mutation(api.academy.content.migrate, SEED);

    await admin.mutation(api.academy.content.archiveQuestion, {
      academyId: ACADEMY,
      pin: "1234",
      questionId: "c1-q2",
    });
    const newId = await admin.mutation(api.academy.content.saveQuestion, {
      academyId: ACADEMY,
      pin: "1234",
      chapterId: "c1",
      question: "Dritte Frage?",
      options: ["A", "B"],
      correctIndex: 1,
    });

    expect(newId).not.toBe("c1-q2");
    const content = await t.query(api.academy.content.list, { academyId: ACADEMY });
    // The retired one is gone from what participants see, but its row (and so
    // any answer pointing at it) still exists.
    expect(content.chapters[0].quiz.map((q) => q.questionId)).toEqual(["c1-q1", newId]);
  });

  test("a question with fewer than two answers is rejected", async () => {
    const t = setup();
    await seedAdmin(t);
    const admin = t.withIdentity({ subject: "admin" });
    await admin.mutation(api.academy.content.migrate, SEED);

    const saved = await admin.mutation(api.academy.content.saveQuestion, {
      academyId: ACADEMY,
      pin: "1234",
      chapterId: "c1",
      question: "Unvollständig?",
      options: ["Nur eine", "  "],
      correctIndex: 0,
    });

    expect(saved).toBeNull();
  });
});
