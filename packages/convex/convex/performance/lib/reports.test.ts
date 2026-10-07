import { describe, expect, test } from "vitest";

import { type Id } from "../../_generated/dataModel";
import { callDays, cutRows, summarizeMonth, type ReportRow } from "./reports";
import { parseISODate } from "./workdays";

const A = "a" as Id<"performanceEmployees">;
const B = "b" as Id<"performanceEmployees">;
const names = new Map([
  [A, "Anna"],
  [B, "Ben"],
]);
const row = (
  employeeId: Id<"performanceEmployees">,
  reportDate: string,
  fields: Partial<ReportRow> = {},
): ReportRow => ({ employeeId, reportDate, ...fields });

describe("summarizeMonth", () => {
  // October 2026: workdays 1, 2, 5, 6, … (3 Oct is a holiday).
  const rows = [
    row(A, "2026-10-01", { callsToday: 10, loginSec: 3600 }),
    row(B, "2026-10-01", { callsToday: 5, loginSec: 1800 }),
    // 2 Oct: no call report for anyone.
    row(A, "2026-10-05", { callsToday: 10, loginSec: 3600, wonMonth: 6, workableCreated: 20 }),
    row(B, "2026-10-05", { wonMonth: 2, workableCreated: 10 }),
  ];

  test("the team forecast flags days without any call report", () => {
    const m = summarizeMonth(rows, names, "2026-10", { today: parseISODate("2026-10-06") });
    expect(m.coverage?.missing).toEqual(["2026-10-02"]);
    expect(m.total.fc?.incomplete).toBe(true);
    expect(m.total.fc?.missingDays).toEqual(["02.10."]);
  });

  test("an employee's worked days include the unreported day instead of shrinking FC1's divisor", () => {
    const m = summarizeMonth(rows, names, "2026-10", { today: parseISODate("2026-10-06") });
    const anna = m.snaps.find((s) => s.employeeId === A)!;
    // 2 days with calls + 1 day without any report.
    expect(anna.fc?.elapsed).toBe(3);
    expect(anna.wonPerDay).toBe(2);
    expect(anna.callDays).toBe(2);
    expect(anna.loginDays).toBe(2);
  });

  test("per-source as-of dates", () => {
    const m = summarizeMonth(rows, names, "2026-10");
    expect(m.asOf).toEqual({ sales: "2026-10-05", calls: "2026-10-05" });
  });

  test("a cutoff keeps only what was known by then, per source", () => {
    const m = summarizeMonth(rows, names, "2026-10", {
      cutoff: { sales: "2026-10-01", calls: "2026-10-01" },
    });
    expect(m.total.callsToday).toBe(15);
    expect(m.total.wonMonth).toBeUndefined();
  });

  test("hidden employees (not in the roster) are left out", () => {
    const m = summarizeMonth(rows, new Map([[A, "Anna"]]), "2026-10");
    expect(m.snaps.map((s) => s.name)).toEqual(["Anna"]);
    expect(m.total.wonMonth).toBe(6);
  });
});

describe("cutRows", () => {
  test("drops each source's figures after its own cutoff", () => {
    const out = cutRows(
      [row(A, "2026-09-03", { callsToday: 4, wonMonth: 9, unqualifiedReasons: "Preis: 1" })],
      { sales: "2026-09-02", calls: "2026-09-04" },
    );
    expect(out).toEqual([row(A, "2026-09-03", { callsToday: 4 })]);
  });
});

describe("callDays", () => {
  test("counts employees with Genesys login time per day", () => {
    const days = callDays(
      [
        row(A, "2026-10-01", { loginSec: 100 }),
        row(B, "2026-10-01", { loginSec: 0, callsToday: 0 }),
        row(B, "2026-10-02", { loginSec: 50 }),
      ],
      names,
      "2026-10",
    );
    expect(days).toHaveLength(31);
    expect(days[0].loggedIn).toBe(1);
    expect(days[1].loggedIn).toBe(1);
    expect(days[2].loggedIn).toBe(0);
  });
});
