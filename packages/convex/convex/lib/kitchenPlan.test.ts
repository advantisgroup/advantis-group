import { describe, expect, test } from "vitest";

import { canDoKitchen, type KitchenPerson, proposeKitchenPlan } from "./kitchenPlan";

const FULL = [{ validFrom: "2026-01-01", minutesPerWeekday: [420, 420, 420, 420, 420, 0, 0] }];
const person = (userId: string, extra: Partial<KitchenPerson> = {}): KitchenPerson => ({
  userId,
  schedules: FULL,
  absences: [],
  ...extra,
});
const vacation = (startDate: string, endDate: string, half = false) => ({
  type: "vacation",
  startDate,
  endDate,
  halfDayStart: half,
  halfDayEnd: false,
});

// Mon 09.11. to Fri 13.11.2026 plus the weekend.
const WEEK = [
  "2026-11-09",
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
  "2026-11-15",
];

function plan(
  people: KitchenPerson[],
  options: {
    daysOff?: string[];
    existing?: [string, string][];
    lastDuty?: [string, string][];
  } = {},
) {
  return proposeKitchenPlan({
    dates: WEEK,
    people,
    daysOff: new Set(options.daysOff),
    existing: new Map(options.existing),
    lastDuty: new Map(options.lastDuty),
  });
}

describe("canDoKitchen", () => {
  test("a contract under six hours is a half day", () => {
    const halfDays = [
      { validFrom: "2026-01-01", minutesPerWeekday: [300, 300, 300, 300, 0, 0, 0] },
    ];
    expect(canDoKitchen(person("a", { schedules: halfDays }), "2026-11-09", false)).toBe(false);
  });

  test("a six-hour Friday still counts", () => {
    const short = [{ validFrom: "2026-01-01", minutesPerWeekday: [480, 480, 480, 480, 360, 0, 0] }];
    expect(canDoKitchen(person("a", { schedules: short }), "2026-11-13", false)).toBe(true);
  });

  test("half a day of vacation rules the day out", () => {
    const p = person("a", { absences: [vacation("2026-11-09", "2026-11-09", true)] });
    expect(canDoKitchen(p, "2026-11-09", false)).toBe(false);
    expect(canDoKitchen(p, "2026-11-10", false)).toBe(true);
  });
});

describe("proposeKitchenPlan", () => {
  test("goes round evenly and skips the weekend", () => {
    const days = plan([person("a"), person("b")]);
    expect(days.map((d) => d.userId)).toEqual(["a", "b", "a", "b", "a"]);
  });

  test("whoever did it longest ago goes first", () => {
    const days = plan([person("a"), person("b")], {
      lastDuty: [
        ["a", "2026-11-06"],
        ["b", "2026-11-05"],
      ],
    });
    expect(days[0].userId).toBe("b");
  });

  test("an absent person is skipped and does not pile up duties afterwards", () => {
    const days = plan([
      person("a", { absences: [vacation("2026-11-09", "2026-11-11")] }),
      person("b"),
      person("c"),
    ]);
    expect(days.map((d) => d.userId)).toEqual(["b", "c", "b", "a", "c"]);
  });

  test("keeps a planned day, unless that person can no longer do it", () => {
    const days = plan(
      [person("a"), person("b", { absences: [vacation("2026-11-10", "2026-11-10")] })],
      {
        existing: [
          ["2026-11-09", "b"],
          ["2026-11-10", "b"],
        ],
      },
    );
    expect(days[0].userId).toBe("b");
    expect(days[1].userId).toBe("a");
  });

  test("no duty on days off; a workday nobody can do stays visible", () => {
    const days = plan([person("a", { absences: [vacation("2026-11-10", "2026-11-10")] })], {
      daysOff: ["2026-11-09"],
    });
    expect(days[0]).toEqual({ date: "2026-11-10", userId: null, candidates: [] });
    expect(days.map((d) => d.date)).not.toContain("2026-11-09");
  });
});
