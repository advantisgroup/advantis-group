import { describe, expect, test } from "vitest";

import { type ClockodoExport, matchIntranetUser, planClockodoImport } from "./clockodo";
import { targetMinutesOn } from "./days";

const week = (h: number, fri = h) => ({
  type: "weekly",
  monday: h,
  tuesday: h,
  wednesday: h,
  thursday: h,
  friday: fri,
  saturday: 0,
  sunday: 0,
});

const sample: ClockodoExport = {
  exportedAt: "2026-10-06T08:30:00Z",
  users: [
    { id: 1, name: "Doreen Boateng", email: "doreen@x.de", active: true },
    { id: 2, name: "Vahan.HOVHANNISYAN", email: "vahan@x.de", active: true },
  ],
  targethours: {
    "1": [
      { ...week(6), date_since: "2024-10-28", date_until: "2025-06-02" },
      { ...week(8, 6), date_since: "2025-06-03", date_until: null },
    ],
    "2": [{ ...week(7), date_since: "2026-04-01", date_until: "2026-06-30" }],
  },
  userReports: {
    "2026": [
      { users_id: 1, report_data: { balance: 21374, holidays_quota: 24, holidays_carry: 2 } },
      { users_id: 2, report_data: { balance: -763200, holidays_quota: 8, holidays_carry: 0 } },
    ],
  },
  absences: [
    {
      id: 10,
      users_id: 1,
      date_since: "2026-01-02",
      date_until: "2026-01-05",
      type: 3,
      status: 1,
      note: null,
      count_days: 2,
      count_hours: 12,
    },
    {
      id: 11,
      users_id: 1,
      date_since: "2026-03-04",
      date_until: "2026-03-04",
      type: 1,
      status: 1,
      note: "Arzt",
      count_days: 0.5,
    },
    {
      id: 12,
      users_id: 1,
      date_since: "2026-04-01",
      date_until: "2026-04-03",
      type: 13,
      status: 4,
      note: null,
      count_days: 2.5,
    },
  ],
  entries: [
    {
      id: 100,
      users_id: 1,
      type: 1,
      time_since: "2026-10-05T06:22:52Z",
      time_until: "2026-10-05T12:29:54Z",
      text: null,
    },
    {
      id: 101,
      users_id: 1,
      type: 1,
      time_since: "2026-10-06T06:20:56Z",
      time_until: null,
      text: null,
    },
  ],
};

describe("planClockodoImport", () => {
  const plan = planClockodoImport(sample);
  const doreen = plan.people[0];
  const vahan = plan.people[1];

  test("export date, schedules and the year's numbers", () => {
    expect(plan.exportDate).toBe("2026-10-06");
    expect(doreen.schedules).toEqual([
      { validFrom: "2024-10-28", minutesPerWeekday: [360, 360, 360, 360, 360, 0, 0] },
      { validFrom: "2025-06-03", minutesPerWeekday: [480, 480, 480, 480, 360, 0, 0] },
    ]);
    expect(doreen.allowance).toEqual({ year: 2026, days: 24, carriedOver: 2 });
    expect(doreen.balanceMinutes).toBe(356);
  });

  test("a model that just ends leaves no target afterwards", () => {
    expect(vahan.schedules.at(-1)).toEqual({
      validFrom: "2026-07-01",
      minutesPerWeekday: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(vahan.name).toBe("Vahan HOVHANNISYAN");
  });

  test("closed entries only; running ones are reported", () => {
    expect(doreen.entries).toEqual([
      {
        importId: "clockodo:entry:100",
        start: Date.parse("2026-10-05T06:22:52Z"),
        end: Date.parse("2026-10-05T12:29:54Z"),
        note: undefined,
      },
    ]);
    expect(doreen.lastEntryDate).toBe("2026-10-05");
    expect(doreen.warnings).toContain("1 laufende Stempelung nicht übernommen");
  });

  test("absence types, statuses and half days", () => {
    expect(doreen.absences).toEqual([
      expect.objectContaining({ type: "overtime", status: "approved", note: "12 h" }),
      expect.objectContaining({
        type: "vacation",
        halfDayStart: true,
        halfDayEnd: false,
        note: "Arzt",
      }),
      expect.objectContaining({
        type: "other",
        status: "cancelled",
        halfDayEnd: true,
        note: "Clockodo-Abwesenheitsart 13",
      }),
    ]);
  });

  test("someone who never clocks is flagged", () => {
    expect(vahan.warnings.join()).toMatch(/Stempelt nicht/);
  });
});

describe("matchIntranetUser", () => {
  const users = [
    {
      userId: "a",
      name: "Vahan Hovhannisyan",
      email: "hovhannisyan@advantisgroup.de",
      clockodoUserId: null,
    },
    {
      userId: "b",
      name: "Michael Eysselein",
      email: "eysselein@advantisgroup.de",
      clockodoUserId: "469933",
    },
    { userId: "c", name: "Doreen Boateng", email: "doreen@x.de", clockodoUserId: null },
  ];
  test("stored id, then e-mail, then name", () => {
    expect(
      matchIntranetUser({ clockodoId: 469933, name: "Micheal Eyßelein", email: "?" }, users)
        ?.userId,
    ).toBe("b");
    expect(
      matchIntranetUser({ clockodoId: 1, name: "X", email: "DOREEN@x.de" }, users)?.userId,
    ).toBe("c");
    expect(
      matchIntranetUser({ clockodoId: 2, name: "Vahan HOVHANNISYAN", email: "v@e.com" }, users)
        ?.userId,
    ).toBe("a");
    expect(
      matchIntranetUser({ clockodoId: 3, name: "Hilde Weber", email: "h@e.com" }, users),
    ).toBeNull();
  });
});

test("Überstundenabbau keeps the day's target", () => {
  const schedules = [
    { validFrom: "2026-01-01", minutesPerWeekday: [480, 480, 480, 480, 480, 0, 0] },
  ];
  const day = (type: string) =>
    targetMinutesOn("2026-10-05", schedules, null, [
      {
        type,
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        halfDayStart: false,
        halfDayEnd: false,
      },
    ]).target;
  expect(day("overtime")).toBe(480);
  expect(day("vacation")).toBe(0);
});
