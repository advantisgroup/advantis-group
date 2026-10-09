/** Fixed hours booked automatically for people who don't clock. */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { autoBookMinutes } from "./lib/autoBook";
import { berlinInstant } from "./lib/berlin";
import { summarizeDays } from "./lib/days";

const local = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return berlinInstant(date, h * 60 + m);
};
const setNow = (date: string, time: string) => vi.setSystemTime(local(date, time));
const SETTINGS = { from: "2026-09-01", start: "08:00", breakMinutes: 30 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("TIME_MODE", "live");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"admin" | "chefin", Id<"users">>;
  for (const [clerkUserId, role] of [
    ["admin", "admin"],
    ["chefin", "admin"],
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
  // 7 h Monday to Friday, and switched off like the managing director was.
  await t.run(async (ctx) => {
    await ctx.db.insert("workSchedules", {
      userId: ids.chefin,
      validFrom: "2026-07-01",
      minutesPerWeekday: [420, 420, 420, 420, 420, 0, 0],
      updatedAt: Date.now(),
    });
    await ctx.db.insert("timeProfiles", {
      userId: ids.chefin,
      trackingDisabled: true,
      updatedAt: Date.now(),
    });
  });
  return {
    t,
    ids,
    admin: t.withIdentity({ subject: "admin" }),
    chefin: t.withIdentity({ subject: "chefin" }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function day(s: Setup, date: string) {
  const data = await s.chefin.query(api.time.entries.range, { from: date, to: date });
  const [summary] = summarizeDays({
    from: date,
    to: date,
    segments: data.entries.filter((row) => row.status === "active"),
    schedules: data.schedules,
    holidays: data.holidays,
    absences: data.absences,
    now: Date.now(),
  });
  return summary;
}

async function vacation(s: Setup, startDate: string, endDate: string) {
  await s.t.run((ctx) =>
    ctx.db.insert("timeAbsences", {
      userId: s.ids.chefin,
      type: "vacation",
      startDate,
      endDate,
      halfDayStart: false,
      halfDayEnd: false,
      status: "approved",
      updatedAt: Date.now(),
    }),
  );
}

describe("fixed hours", () => {
  test("a day's segments: from the start, target long, break at noon over six hours", () => {
    expect(autoBookMinutes(420, SETTINGS)).toEqual([
      { kind: "work", from: 480, to: 930 },
      { kind: "break", from: 720, to: 750 },
    ]);
    expect(autoBookMinutes(210, SETTINGS)).toEqual([{ kind: "work", from: 480, to: 690 }]);
    expect(autoBookMinutes(0, SETTINGS)).toEqual([]);
  });

  test("switching it on books every working day since the date, without clocking", async () => {
    const s = await setup();
    await vacation(s, "2026-09-10", "2026-09-11");
    setNow("2026-09-16", "10:00");
    const result = await s.admin.mutation(api.time.autoBook.setAutoBook, {
      userId: s.ids.chefin,
      settings: SETTINGS,
    });
    // 1–15 Sept: 11 working days, two of them vacation → 9 days × 2 segments.
    expect(result.inserted).toBe(18);

    expect(await day(s, "2026-09-01")).toMatchObject({ workedMinutes: 420, breakMinutes: 30 });
    expect((await day(s, "2026-09-01")).warnings).toEqual([]);
    expect((await day(s, "2026-09-05")).workedMinutes).toBe(0);
    expect((await day(s, "2026-09-10")).workedMinutes).toBe(0);
    // Today only once the day is over.
    expect((await day(s, "2026-09-16")).workedMinutes).toBe(0);

    const status = await s.chefin.query(api.time.mode.status, {});
    expect(status).toMatchObject({ tracking: true, autoBook: SETTINGS });
    await expect(s.chefin.mutation(api.time.clock.clockIn, {})).rejects.toThrow();

    setNow("2026-09-16", "16:15");
    await s.t.mutation(internal.time.autoBook.bookFixedHours, {});
    expect((await day(s, "2026-09-16")).workedMinutes).toBe(420);

    // Running again changes nothing.
    await s.t.mutation(internal.time.autoBook.bookFixedHours, {});
    const rows = await s.t.run((ctx) => ctx.db.query("timeEntries").collect());
    expect(rows.filter((row) => row.status === "active")).toHaveLength(20);
  });

  test("a vacation approved afterwards takes the booked day out again", async () => {
    const s = await setup();
    setNow("2026-09-16", "16:15");
    await s.admin.mutation(api.time.autoBook.setAutoBook, {
      userId: s.ids.chefin,
      settings: SETTINGS,
    });
    expect((await day(s, "2026-09-15")).workedMinutes).toBe(420);
    await vacation(s, "2026-09-15", "2026-09-15");
    await s.t.mutation(internal.time.autoBook.bookFixedHours, {});
    expect((await day(s, "2026-09-15")).workedMinutes).toBe(0);

    // Off again: what was booked stays, nothing new comes.
    await s.admin.mutation(api.time.autoBook.setAutoBook, {
      userId: s.ids.chefin,
      settings: null,
    });
    setNow("2026-09-17", "16:15");
    await s.t.mutation(internal.time.autoBook.bookFixedHours, {});
    expect((await day(s, "2026-09-17")).workedMinutes).toBe(0);
    expect((await day(s, "2026-09-16")).workedMinutes).toBe(420);
  });
});
