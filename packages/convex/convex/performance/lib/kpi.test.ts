import { describe, expect, test } from "vitest";

import { aggregateReasons, parseReasons, sumTeam, type Snapshot } from "./kpi";
import { mostCommonText } from "./types";

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
