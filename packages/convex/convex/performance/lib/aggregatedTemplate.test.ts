import { describe, expect, test } from "vitest";

import { parseAggregatedTemplate } from "./aggregatedTemplate";

describe("parseAggregatedTemplate", () => {
  test("reads the downloadable template's headers without import.ts loaded", () => {
    const parsed = parseAggregatedTemplate([
      ["Mitarbeiter", "Datum", "Leads Created", "Opps Open", "Won", "Unqualified Reasons"],
      ["Anna Müller", "01.10.2026", 12, "3", "1.234", "Kein Bedarf: 2"],
      ["Ben Becker", "2026-10-02", "", 4, null, ""],
    ]);
    expect(parsed).not.toBeNull();
    expect(parsed!.reportDate).toBe("2026-10-02");
    expect(parsed!.snapshots).toEqual([
      {
        employeeName: "Anna Müller",
        reportDate: "2026-10-01",
        fields: {
          leadsCreated: 12,
          oppsOpen: 3,
          wonMonth: 1234,
          unqualifiedReasons: "Kein Bedarf: 2",
        },
      },
      { employeeName: "Ben Becker", reportDate: "2026-10-02", fields: { oppsOpen: 4 } },
    ]);
  });

  test("never writes call fields (or anything else) the file has no column for", () => {
    const parsed = parseAggregatedTemplate([
      ["Mitarbeiter", "Leads Created"],
      ["Anna", 5],
    ]);
    const fields = parsed!.snapshots[0].fields;
    expect(fields).toEqual({ leadsCreated: 5 });
    expect("callsToday" in fields).toBe(false);
    expect("unqualifiedReasons" in fields).toBe(false);
  });

  test("finds the header below a title row", () => {
    const parsed = parseAggregatedTemplate([
      ["Performance Oktober"],
      [],
      ["Name", "Calls heute"],
      ["Anna", 40],
    ]);
    expect(parsed!.snapshots[0].fields).toEqual({ callsToday: 40 });
  });

  test("every column of apps/api's blank template is recognised", () => {
    const header = [
      "Mitarbeiter",
      "Datum",
      "Leads Created",
      "Workable Created",
      "Leads Analysis",
      "Details Identification",
      "Opps Open",
      "Opps Close 7d",
      "Opps Pending",
      "Won",
      "Overdues Analysis",
      "Overdues Opps",
      "Opps30",
      "Leads Inaktiv 2 Wochen",
      "Opps Inaktiv 2 Wochen",
      "Unqualified Reasons",
    ];
    const row = ["Anna", "2026-10-01", ...header.slice(2, -1).map((_, i) => i + 1), "x"];
    const fields = parseAggregatedTemplate([header, row])!.snapshots[0].fields;
    expect(Object.keys(fields)).toHaveLength(header.length - 2);
  });

  test("returns null for a sheet that isn't the template", () => {
    expect(
      parseAggregatedTemplate([
        ["Foo", "Bar"],
        [1, 2],
      ]),
    ).toBeNull();
    // An employee column alone is not enough.
    expect(
      parseAggregatedTemplate([
        ["Name", "Ort"],
        ["Anna", "Nürnberg"],
      ]),
    ).toBeNull();
    expect(parseAggregatedTemplate([])).toBeNull();
  });
});
