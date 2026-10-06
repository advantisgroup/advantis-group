/**
 * Zeiterfassung end to end: clocking, corrections, absences, the month lock,
 * the 18:00 rule and who may see what.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { berlinInstant } from "./lib/berlin";
import { summarizeDays } from "./lib/days";

const local = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return berlinInstant(date, h * 60 + m);
};
const setNow = (date: string, time: string) => vi.setSystemTime(local(date, time));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Everything below tests the module as it runs after go-live; the
  // "test mode" block switches back.
  vi.stubEnv("TIME_MODE", "live");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"admin" | "alice" | "bob", Id<"users">>;
  for (const [clerkUserId, role, firstName] of [
    ["admin", "admin", "Ada"],
    ["alice", "employee", "Alice"],
    ["bob", "manager", "Bob"],
  ] as const) {
    ids[clerkUserId] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName,
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
    admin: t.withIdentity({ subject: "admin" }),
    alice: t.withIdentity({ subject: "alice" }),
    bob: t.withIdentity({ subject: "bob" }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function notificationsOf(t: Setup["t"], userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

async function audit(t: Setup["t"]) {
  return t.run((ctx) => ctx.db.query("timeAuditLog").collect());
}

async function workedOn(who: Setup["alice"], date: string) {
  const data = await who.query(api.time.entries.range, { from: date, to: date });
  const [day] = summarizeDays({
    from: date,
    to: date,
    segments: data.entries.filter((row) => row.status === "active"),
    schedules: data.schedules,
    holidays: data.holidays,
    absences: data.absences,
    now: Date.now(),
  });
  return day;
}

/** A closed clocked day for alice (08:00–16:30, break 12:00–12:30). */
async function clockedDay(s: Setup, date: string) {
  setNow(date, "08:00");
  await s.alice.mutation(api.time.clock.clockIn, {});
  setNow(date, "12:00");
  await s.alice.mutation(api.time.clock.startBreak, {});
  setNow(date, "12:30");
  await s.alice.mutation(api.time.clock.endBreak, {});
  setNow(date, "16:30");
  await s.alice.mutation(api.time.clock.clockOut, {});
}

describe("clock", () => {
  test("in, pause, out — and the directory sees who's in", async () => {
    const s = await setup();
    setNow("2026-10-05", "08:00");
    await s.alice.mutation(api.time.clock.clockIn, {});
    expect(await s.alice.query(api.time.clock.state, {})).toMatchObject({ status: "working" });
    expect(await s.bob.query(api.time.status.inOffice, {})).toEqual([s.ids.alice]);
    await expect(s.alice.mutation(api.time.clock.clockIn, {})).rejects.toThrow(
      "Already clocked in",
    );

    setNow("2026-10-05", "12:00");
    await s.alice.mutation(api.time.clock.startBreak, {});
    expect(await s.alice.query(api.time.clock.state, {})).toMatchObject({ status: "break" });
    expect(await s.bob.query(api.time.status.inOffice, {})).toEqual([]);

    setNow("2026-10-05", "12:30");
    await s.alice.mutation(api.time.clock.endBreak, {});
    setNow("2026-10-05", "16:30");
    await s.alice.mutation(api.time.clock.clockOut, {});
    expect(await s.alice.query(api.time.clock.state, {})).toMatchObject({ status: "out" });

    const day = await workedOn(s.alice, "2026-10-05");
    expect(day).toMatchObject({ workedMinutes: 480, breakMinutes: 30, targetMinutes: 480 });
    expect(day.warnings).toEqual([]);
    const actions = (await audit(s.t)).map((row) => row.action);
    expect(actions).toEqual(["clockIn", "breakStart", "breakEnd", "clockOut"]);
  });

  test("clock-out ends a running break too; pausing needs a running entry", async () => {
    const s = await setup();
    setNow("2026-10-05", "08:00");
    await expect(s.alice.mutation(api.time.clock.startBreak, {})).rejects.toThrow("Not clocked in");
    await s.alice.mutation(api.time.clock.clockIn, {});
    setNow("2026-10-05", "12:00");
    await s.alice.mutation(api.time.clock.startBreak, {});
    setNow("2026-10-05", "12:45");
    await s.alice.mutation(api.time.clock.clockOut, {});
    const day = await workedOn(s.alice, "2026-10-05");
    expect(day).toMatchObject({ workedMinutes: 240, breakMinutes: 45 });
  });
});

describe("access", () => {
  test("employees see and change only their own time; admins everyone's", async () => {
    const s = await setup();
    await clockedDay(s, "2026-10-05");
    setNow("2026-10-06", "09:00");
    await expect(
      s.bob.query(api.time.entries.range, {
        userId: s.ids.alice,
        from: "2026-10-05",
        to: "2026-10-05",
      }),
    ).rejects.toThrow();
    await expect(
      s.bob.query(api.time.overview.summary, { userId: s.ids.alice, today: "2026-10-06" }),
    ).rejects.toThrow();
    await expect(s.bob.query(api.time.absences.list, { userId: s.ids.alice })).rejects.toThrow();
    const aliceEntries = await s.admin.query(api.time.entries.range, {
      userId: s.ids.alice,
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(aliceEntries.entries).toHaveLength(2);
    const work = aliceEntries.entries.find((row) => row.kind === "work")!;
    await expect(s.bob.mutation(api.time.entries.remove, { entryId: work._id })).rejects.toThrow();
    await expect(
      s.bob.mutation(api.time.entries.save, {
        userId: s.ids.alice,
        kind: "work",
        start: local("2026-10-02", "08:00"),
        end: local("2026-10-02", "12:00"),
      }),
    ).rejects.toThrow();
    // Managers get nothing extra here.
    await expect(s.bob.query(api.time.admin.people, { today: "2026-10-06" })).rejects.toThrow();
    await expect(s.bob.mutation(api.time.holidays.seedYear, { year: 2027 })).rejects.toThrow();
  });
});

describe("corrections", () => {
  test("an employee's change waits; approving applies it and keeps the original", async () => {
    const s = await setup();
    await clockedDay(s, "2026-10-05");
    setNow("2026-10-06", "09:00");
    const { entries } = await s.alice.query(api.time.entries.range, {
      from: "2026-10-05",
      to: "2026-10-05",
    });
    const work = entries.find((row) => row.kind === "work")!;
    const result = await s.alice.mutation(api.time.entries.save, {
      entryId: work._id,
      kind: "work",
      start: local("2026-10-05", "07:30"),
      end: local("2026-10-05", "16:30"),
      reason: "Früher angefangen",
    });
    expect(result.applied).toBe(false);
    expect((await workedOn(s.alice, "2026-10-05")).workedMinutes).toBe(480);
    expect(await notificationsOf(s.t, s.ids.admin)).toHaveLength(1);
    await expect(s.alice.mutation(api.time.entries.remove, { entryId: work._id })).rejects.toThrow(
      "already waiting",
    );

    const { corrections } = await s.admin.query(api.time.admin.approvals, {});
    expect(corrections).toHaveLength(1);
    expect(corrections[0].original?._id).toBe(work._id);
    await s.admin.mutation(api.time.entries.decide, { entryId: result.id, approve: true });

    expect((await workedOn(s.alice, "2026-10-05")).workedMinutes).toBe(510);
    const original = await s.t.run((ctx) => ctx.db.get(work._id));
    expect(original?.status).toBe("deleted");
    const rows = await audit(s.t);
    const approval = rows.find((row) => row.action === "approveCorrection")!;
    expect(approval.actorId).toBe(s.ids.admin);
    expect(approval.before.original.start).toBe(local("2026-10-05", "08:00"));
    expect(approval.after.start).toBe(local("2026-10-05", "07:30"));
    const aliceNotes = await notificationsOf(s.t, s.ids.alice);
    expect(aliceNotes.map((n) => n.type)).toEqual(["time_decision"]);
  });

  test("a rejected request changes nothing; a delete request removes on approval", async () => {
    const s = await setup();
    await clockedDay(s, "2026-10-05");
    setNow("2026-10-06", "09:00");
    const { entries } = await s.alice.query(api.time.entries.range, {
      from: "2026-10-05",
      to: "2026-10-05",
    });
    const pause = entries.find((row) => row.kind === "break")!;
    const added = await s.alice.mutation(api.time.entries.save, {
      kind: "work",
      start: local("2026-10-05", "17:00"),
      end: local("2026-10-05", "18:00"),
    });
    await s.admin.mutation(api.time.entries.decide, { entryId: added.id, approve: false });
    expect((await workedOn(s.alice, "2026-10-05")).workedMinutes).toBe(480);

    await s.alice.mutation(api.time.entries.remove, { entryId: pause._id, reason: "Keine Pause" });
    const pending = await s.alice.query(api.time.entries.pendingFor, {});
    await s.admin.mutation(api.time.entries.decide, { entryId: pending[0]._id, approve: true });
    expect((await workedOn(s.alice, "2026-10-05")).workedMinutes).toBe(510);
  });

  test("admins change entries directly; the running entry can't be edited", async () => {
    const s = await setup();
    setNow("2026-10-05", "08:00");
    const running = await s.alice.mutation(api.time.clock.clockIn, {});
    setNow("2026-10-05", "10:00");
    await expect(s.alice.mutation(api.time.entries.remove, { entryId: running })).rejects.toThrow(
      "running entry",
    );
    const result = await s.admin.mutation(api.time.entries.save, {
      userId: s.ids.alice,
      kind: "work",
      start: local("2026-10-02", "08:00"),
      end: local("2026-10-02", "12:00"),
      reason: "Nachgetragen",
    });
    expect(result.applied).toBe(true);
    expect((await workedOn(s.alice, "2026-10-02")).workedMinutes).toBe(240);
    await expect(
      s.admin.mutation(api.time.entries.save, {
        userId: s.ids.alice,
        kind: "work",
        start: local("2026-10-02", "11:00"),
        end: local("2026-10-02", "13:00"),
      }),
    ).rejects.toThrow("Overlaps");
    await expect(
      s.alice.mutation(api.time.entries.save, {
        kind: "work",
        start: local("2026-10-05", "11:00"),
        end: local("2026-10-05", "13:00"),
      }),
    ).rejects.toThrow("future");
  });
});

describe("month lock", () => {
  test("from the 15th nobody changes last month; an admin unlocks with a reason", async () => {
    const s = await setup();
    setNow("2026-10-14", "23:59");
    const before = await s.alice.mutation(api.time.entries.save, {
      kind: "work",
      start: local("2026-09-30", "08:00"),
      end: local("2026-09-30", "16:00"),
    });
    expect(before.applied).toBe(false);

    setNow("2026-10-15", "00:00");
    const septemberEntry = {
      kind: "work" as const,
      start: local("2026-09-29", "08:00"),
      end: local("2026-09-29", "16:00"),
    };
    await expect(s.alice.mutation(api.time.entries.save, septemberEntry)).rejects.toThrow("locked");
    await expect(
      s.admin.mutation(api.time.entries.save, { ...septemberEntry, userId: s.ids.alice }),
    ).rejects.toThrow("locked");
    await expect(
      s.admin.mutation(api.time.entries.decide, { entryId: before.id, approve: true }),
    ).rejects.toThrow("locked");
    await expect(
      s.alice.mutation(api.time.absences.request, {
        type: "sick",
        startDate: "2026-09-28",
        endDate: "2026-09-28",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).rejects.toThrow("locked");
    await expect(
      s.admin.mutation(api.time.locks.unlock, { month: "2026-09", reason: " " }),
    ).rejects.toThrow();

    await s.admin.mutation(api.time.locks.unlock, {
      month: "2026-09",
      reason: "Nachtrag Krankheit",
    });
    const applied = await s.admin.mutation(api.time.entries.save, {
      ...septemberEntry,
      userId: s.ids.alice,
    });
    expect(applied.applied).toBe(true);
    setNow("2026-10-15", "09:00");
    await s.admin.mutation(api.time.locks.lock, { month: "2026-09" });
    await expect(s.alice.mutation(api.time.entries.save, septemberEntry)).rejects.toThrow("locked");
    const actions = (await audit(s.t)).map((row) => row.action);
    expect(actions).toContain("unlock");
    expect(actions).toContain("lock");
  });

  test("the hourly job locks the month once the 15th has begun", async () => {
    const s = await setup();
    setNow("2026-10-14", "23:05");
    await s.t.mutation(internal.time.jobs.lockAndSeed, {});
    const locksBefore = await s.t.run((ctx) => ctx.db.query("monthLocks").collect());
    expect(locksBefore.map((row) => row.month)).toEqual(["2026-08"]);
    setNow("2026-10-15", "00:05");
    await s.t.mutation(internal.time.jobs.lockAndSeed, {});
    await s.t.mutation(internal.time.jobs.lockAndSeed, {});
    const locks = await s.t.run((ctx) => ctx.db.query("monthLocks").collect());
    expect(locks.map((row) => row.month)).toEqual(["2026-08", "2026-09"]);
    const months = await s.admin.query(api.time.locks.list, {});
    expect(months.find((row) => row.month === "2026-09")?.locked).toBe(true);
    expect(months.find((row) => row.month === "2026-10")?.locked).toBe(false);
    // The same job seeded this year's holidays.
    const holidays = await s.alice.query(api.time.holidays.list, { year: 2026 });
    expect(holidays).toHaveLength(15);
  });
});

describe("absences", () => {
  test("sick days are approved at once and admins are told", async () => {
    const s = await setup();
    setNow("2026-10-06", "07:30");
    await s.alice.mutation(api.time.absences.request, {
      type: "sick",
      startDate: "2026-10-06",
      endDate: "2026-10-07",
      halfDayStart: false,
      halfDayEnd: false,
    });
    const [sick] = await s.alice.query(api.time.absences.list, {});
    expect(sick).toMatchObject({ status: "approved", days: 2 });
    const notes = await notificationsOf(s.t, s.ids.admin);
    expect(notes.map((n) => n.title)).toEqual(["Krankmeldung eingetragen"]);
    expect((await workedOn(s.alice, "2026-10-06")).targetMinutes).toBe(0);
  });

  test("vacation waits for an admin, who decides; the person hears back", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    const id = await s.alice.mutation(api.time.absences.request, {
      type: "vacation",
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      halfDayStart: false,
      halfDayEnd: true,
    });
    const summary = await s.alice.query(api.time.overview.summary, { today: "2026-10-06" });
    expect(summary.vacation).toMatchObject({ pending: 4.5, taken: 0, remaining: 24 });
    await expect(
      s.alice.mutation(api.time.absences.decide, { id, approve: true }),
    ).rejects.toThrow();
    await expect(
      s.alice.mutation(api.time.absences.request, {
        type: "special",
        startDate: "2026-10-16",
        endDate: "2026-10-16",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).rejects.toThrow("Overlaps");
    await s.admin.mutation(api.time.absences.decide, { id, approve: true });
    const after = await s.alice.query(api.time.overview.summary, { today: "2026-10-06" });
    expect(after.vacation).toMatchObject({ pending: 0, taken: 4.5, remaining: 19.5 });
    const notes = await notificationsOf(s.t, s.ids.alice);
    expect(notes.map((n) => n.title)).toEqual(["Urlaub genehmigt"]);
    const actions = (await audit(s.t)).map((row) => row.action);
    expect(actions).toEqual(["request", "approve"]);
  });

  test("employees cancel only pending requests", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    const id = await s.alice.mutation(api.time.absences.request, {
      type: "vacation",
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      halfDayStart: false,
      halfDayEnd: false,
    });
    await expect(s.bob.mutation(api.time.absences.cancel, { id })).rejects.toThrow();
    await s.admin.mutation(api.time.absences.decide, { id, approve: true });
    await expect(s.alice.mutation(api.time.absences.cancel, { id })).rejects.toThrow();
    await s.admin.mutation(api.time.absences.cancel, { id, reason: "Rückgängig" });
    const [row] = await s.alice.query(api.time.absences.list, {});
    expect(row.status).toBe("cancelled");
  });

  test("the team calendar shows others' vacation only", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    for (const type of ["vacation", "sick"] as const) {
      await s.bob.mutation(api.time.absences.request, {
        type,
        startDate: type === "vacation" ? "2026-10-19" : "2026-10-07",
        endDate: type === "vacation" ? "2026-10-20" : "2026-10-07",
        halfDayStart: false,
        halfDayEnd: false,
      });
    }
    const vacation = (await s.bob.query(api.time.absences.list, {})).find(
      (row) => row.type === "vacation",
    )!;
    await s.admin.mutation(api.time.absences.decide, { id: vacation._id, approve: true });
    const forAlice = await s.alice.query(api.time.absences.calendar, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(forAlice.absences.map((row) => row.type)).toEqual(["vacation"]);
    const forBob = await s.bob.query(api.time.absences.calendar, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(forBob.absences.map((row) => row.type).sort()).toEqual(["sick", "vacation"]);
  });
});

describe("18:00 rule", () => {
  test("open entries close at first start + regular hours, flagged and notified", async () => {
    const s = await setup();
    setNow("2026-10-05", "08:15");
    const id = await s.alice.mutation(api.time.clock.clockIn, {});
    setNow("2026-10-05", "17:00");
    expect(await s.t.mutation(internal.time.jobs.autoCloseOpenEntries, {})).toBe(0);

    setNow("2026-10-05", "18:00");
    expect(await s.t.mutation(internal.time.jobs.autoCloseOpenEntries, {})).toBe(1);
    const entry = await s.t.run((ctx) => ctx.db.get(id));
    expect(entry).toMatchObject({
      end: local("2026-10-05", "16:15"),
      autoClosed: true,
      source: "auto18",
    });
    expect(await s.t.mutation(internal.time.jobs.autoCloseOpenEntries, {})).toBe(0);
    const notes = await notificationsOf(s.t, s.ids.alice);
    expect(notes.map((n) => n.type)).toEqual(["time_auto_closed"]);
    const people = await s.admin.query(api.time.admin.people, { today: "2026-10-05" });
    expect(people.find((row) => row.userId === s.ids.alice)?.autoClosed).toBe(1);
  });

  test("earlier segments count; a part-time schedule and winter time are respected", async () => {
    const s = await setup();
    await s.admin.mutation(api.time.admin.setSchedule, {
      userId: s.ids.alice,
      validFrom: "2026-11-01",
      minutesPerWeekday: [360, 360, 360, 360, 360, 0, 0],
    });
    setNow("2026-12-01", "08:00");
    await s.alice.mutation(api.time.clock.clockIn, {});
    setNow("2026-12-01", "10:00");
    await s.alice.mutation(api.time.clock.clockOut, {});
    setNow("2026-12-01", "13:00");
    const id = await s.alice.mutation(api.time.clock.clockIn, {});
    setNow("2026-12-01", "18:00");
    await s.t.mutation(internal.time.jobs.autoCloseOpenEntries, {});
    const entry = await s.t.run((ctx) => ctx.db.get(id));
    expect(entry?.end).toBe(local("2026-12-01", "17:00"));
    expect(new Date(entry!.end!).toISOString()).toBe("2026-12-01T16:00:00.000Z");
  });
});

describe("hours account and settings", () => {
  test("opening balance plus worked minus target through yesterday", async () => {
    const s = await setup();
    await s.admin.mutation(api.time.admin.setOpeningBalance, {
      userId: s.ids.alice,
      openingMinutes: 600,
      openingDate: "2026-10-05",
    });
    await clockedDay(s, "2026-10-05");
    setNow("2026-10-06", "07:00");
    // Monday 480 worked vs 480 target.
    const monday = await s.alice.query(api.time.overview.summary, { today: "2026-10-06" });
    expect(monday.balance).toMatchObject({ minutes: 600, since: "2026-10-05" });
    setNow("2026-10-07", "07:00");
    // Tuesday nothing worked: -480.
    const tuesday = await s.alice.query(api.time.overview.summary, { today: "2026-10-07" });
    expect(tuesday.balance.minutes).toBe(120);
  });

  test("cached month totals are used and dropped when something changes", async () => {
    const s = await setup();
    await s.admin.mutation(api.time.admin.setOpeningBalance, {
      userId: s.ids.alice,
      openingMinutes: 0,
      openingDate: "2026-09-01",
    });
    await clockedDay(s, "2026-09-01");
    setNow("2026-10-15", "00:05");
    await s.t.mutation(internal.time.jobs.refreshMonthTotals, { month: "2026-09" });
    const cached = await s.t.run((ctx) => ctx.db.query("timeMonthTotals").collect());
    const sept = cached.find((row) => row.userId === s.ids.alice)!;
    // September 2026 has 22 working days.
    expect(sept).toMatchObject({ workedMinutes: 480, targetMinutes: 22 * 480 });
    await s.admin.mutation(api.time.locks.unlock, { month: "2026-09", reason: "Test" });
    await s.admin.mutation(api.time.entries.save, {
      userId: s.ids.alice,
      kind: "work",
      start: local("2026-09-02", "08:00"),
      end: local("2026-09-02", "12:00"),
    });
    const after = await s.t.run((ctx) =>
      ctx.db
        .query("timeMonthTotals")
        .withIndex("by_user_month", (q) => q.eq("userId", s.ids.alice).eq("month", "2026-09"))
        .unique(),
    );
    expect(after).toBeNull();
  });

  test("holidays are seeded once per year and only by admins", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    expect(await s.admin.mutation(api.time.holidays.seedYear, { year: 2027 })).toBe(15);
    expect(await s.admin.mutation(api.time.holidays.seedYear, { year: 2027 })).toBe(0);
    await expect(s.alice.mutation(api.time.holidays.seedYear, { year: 2028 })).rejects.toThrow();
    const list = await s.alice.query(api.time.holidays.list, { year: 2027 });
    expect(list.find((row) => row.date === "2027-12-24")?.fraction).toBe(0.5);
  });

  test("carried-over vacation opens the year and lapses after 31 March", async () => {
    const s = await setup();
    setNow("2026-12-20", "09:00");
    await s.admin.mutation(api.time.admin.setAllowance, {
      userId: s.ids.alice,
      year: 2026,
      days: 24,
      carriedOver: 0,
    });
    await s.admin.mutation(api.time.absences.request, {
      userId: s.ids.alice,
      type: "vacation",
      startDate: "2026-12-21",
      endDate: "2026-12-23",
      halfDayStart: false,
      halfDayEnd: false,
    });
    setNow("2027-01-01", "00:10");
    await s.t.mutation(internal.time.jobs.vacationYear, {});
    await s.t.mutation(internal.time.jobs.vacationYear, {});
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("vacationAllowances")
        .withIndex("by_year", (q) => q.eq("year", 2027))
        .collect(),
    );
    expect(rows.find((row) => row.userId === s.ids.alice)).toMatchObject({
      days: 24,
      carriedOver: 21,
      carriedOverExpires: "2027-03-31",
    });
    expect(rows).toHaveLength(3);

    setNow("2027-04-01", "00:10");
    await s.t.mutation(internal.time.jobs.vacationYear, {});
    const expired = await s.t.run((ctx) =>
      ctx.db
        .query("vacationAllowances")
        .withIndex("by_user_year", (q) => q.eq("userId", s.ids.alice).eq("year", 2027))
        .unique(),
    );
    expect(expired?.carriedOverExpiredDays).toBe(21);
    const summary = await s.alice.query(api.time.overview.summary, { today: "2027-04-01" });
    expect(summary.vacation).toMatchObject({ remaining: 24, carriedOverExpired: 21 });
  });
});

describe("test mode", () => {
  beforeEach(() => {
    vi.stubEnv("TIME_MODE", "");
    vi.stubEnv("TIME_TESTERS", "Alice@advantisgroup.de, bob@advantisgroup.de");
  });

  test("admins and testers get in, nobody else", async () => {
    const s = await setup();
    expect(await s.admin.query(api.time.mode.status, {})).toMatchObject({
      testMode: true,
      canUse: true,
    });
    expect(await s.alice.query(api.time.mode.status, {})).toMatchObject({
      testMode: true,
      canUse: true,
    });
    vi.stubEnv("TIME_TESTERS", "");
    expect(await s.alice.query(api.time.mode.status, {})).toMatchObject({
      testMode: true,
      canUse: false,
    });
    await expect(s.alice.query(api.time.overview.summary, { today: "2026-10-05" })).rejects.toThrow(
      /Testmodus/,
    );
    await expect(s.alice.mutation(api.time.clock.clockIn, {})).rejects.toThrow(/Testmodus/);
  });

  test("notifications reach admins and testers; nobody shows as in the office", async () => {
    const s = await setup();
    setNow("2026-10-05", "09:00");
    await s.alice.mutation(api.time.clock.clockIn, {});
    expect(await s.admin.query(api.time.status.inOffice, {})).toEqual([]);
    await s.alice.mutation(api.time.absences.request, {
      type: "sick",
      startDate: "2026-10-06",
      endDate: "2026-10-06",
      halfDayStart: false,
      halfDayEnd: false,
    });
    expect((await notificationsOf(s.t, s.ids.admin)).length).toBeGreaterThan(0);
    expect((await notificationsOf(s.t, s.ids.bob)).length).toBeGreaterThan(0);
  });

  test("testers wipe the test data; holidays stay; refused after go-live", async () => {
    const s = await setup();
    setNow("2026-10-05", "09:00");
    await s.alice.mutation(api.time.clock.clockIn, {});
    await s.t.run((ctx) =>
      ctx.db.insert("holidays", {
        date: "2026-12-25",
        name: "1. Weihnachtstag",
        fraction: 1,
        region: "BY",
        updatedAt: Date.now(),
      }),
    );
    let done = false;
    while (!done) {
      ({ done } = await s.alice.mutation(api.time.mode.purgeTestData, {
        confirm: "TESTDATEN LÖSCHEN",
      }));
    }
    const left = await s.t.run(async (ctx) => ({
      entries: (await ctx.db.query("timeEntries").collect()).length,
      audit: (await ctx.db.query("timeAuditLog").collect()).length,
      holidays: (await ctx.db.query("holidays").collect()).length,
    }));
    expect(left).toEqual({ entries: 0, audit: 0, holidays: 1 });

    vi.stubEnv("TIME_MODE", "live");
    await expect(
      s.alice.mutation(api.time.mode.purgeTestData, { confirm: "TESTDATEN LÖSCHEN" }),
    ).rejects.toThrow(/Testmodus/);
  });
});

describe("preview", () => {
  beforeEach(() => {
    vi.stubEnv("TIME_MODE", "preview");
    vi.stubEnv("TIME_LIVE_FROM", "2026-10-12");
    vi.stubEnv("TIME_TESTERS", "");
  });

  test("everyone looks, nobody clocks, only admins change things", async () => {
    const s = await setup();
    expect(await s.alice.query(api.time.mode.status, {})).toMatchObject({
      testMode: false,
      preview: true,
      liveFrom: "2026-10-12",
      canUse: true,
      canWrite: false,
      canClock: false,
    });
    expect(await s.admin.query(api.time.mode.status, {})).toMatchObject({
      canUse: true,
      canWrite: true,
      canClock: false,
    });

    setNow("2026-10-07", "09:00");
    await s.alice.query(api.time.overview.summary, { today: "2026-10-07" });
    await s.alice.query(api.time.entries.range, { from: "2026-10-05", to: "2026-10-11" });
    await expect(s.alice.mutation(api.time.clock.clockIn, {})).rejects.toThrow(/Vorschau/);
    await expect(s.admin.mutation(api.time.clock.clockIn, {})).rejects.toThrow(/Vorschau/);
    await expect(
      s.alice.mutation(api.time.absences.request, {
        type: "vacation",
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).rejects.toThrow(/Vorschau/);

    // Admins still fix imported data directly.
    await s.admin.mutation(api.time.entries.save, {
      userId: s.ids.alice,
      kind: "work",
      start: local("2026-10-06", "08:00"),
      end: local("2026-10-06", "16:00"),
    });
    expect((await workedOn(s.alice, "2026-10-06")).workedMinutes).toBe(480);
  });

  test("the hours account stays at the imported balance", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("workSchedules", {
        userId: s.ids.alice,
        validFrom: "2026-01-01",
        minutesPerWeekday: [480, 480, 480, 480, 480, 0, 0],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBalances", {
        userId: s.ids.alice,
        openingMinutes: 600,
        openingDate: "2026-10-06",
        updatedAt: Date.now(),
      });
    });
    setNow("2026-10-09", "10:00");
    const summary = await s.alice.query(api.time.overview.summary, { today: "2026-10-09" });
    expect(summary.balance.minutes).toBe(600);

    // An admin enters the 6th (9 h on an 8 h day): counted up to that day.
    await s.admin.mutation(api.time.entries.save, {
      userId: s.ids.alice,
      kind: "work",
      start: local("2026-10-06", "08:00"),
      end: local("2026-10-06", "17:00"),
    });
    const entered = await s.alice.query(api.time.overview.summary, { today: "2026-10-09" });
    expect(entered.balance.minutes).toBe(600 + 60);
    vi.stubEnv("TIME_MODE", "live");
    const live = await s.alice.query(api.time.overview.summary, { today: "2026-10-09" });
    expect(live.balance.minutes).toBeLessThan(600);
  });

  test("the test data wipe is refused", async () => {
    const s = await setup();
    await expect(
      s.admin.mutation(api.time.mode.purgeTestData, { confirm: "TESTDATEN LÖSCHEN" }),
    ).rejects.toThrow(/Testmodus/);
  });
});

describe("Clockodo import", () => {
  test("applies a person, imports history once and updates on re-run", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    const opening = { minutes: 356, date: "2026-10-06" };
    const person = {
      userId: s.ids.alice,
      clockodoId: 364581,
      schedules: [{ validFrom: "2024-10-17", minutesPerWeekday: [360, 360, 360, 360, 360, 0, 0] }],
      allowance: { year: 2026, days: 24, carriedOver: 0 },
      opening,
    };
    await s.admin.mutation(api.time.importClockodo.applyPerson, person);
    await expect(s.alice.mutation(api.time.importClockodo.applyPerson, person)).rejects.toThrow();

    const entries = [
      {
        importId: "clockodo:entry:1",
        start: local("2025-03-03", "08:00"),
        end: local("2025-03-03", "14:00"),
      },
      {
        importId: "clockodo:entry:2",
        start: local("2026-10-05", "08:22"),
        end: local("2026-10-05", "14:29"),
      },
    ];
    expect(
      await s.admin.mutation(api.time.importClockodo.importEntries, {
        userId: s.ids.alice,
        entries,
      }),
    ).toEqual({ inserted: 2, updated: 0 });
    const again = [{ ...entries[0] }, { ...entries[1], end: local("2026-10-05", "14:45") }];
    expect(
      await s.admin.mutation(api.time.importClockodo.importEntries, {
        userId: s.ids.alice,
        entries: again,
      }),
    ).toEqual({ inserted: 0, updated: 1 });

    const absences = [
      {
        importId: "clockodo:absence:9",
        type: "overtime" as const,
        status: "approved" as const,
        startDate: "2026-10-07",
        endDate: "2026-10-07",
        halfDayStart: false,
        halfDayEnd: false,
      },
    ];
    expect(
      await s.admin.mutation(api.time.importClockodo.importAbsences, {
        userId: s.ids.alice,
        absences,
      }),
    ).toEqual({ inserted: 1, updated: 0 });
    expect(
      await s.admin.mutation(api.time.importClockodo.importAbsences, {
        userId: s.ids.alice,
        absences,
      }),
    ).toEqual({ inserted: 0, updated: 0 });

    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("timeEntries")
        .withIndex("by_user_start", (q) => q.eq("userId", s.ids.alice))
        .collect(),
    );
    expect(rows.map((row) => row.source)).toEqual(["import", "import"]);

    // The account starts from Clockodo's balance on the export day: the
    // imported history before it does not count twice.
    setNow("2026-10-07", "09:00");
    const summary = await s.alice.query(api.time.overview.summary, { today: "2026-10-07" });
    expect(summary.balance.minutes).toBe(356 - 360);
    const user = await s.t.run((ctx) => ctx.db.get(s.ids.alice));
    expect(user?.clockodoUserId).toBe("364581");
  });
});

describe("time tracking off for a person", () => {
  test("no clocking, flagged in the overview, switch is audited", async () => {
    const s = await setup();
    setNow("2026-10-06", "09:00");
    expect((await s.bob.query(api.time.mode.status, {})).tracking).toBe(true);
    await expect(
      s.bob.mutation(api.time.admin.setTracking, { userId: s.ids.bob, disabled: true }),
    ).rejects.toThrow();
    await s.admin.mutation(api.time.admin.setTracking, { userId: s.ids.bob, disabled: true });
    expect((await s.bob.query(api.time.mode.status, {})).tracking).toBe(false);
    await expect(s.bob.mutation(api.time.clock.clockIn, {})).rejects.toThrow(/tracking/i);
    const people = await s.admin.query(api.time.admin.people, { today: "2026-10-06" });
    expect(people.find((row) => row.userId === s.ids.bob)?.trackingDisabled).toBe(true);
    expect(people.find((row) => row.userId === s.ids.alice)?.trackingDisabled).toBe(false);
    expect((await audit(s.t)).some((row) => row.action === "tracking_off")).toBe(true);

    await s.admin.mutation(api.time.admin.setTracking, { userId: s.ids.bob, disabled: false });
    await s.bob.mutation(api.time.clock.clockIn, {});
  });
});
