import { describe, expect, test } from "vitest";

import { autoCloseCutoff, autoCloseEnd } from "./autoClose";
import {
  addDays,
  berlinDate,
  berlinInstant,
  berlinOffsetMinutes,
  berlinParts,
  isIsoDate,
  monthsBetween,
  weekdayOf,
} from "./berlin";
import {
  absenceFractionOn,
  absenceWorkingDays,
  measureDay,
  summarizeDays,
  type SegmentLike,
  totals,
} from "./days";
import { bavarianHolidays, easterSunday } from "./holidays";
import { isMonthLocked, latestLockableMonth, lockBoundary } from "./lock";
import { DEFAULT_MINUTES_PER_WEEKDAY, regularMinutesOn, scheduleOn } from "./schedule";
import { carryOverFrom, vacationSummary } from "./vacation";

const at = (iso: string) => Date.parse(iso);
/** Berlin wall-clock time on a date, e.g. local("2026-10-05", "08:00"). */
const local = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return berlinInstant(date, h * 60 + m);
};
const work = (date: string, from: string, to: string | null): SegmentLike => ({
  kind: "work",
  start: local(date, from),
  end: to === null ? null : local(date, to),
});
const pause = (date: string, from: string, to: string): SegmentLike => ({
  kind: "break",
  start: local(date, from),
  end: local(date, to),
});
const holidays2026 = bavarianHolidays(2026);
const day = (
  date: string,
  segments: SegmentLike[],
  extra: Partial<Parameters<typeof summarizeDays>[0]> = {},
) =>
  summarizeDays({
    from: date,
    to: date,
    segments,
    schedules: [],
    holidays: holidays2026,
    absences: [],
    now: at("2030-01-01T00:00:00Z"),
    ...extra,
  })[0];

describe("Europe/Berlin calendar", () => {
  test("offset switches on the last Sundays of March and October at 01:00 UTC", () => {
    expect(berlinOffsetMinutes(at("2026-03-29T00:59:59Z"))).toBe(60);
    expect(berlinOffsetMinutes(at("2026-03-29T01:00:00Z"))).toBe(120);
    expect(berlinOffsetMinutes(at("2026-10-25T00:59:59Z"))).toBe(120);
    expect(berlinOffsetMinutes(at("2026-10-25T01:00:00Z"))).toBe(60);
  });

  test("DST days are 23 and 25 hours long", () => {
    expect(berlinInstant("2026-03-30") - berlinInstant("2026-03-29")).toBe(23 * 3_600_000);
    expect(berlinInstant("2026-10-26") - berlinInstant("2026-10-25")).toBe(25 * 3_600_000);
    expect(berlinInstant("2026-10-06") - berlinInstant("2026-10-05")).toBe(24 * 3_600_000);
  });

  test("wall-clock times resolve correctly around the switches", () => {
    expect(new Date(berlinInstant("2026-03-29", 0)).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // 02:30 doesn't exist on the spring day: it's 03:30 CEST.
    expect(new Date(local("2026-03-29", "02:30")).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 02:30 happens twice in autumn: the first (CEST) one wins.
    expect(new Date(local("2026-10-25", "02:30")).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(new Date(local("2026-07-01", "08:00")).toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(new Date(local("2026-12-01", "08:00")).toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });

  test("instants map to the Berlin date, not the UTC one", () => {
    expect(berlinDate(at("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(berlinDate(at("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(berlinDate(at("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(berlinParts(at("2026-10-05T16:00:00Z"))).toMatchObject({ hour: 18, weekday: 0 });
  });

  test("date helpers", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(weekdayOf("2026-10-05")).toBe(0);
    expect(weekdayOf("2026-10-11")).toBe(6);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(monthsBetween("2026-11-20", "2027-01-03")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("holidays", () => {
  test("Easter dates", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  test("Bavaria (Nürnberg) plus the company rules", () => {
    const list = bavarianHolidays(2026);
    const byDate = new Map(list.map((h) => [h.date, h]));
    expect(list).toHaveLength(14);
    for (const date of [
      "2026-01-01",
      "2026-01-06",
      "2026-04-03",
      "2026-04-06",
      "2026-05-01",
      "2026-05-14",
      "2026-05-25",
      "2026-06-04",
      "2026-10-03",
      "2026-11-01",
      "2026-12-25",
      "2026-12-26",
    ]) {
      expect(byDate.get(date)?.fraction).toBe(1);
    }
    expect(byDate.get("2026-12-24")?.fraction).toBe(0.5);
    expect(byDate.get("2026-12-31")?.fraction).toBe(0.5);
    // Not a holiday in Nürnberg (only in Catholic-majority municipalities).
    expect(byDate.has("2026-08-15")).toBe(false);
    // Not public holidays in Bavaria.
    expect(byDate.has("2026-11-18")).toBe(false);
    expect(byDate.has("2026-10-31")).toBe(false);
    expect(byDate.has("2026-04-05")).toBe(false);
  });
});

describe("schedules", () => {
  test("default is 8 h Monday to Friday", () => {
    expect(regularMinutesOn([], "2026-10-05")).toBe(480);
    expect(regularMinutesOn([], "2026-10-10")).toBe(0);
    expect(scheduleOn([], "2026-10-05")).toBe(DEFAULT_MINUTES_PER_WEEKDAY);
  });

  test("the latest validFrom on or before the date wins", () => {
    const schedules = [
      { validFrom: "2026-01-01", minutesPerWeekday: [480, 480, 480, 480, 480, 0, 0] },
      { validFrom: "2026-10-07", minutesPerWeekday: [240, 240, 240, 240, 240, 0, 0] },
    ];
    expect(regularMinutesOn(schedules, "2026-10-06")).toBe(480);
    expect(regularMinutesOn(schedules, "2026-10-07")).toBe(240);
    expect(regularMinutesOn(schedules, "2025-12-31")).toBe(480);
  });
});

describe("worked time", () => {
  test("work minus breaks, with a regular day producing no warnings", () => {
    const result = day("2026-10-05", [
      work("2026-10-05", "08:00", "16:30"),
      pause("2026-10-05", "12:00", "12:30"),
    ]);
    expect(result).toMatchObject({
      targetMinutes: 480,
      workedMinutes: 480,
      breakMinutes: 30,
      warnings: [],
    });
  });

  test("worked time is real elapsed time across the DST switch", () => {
    // 01:30 CET to 04:30 CEST is only two hours.
    const measured = measureDay(
      [{ kind: "work", start: at("2026-03-29T00:30:00Z"), end: at("2026-03-29T02:30:00Z") }],
      0,
    );
    expect(measured.workedMs).toBe(2 * 3_600_000);
    const autumn = measureDay(
      [{ kind: "work", start: local("2026-10-25", "00:00"), end: local("2026-10-25", "06:00") }],
      0,
    );
    expect(autumn.workedMs).toBe(7 * 3_600_000);
  });

  test("a segment belongs to the Berlin date it starts on", () => {
    const late = {
      kind: "work" as const,
      start: local("2026-07-01", "23:00"),
      end: local("2026-07-02", "00:30"),
    };
    const [first, second] = summarizeDays({
      from: "2026-07-01",
      to: "2026-07-02",
      segments: [late],
      schedules: [],
      holidays: [],
      absences: [],
      now: 0,
    });
    expect(first.workedMinutes).toBe(90);
    expect(second.workedMinutes).toBe(0);
  });

  test("an open entry counts up to now", () => {
    const now = local("2026-10-05", "10:15");
    const result = day("2026-10-05", [work("2026-10-05", "08:00", null)], { now });
    expect(result.workedMinutes).toBe(135);
    expect(result.open).toBe(true);
  });

  test("a gap between segments counts as a break", () => {
    expect(
      day("2026-10-05", [
        work("2026-10-05", "08:00", "12:00"),
        work("2026-10-05", "12:30", "16:30"),
      ]),
    ).toMatchObject({ workedMinutes: 480, breakMinutes: 30, warnings: [] });
    expect(
      day("2026-10-05", [
        work("2026-10-05", "08:00", "12:00"),
        work("2026-10-05", "12:10", "16:30"),
      ]),
    ).toMatchObject({ breakMinutes: 10, warnings: ["break30"] });
  });

  test("short breaks add up, also for the break hint", () => {
    const result = day("2026-10-05", [
      work("2026-10-05", "08:00", "17:00"),
      pause("2026-10-05", "10:00", "10:05"),
      pause("2026-10-05", "12:00", "12:29"),
      pause("2026-10-05", "15:00", "15:08"),
    ]);
    expect(result).toMatchObject({
      workedMinutes: 540 - 42,
      breakMinutes: 42,
      warnings: [],
    });
  });
});

describe("ArbZG warnings", () => {
  test("over 6 h needs 30 minutes, flagged from 6:15", () => {
    expect(day("2026-10-05", [work("2026-10-05", "08:00", "15:00")]).warnings).toEqual(["break30"]);
    expect(day("2026-10-05", [work("2026-10-05", "08:00", "14:16")]).warnings).toEqual(["break30"]);
    expect(day("2026-10-05", [work("2026-10-05", "08:00", "14:15")]).warnings).toEqual([]);
    expect(day("2026-10-05", [work("2026-10-05", "08:00", "14:00")]).warnings).toEqual([]);
  });

  test("over 9 h needs 45 minutes", () => {
    const result = day("2026-10-05", [
      work("2026-10-05", "07:00", "17:00"),
      pause("2026-10-05", "12:00", "12:30"),
    ]);
    expect(result.workedMinutes).toBe(570);
    expect(result.warnings).toEqual(["break45"]);
  });

  test("over 10 h of work", () => {
    const result = day("2026-10-05", [
      work("2026-10-05", "06:00", "17:15"),
      pause("2026-10-05", "12:00", "12:45"),
    ]);
    expect(result.workedMinutes).toBe(630);
    expect(result.warnings).toEqual(["over10h"]);
  });

  test("less than 11 h rest since the previous day", () => {
    const [, tuesday] = summarizeDays({
      from: "2026-10-05",
      to: "2026-10-06",
      segments: [work("2026-10-05", "13:00", "22:00"), work("2026-10-06", "07:00", "12:00")],
      schedules: [],
      holidays: [],
      absences: [],
      now: 0,
    });
    expect(tuesday.warnings).toEqual(["rest11h"]);
  });

  test("the day before `from` feeds the rest check", () => {
    const [tuesday] = summarizeDays({
      from: "2026-10-06",
      to: "2026-10-06",
      segments: [work("2026-10-05", "13:00", "22:00"), work("2026-10-06", "09:00", "12:00")],
      schedules: [],
      holidays: [],
      absences: [],
      now: 0,
    });
    expect(tuesday.warnings).toEqual([]);
  });
});

describe("target hours", () => {
  const vacation = (
    startDate: string,
    endDate: string,
    halfDayStart = false,
    halfDayEnd = false,
  ) => ({
    type: "vacation",
    startDate,
    endDate,
    halfDayStart,
    halfDayEnd,
  });

  test("half days on the first and last day", () => {
    const absence = vacation("2026-10-05", "2026-10-07", true, true);
    expect(absenceFractionOn(absence, "2026-10-05")).toBe(0.5);
    expect(absenceFractionOn(absence, "2026-10-06")).toBe(1);
    expect(absenceFractionOn(absence, "2026-10-07")).toBe(0.5);
    expect(absenceFractionOn(vacation("2026-10-05", "2026-10-05", false, true), "2026-10-05")).toBe(
      0.5,
    );
    const days = summarizeDays({
      from: "2026-10-05",
      to: "2026-10-07",
      segments: [],
      schedules: [],
      holidays: [],
      absences: [absence],
      now: 0,
    });
    expect(days.map((d) => d.targetMinutes)).toEqual([240, 0, 240]);
    expect(absenceWorkingDays(absence, [], [])).toBe(2);
  });

  test("holidays reduce target hours; half holidays by half", () => {
    expect(day("2026-10-03", []).targetMinutes).toBe(0); // Saturday anyway
    expect(day("2026-06-04", []).targetMinutes).toBe(0); // Fronleichnam, Thursday
    expect(day("2026-12-24", []).targetMinutes).toBe(240);
    expect(day("2026-12-31", []).targetMinutes).toBe(240);
    expect(day("2026-08-14", []).targetMinutes).toBe(480);
  });

  test("a holiday on a weekend changes nothing and uses no vacation", () => {
    // Allerheiligen 2026 is a Sunday.
    expect(absenceWorkingDays(vacation("2026-10-30", "2026-11-02"), [], holidays2026)).toBe(2);
  });

  test("vacation over Christmas only counts what the holidays leave", () => {
    expect(absenceWorkingDays(vacation("2026-12-21", "2026-12-31"), [], holidays2026)).toBe(7);
    const days = summarizeDays({
      from: "2026-12-24",
      to: "2026-12-24",
      segments: [],
      schedules: [],
      holidays: holidays2026,
      absences: [vacation("2026-12-24", "2026-12-24")],
      now: 0,
    });
    expect(days[0].targetMinutes).toBe(0);
  });

  test("part-time schedules", () => {
    const schedules = [{ validFrom: "2026-01-01", minutesPerWeekday: [300, 300, 300, 0, 0, 0, 0] }];
    const week = summarizeDays({
      from: "2026-10-05",
      to: "2026-10-11",
      segments: [work("2026-10-05", "08:00", "13:30")],
      schedules,
      holidays: [],
      absences: [],
      now: 0,
    });
    expect(totals(week)).toEqual({ workedMinutes: 330, targetMinutes: 900, balanceMinutes: -570 });
    expect(absenceWorkingDays(vacation("2026-10-05", "2026-10-11"), schedules, [])).toBe(3);
  });
});

describe("vacation account", () => {
  const approved = (startDate: string, endDate: string) => ({
    type: "vacation",
    status: "approved",
    startDate,
    endDate,
    halfDayStart: false,
    halfDayEnd: false,
  });
  const allowance = { days: 24, carriedOver: 5, carriedOverExpires: "2027-03-31" };
  const holidays2027 = bavarianHolidays(2027);

  test("24 days by default", () => {
    const summary = vacationSummary({
      year: 2026,
      allowance: null,
      absences: [{ ...approved("2026-10-05", "2026-10-06"), halfDayStart: true }],
      schedules: [],
      holidays: holidays2026,
      asOf: "2026-10-05",
    });
    expect(summary).toMatchObject({ entitlement: 24, taken: 1.5, remaining: 22.5 });
  });

  test("carried-over days are used first and expire after 31 March", () => {
    const absences = [approved("2027-03-01", "2027-03-03")];
    const before = vacationSummary({
      year: 2027,
      allowance,
      absences,
      schedules: [],
      holidays: holidays2027,
      asOf: "2027-03-31",
    });
    expect(before).toMatchObject({
      taken: 3,
      carriedOverLeft: 2,
      carriedOverExpired: 0,
      remaining: 26,
    });
    const after = vacationSummary({
      year: 2027,
      allowance,
      absences,
      schedules: [],
      holidays: holidays2027,
      asOf: "2027-04-01",
    });
    expect(after).toMatchObject({ carriedOverLeft: 0, carriedOverExpired: 2, remaining: 24 });
  });

  test("vacation after the expiry date doesn't save carried-over days", () => {
    const summary = vacationSummary({
      year: 2027,
      allowance,
      absences: [approved("2027-04-05", "2027-04-09")],
      schedules: [],
      holidays: holidays2027,
      asOf: "2027-05-01",
    });
    expect(summary).toMatchObject({ taken: 5, carriedOverExpired: 5, remaining: 19 });
  });

  test("pending requests are shown apart; other years and types are ignored", () => {
    const summary = vacationSummary({
      year: 2026,
      allowance: null,
      absences: [
        { ...approved("2026-11-02", "2026-11-03"), status: "pending" },
        { ...approved("2026-11-04", "2026-11-04"), type: "sick" },
        { ...approved("2026-12-30", "2027-01-05") },
        { ...approved("2026-11-09", "2026-11-09"), status: "rejected" },
      ],
      schedules: [],
      holidays: holidays2026,
      asOf: "2026-10-05",
    });
    // 30.12. full + 31.12. half
    expect(summary).toMatchObject({
      taken: 1.5,
      pending: 2,
      remaining: 22.5,
      remainingAfterPending: 20.5,
    });
  });

  test("what's left moves into the next year, never a negative number", () => {
    const summary = vacationSummary({
      year: 2026,
      allowance: { days: 2, carriedOver: 0, carriedOverExpires: "2026-03-31" },
      absences: [approved("2026-10-05", "2026-10-09")],
      schedules: [],
      holidays: holidays2026,
      asOf: "2026-12-31",
    });
    expect(summary.remaining).toBe(-3);
    expect(carryOverFrom(summary)).toBe(0);
  });
});

describe("month lock", () => {
  test("locks on the 15th of the following month at 00:00 Berlin", () => {
    expect(new Date(lockBoundary("2026-09")).toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(new Date(lockBoundary("2026-12")).toISOString()).toBe("2027-01-14T23:00:00.000Z");
    const boundary = lockBoundary("2026-09");
    expect(isMonthLocked("2026-09", boundary - 1)).toBe(false);
    expect(isMonthLocked("2026-09", boundary)).toBe(true);
    expect(isMonthLocked("2026-10", boundary)).toBe(false);
  });

  test("an admin unlock wins until it is locked again", () => {
    const boundary = lockBoundary("2026-09");
    expect(
      isMonthLocked("2026-09", boundary + 10, { lockedAt: boundary, unlockedAt: boundary + 5 }),
    ).toBe(false);
    expect(
      isMonthLocked("2026-09", boundary + 10, { lockedAt: boundary + 8, unlockedAt: boundary + 5 }),
    ).toBe(true);
    expect(isMonthLocked("2026-10", boundary, { lockedAt: boundary - 1 })).toBe(true);
  });

  test("the newest lockable month", () => {
    expect(latestLockableMonth(local("2026-10-14", "23:59"))).toBe("2026-08");
    expect(latestLockableMonth(local("2026-10-15", "00:00"))).toBe("2026-09");
    expect(latestLockableMonth(local("2027-01-20", "12:00"))).toBe("2026-12");
  });
});

describe("18:00 rule", () => {
  test("cutoff is the next 18:00 Berlin, summer and winter", () => {
    expect(new Date(autoCloseCutoff(local("2026-10-05", "08:00"))).toISOString()).toBe(
      "2026-10-05T16:00:00.000Z",
    );
    expect(new Date(autoCloseCutoff(local("2026-12-01", "08:00"))).toISOString()).toBe(
      "2026-12-01T17:00:00.000Z",
    );
    expect(autoCloseCutoff(local("2026-10-05", "19:00"))).toBe(local("2026-10-06", "18:00"));
    expect(autoCloseCutoff(local("2026-10-05", "18:00"))).toBe(local("2026-10-06", "18:00"));
  });

  const close = (start: string, extra: Partial<Parameters<typeof autoCloseEnd>[0]> = {}) =>
    autoCloseEnd({
      start: local("2026-10-05", start),
      cutoff: local("2026-10-05", "18:00"),
      regularMinutes: 480,
      earlierWorkedMinutes: 0,
      breakMinutesInside: 0,
      ...extra,
    });

  test("first start plus the regular hours", () => {
    expect(close("08:00")).toBe(local("2026-10-05", "16:00"));
  });

  test("less what earlier segments booked, plus breaks taken", () => {
    expect(close("13:00", { earlierWorkedMinutes: 240 })).toBe(local("2026-10-05", "17:00"));
    expect(close("08:00", { breakMinutesInside: 30 })).toBe(local("2026-10-05", "16:30"));
  });

  test("never past 18:00 and never before the start", () => {
    expect(close("11:00")).toBe(local("2026-10-05", "18:00"));
    expect(close("09:00", { regularMinutes: 0 })).toBe(local("2026-10-05", "09:00"));
    expect(close("09:00", { earlierWorkedMinutes: 600 })).toBe(local("2026-10-05", "09:00"));
  });
});
