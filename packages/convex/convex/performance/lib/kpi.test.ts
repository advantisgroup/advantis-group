import { describe, expect, test } from "vitest";

import { sumTeam, type Snapshot } from "./kpi";

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
