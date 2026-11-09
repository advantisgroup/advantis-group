import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const MON = "2026-11-09";
const TUE = "2026-11-10";
const WED = "2026-11-11";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"ada" | "ben" | "cem" | "boss", Id<"users">>;
  for (const [key, role, email] of [
    ["ada", "admin", "ada@advantisgroup.de"],
    ["ben", "employee", "ben@advantisgroup.de"],
    ["cem", "employee", "cem@advantisgroup.de"],
    ["boss", "admin", "boss@salespirates.de"],
  ] as const) {
    ids[key] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: key,
        email,
        firstName: key,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  return {
    t,
    ids,
    ada: t.withIdentity({ subject: "ada" }),
    ben: t.withIdentity({ subject: "ben" }),
    cem: t.withIdentity({ subject: "cem" }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function plan({ ada, ids }: Setup) {
  return ada.mutation(api.kitchen.savePlan, {
    from: MON,
    to: WED,
    memberIds: [ids.ben, ids.cem],
    days: [
      { date: MON, userId: ids.ben },
      { date: TUE, userId: ids.cem },
    ],
  });
}

async function ownerOf(s: Setup, date: string) {
  const rows = await s.ada.query(api.kitchen.forRange, { from: date, to: date });
  return rows[0]?.userId ?? null;
}

describe("planning", () => {
  test("defaults to company addresses, then remembers the choice", async () => {
    const s = await setup();
    const selected = async () =>
      (await s.ada.query(api.kitchen.planOptions, {})).filter((p) => p.selected).map((p) => p.name);
    expect(await selected()).toEqual(["ada", "ben", "cem"]);
    await plan(s);
    expect(await selected()).toEqual(["ben", "cem"]);
  });

  test("only admins plan", async () => {
    const s = await setup();
    await expect(
      s.ben.mutation(api.kitchen.savePlan, {
        from: MON,
        to: MON,
        memberIds: [s.ids.ben],
        days: [],
      }),
    ).rejects.toThrow();
  });

  test("leaves out people on vacation and half days", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("timeAbsences", {
        userId: s.ids.ben,
        type: "vacation",
        startDate: MON,
        endDate: MON,
        halfDayStart: false,
        halfDayEnd: false,
        status: "approved",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("workSchedules", {
        userId: s.ids.cem,
        validFrom: "2026-01-01",
        minutesPerWeekday: [480, 240, 480, 480, 480, 0, 0],
        updatedAt: Date.now(),
      });
    });
    const days = await s.ada.query(api.kitchen.preview, {
      from: MON,
      to: TUE,
      memberIds: [s.ids.ben, s.ids.cem],
    });
    expect(days.map((d) => d.userId)).toEqual([s.ids.cem, s.ids.ben]);
  });

  test("tells people, and the reminder finds its person", async () => {
    const s = await setup();
    await plan(s);
    expect(await s.ben.query(api.kitchen.myDay, { date: MON })).toBe(true);
    expect(await s.cem.query(api.kitchen.myDay, { date: MON })).toBe(false);
    const notes = await s.t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", s.ids.ben))
        .collect(),
    );
    expect(notes.map((n) => n.type)).toEqual(["kitchen_duty"]);
  });
});

describe("swapping", () => {
  test("nothing moves before the colleague accepts; then both days trade", async () => {
    const s = await setup();
    await plan(s);
    const id = await s.ben.mutation(api.kitchen.requestSwap, {
      date: MON,
      toUserId: s.ids.cem,
      otherDate: TUE,
    });
    expect(await ownerOf(s, MON)).toBe(s.ids.ben);
    await s.cem.mutation(api.kitchen.answerSwap, { id, accept: true });
    expect(await ownerOf(s, MON)).toBe(s.ids.cem);
    expect(await ownerOf(s, TUE)).toBe(s.ids.ben);
  });

  test("declining changes nothing", async () => {
    const s = await setup();
    await plan(s);
    const id = await s.ben.mutation(api.kitchen.requestSwap, { date: MON, toUserId: s.ids.cem });
    await s.cem.mutation(api.kitchen.answerSwap, { id, accept: false });
    expect(await ownerOf(s, MON)).toBe(s.ids.ben);
  });

  test("only your own day, only the person asked answers", async () => {
    const s = await setup();
    await plan(s);
    await expect(
      s.cem.mutation(api.kitchen.requestSwap, { date: MON, toUserId: s.ids.ben }),
    ).rejects.toThrow();
    const id = await s.ben.mutation(api.kitchen.requestSwap, { date: MON, toUserId: s.ids.cem });
    await expect(s.ada.mutation(api.kitchen.answerSwap, { id, accept: true })).rejects.toThrow();
  });

  test("an admin change voids the open request", async () => {
    const s = await setup();
    await plan(s);
    const id = await s.ben.mutation(api.kitchen.requestSwap, { date: MON, toUserId: s.ids.cem });
    await s.ada.mutation(api.kitchen.setDay, { date: MON, userId: s.ids.ada });
    await expect(s.cem.mutation(api.kitchen.answerSwap, { id, accept: true })).rejects.toThrow();
    expect(await ownerOf(s, MON)).toBe(s.ids.ada);
  });
});
