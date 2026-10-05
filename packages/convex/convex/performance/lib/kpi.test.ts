import { describe, expect, test } from "vitest";

import {
  addForecast,
  aggregateReasons,
  awardBadges,
  badgeCacheReady,
  badgeCacheStale,
  callCoverage,
  comparisonCutoff,
  comparisonDeltas,
  marksForMonth,
  nthWorkday,
  parseReasons,
  performanceMarks,
  sumTeam,
  type Snapshot,
} from "./kpi";
import { mostCommonText } from "./types";
import { parseISODate } from "./workdays";

const day = (iso: string) => parseISODate(iso);

const snap = (id: string, fields: Partial<Snapshot> = {}): Snapshot => ({
  employeeId: id,
  name: id,
  reportDate: "2026-10-05",
  ...fields,
});

describe("sumTeam", () => {
  test("hitrate is Σwon / Σworkable over everyone, including closers above 100 %", () => {
    const total = sumTeam([
      snap("a", { wonMonth: 30, workableCreated: 10 }), // 300 %
      snap("b", { wonMonth: 5, workableCreated: 40 }),
    ]);
    expect(total.wonMonth).toBe(35);
    expect(total.workableCreated).toBe(50);
    expect(total.hitrate).toBe(70);
  });

  test("weights the call duration and keeps the newest report date", () => {
    const total = sumTeam([
      snap("a", { callsToday: 10, talkTotalSec: 1000, reportDate: "2026-10-02" }),
      snap("b", { callsToday: 30, talkTotalSec: 1000, reportDate: "2026-10-04" }),
    ]);
    expect(total.talkAvgSec).toBe(50);
    expect(total.reportDate).toBe("2026-10-04");
  });

  test("a metric nobody measured stays undefined, not 0", () => {
    expect(sumTeam([snap("a", { leadsCreated: 3 })]).wonMonth).toBeUndefined();
  });
});

describe("parseReasons", () => {
  test("round-trips the Salesforce import's text, commas inside reasons included", () => {
    const text = mostCommonText(
      new Map([
        ["Kein Bedarf, später melden", 3],
        ["Preis", 2],
      ]),
    );
    expect(parseReasons(text)).toEqual([
      { reason: "Kein Bedarf, später melden", count: 3 },
      { reason: "Preis", count: 2 },
    ]);
  });

  test("template text separated by commas or line breaks", () => {
    expect(parseReasons("Preis: 3, Kein Bedarf: 2\nFalsche Nummer = 1")).toEqual([
      { reason: "Preis", count: 3 },
      { reason: "Kein Bedarf", count: 2 },
      { reason: "Falsche Nummer", count: 1 },
    ]);
  });

  test("entries without a count count once and keep their commas", () => {
    expect(parseReasons("Preis: 3, Sonstiges, unklar; Wettbewerber")).toEqual([
      { reason: "Preis", count: 3 },
      { reason: "Sonstiges, unklar", count: 1 },
      { reason: "Wettbewerber", count: 1 },
    ]);
  });

  test("aggregateReasons sums across employees, largest first", () => {
    expect(aggregateReasons(["Preis: 1; Kein Bedarf, später: 2", undefined, "Preis: 4"])).toEqual([
      { reason: "Preis", count: 5 },
      { reason: "Kein Bedarf, später", count: 2 },
    ]);
  });
});

// October 2026: Thu 1, Fri 2, (Sat 3 = Tag der Deutschen Einheit), Mon 5 …
// September 2026: Tue 1, Wed 2, Thu 3, Fri 4, Mon 7 …
describe("comparisonCutoff", () => {
  test("a running month is compared at the same workday of the reference month", () => {
    // 2 Oct is the 2nd workday of October → 2nd workday of September.
    expect(comparisonCutoff("2026-10", "2026-09", "2026-10-02", day("2026-10-02"))).toBe(
      "2026-09-02",
    );
    expect(nthWorkday("2026-09", 2)).toBe("2026-09-02");
  });

  test("a weekend as-of counts the workdays up to it", () => {
    // Sun 4 Oct: still 2 workdays in.
    expect(comparisonCutoff("2026-10", "2026-09", "2026-10-04", day("2026-10-05"))).toBe(
      "2026-09-02",
    );
  });

  test("no data yet counts as of today", () => {
    expect(comparisonCutoff("2026-10", "2026-09", null, day("2026-10-01"))).toBe("2026-09-01");
  });

  test("before the month's first workday nothing of the reference month counts", () => {
    expect(comparisonCutoff("2026-11", "2026-10", "2026-11-01", day("2026-11-01"))).toBe(
      "2026-09-30",
    );
  });

  test("a completed month is compared full against full", () => {
    expect(comparisonCutoff("2026-09", "2026-08", "2026-09-30", day("2026-10-05"))).toBe(undefined);
  });

  test("a reference month with fewer workdays is compared whole", () => {
    expect(nthWorkday("2026-02", 30)).toBeUndefined();
    expect(comparisonCutoff("2026-10", "2026-02", "2026-10-30", day("2026-10-30"))).toBe(
      "2026-02-28",
    );
  });
});

describe("comparisonDeltas", () => {
  test("deltas against the cut reference, FC1 against the reference's final result", () => {
    const cur = { wonMonth: 10, fc1: 100, talkTotalSec: 7200 };
    const cut = { wonMonth: 8, fc1: 90, talkTotalSec: 3600 };
    const full = { wonMonth: 95, fc1: 95 };
    const d = comparisonDeltas(cur, cut, full);
    expect(d.wonMonth).toBe(2);
    expect(d.talkTotalSec).toBe(3600);
    expect(d.fc1).toBe(5);
  });
});

describe("callCoverage", () => {
  const rows = [
    { reportDate: "2026-10-01", callsToday: 5 },
    { reportDate: "2026-10-05", callsToday: 7 },
    { reportDate: "2026-10-06" },
  ];

  test("workdays without a call report up to the newest call day are missing", () => {
    expect(callCoverage(rows, "2026-10", "2026-10-05")).toEqual({
      through: "2026-10-05",
      missing: ["2026-10-02"],
    });
  });

  test("a newer Salesforce report extends the check to the day before it", () => {
    expect(callCoverage(rows, "2026-10", "2026-10-08")?.missing).toEqual([
      "2026-10-02",
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  test("a completed month is checked to its last day", () => {
    const c = callCoverage(rows, "2026-10", "2026-10-06", true);
    expect(c?.through).toBe("2026-10-31");
    expect(c?.missing).toContain("2026-10-30");
  });

  test("no call data at all is not a coverage problem", () => {
    expect(callCoverage([{ reportDate: "2026-10-01" }], "2026-10", "2026-10-01")).toBeNull();
  });
});

describe("addForecast", () => {
  test("missing report days count as worked, so a missing upload doesn't inflate FC1", () => {
    // 1 Oct and 5 Oct with calls, 2 Oct without any report: 3 worked days.
    const s = addForecast(snap("a", { wonMonth: 6, reportDate: "2026-10-05" }), "2026-10", {
      worked: 3,
      through: "2026-10-05",
      missing: ["2026-10-02"],
    });
    expect(s.wonPerDay).toBe(2);
    expect(s.fc?.basis).toBe("Arbeitstage");
    expect(s.fc?.incomplete).toBe(true);
    expect(s.fc?.missingDays).toEqual(["02.10."]);
    expect(s.fc1).toBe(2 * (3 + (s.fc?.remaining ?? 0)));
  });

  test("the team forecast on workdays carries the missing-report warning too", () => {
    const s = addForecast(sumTeam([snap("a", { wonMonth: 6 })]), "2026-10", {
      missing: ["2026-10-02"],
    });
    expect(s.fc?.basis).toBe("Werktage");
    expect(s.fc?.incomplete).toBe(true);
  });

  test("a completed month's FC1 is the actual result", () => {
    const s = addForecast(snap("a", { wonMonth: 40, reportDate: "2026-09-28" }), "2026-09", {
      worked: 20,
      through: "2026-09-30",
    });
    expect(s.fc?.isActual).toBe(true);
    expect(s.fc1).toBe(40);
  });
});

describe("badges and marks", () => {
  test("everyone on the dashboard takes part in badges", () => {
    const res = awardBadges([
      snap("Andrea Weber", { wonMonth: 30, workableCreated: 40, callsToday: 500 }),
      snap("b", { wonMonth: 10, workableCreated: 40, callsToday: 100 }),
    ]);
    expect(res.won.winners).toEqual(["Andrea Weber"]);
    expect(res.calls.winners).toEqual(["Andrea Weber"]);
  });

  const team = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      snap(`e${i}`, { wonMonth: i * 3, workableCreated: 20, hitrate: i * 15 }),
    );

  test("marks need at least six eligible employees", () => {
    expect(performanceMarks(team(5))).toEqual({});
    const marks = performanceMarks(team(6));
    expect(Object.values(marks).filter((m) => m.level === "high")).toHaveLength(3);
  });

  test("marks wait for five workdays in a running month", () => {
    expect(marksForMonth(team(8), { completed: false, workdaysElapsed: 4 })).toEqual({});
    expect(
      Object.keys(marksForMonth(team(8), { completed: false, workdaysElapsed: 5 })).length,
    ).toBeGreaterThan(0);
    expect(
      Object.keys(marksForMonth(team(8), { completed: true, workdaysElapsed: 0 })).length,
    ).toBeGreaterThan(0);
  });
});

describe("badge cache", () => {
  test("a month is frozen only from its 3rd day after month end", () => {
    expect(badgeCacheReady("2026-09", day("2026-10-02"))).toBe(false);
    expect(badgeCacheReady("2026-09", day("2026-10-03"))).toBe(true);
  });

  test("an upload of that month after computing makes the cache stale", () => {
    expect(
      badgeCacheStale("2026-09", 1000, [
        { uploadedAt: 2000, reportDate: "2026-09-30", reportKind: "call" },
      ]),
    ).toBe(true);
    expect(
      badgeCacheStale("2026-09", 1000, [
        { uploadedAt: 500, reportDate: "2026-09-30", reportKind: "call" },
        { uploadedAt: 2000, reportDate: "2026-10-01", reportKind: "call" },
        { uploadedAt: 2000, reportKind: "interactions" },
      ]),
    ).toBe(false);
  });

  test("the cron also counts next month's Salesforce reports (they file last month's closings)", () => {
    const uploads = [{ uploadedAt: 2000, reportDate: "2026-10-01", reportKind: "opp" }];
    expect(badgeCacheStale("2026-09", 1000, uploads)).toBe(false);
    expect(badgeCacheStale("2026-09", 1000, uploads, { nextMonthSales: true })).toBe(true);
  });
});
