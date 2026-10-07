import { describe, expect, test } from "vitest";

import { parseLocaleNumber, readCallCsv, readCallExport } from "./callImport";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("call report durations", () => {
  test("a short millisecond average is read as ms once the file proves the unit", () => {
    const report = readCallCsv(
      [
        "Agentenname;Datum;Angenommen;Gespräch Durchschnitt;Gespräch Gesamt",
        "Anna Müller;01.10.2026;10;45000;450000",
        "Ben Becker;01.10.2026;4;9000;36000",
      ].join("\n"),
    )!;
    const [anna, ben] = report.rows;
    expect(anna).toMatchObject({ talkAvgSec: 45, talkTotalSec: 450 });
    // Ben's own cells (9000 / 36000) would pass as seconds — the file's
    // other rows decide the unit for every row.
    expect(ben).toMatchObject({ talkAvgSec: 9, talkTotalSec: 36 });
  });

  test("seconds stay seconds when nothing in the file is impossible as seconds", () => {
    const report = readCallCsv(
      ["Agent;Datum;Angenommen;Gespräch Durchschnitt", "Anna Müller;01.10.2026;10;180"].join("\n"),
    )!;
    expect(report.rows[0].talkAvgSec).toBe(180);
  });

  test("a header that says (ms) settles the unit", () => {
    const report = readCallCsv(
      ["Agent;Datum;Angenommen;Gespräch Durchschnitt (ms)", "Anna;01.10.2026;2;5000"].join("\n"),
    )!;
    expect(report.rows[0].talkAvgSec).toBe(5);
  });

  test("a German-formatted millisecond text cell keeps its thousands", () => {
    const report = readCallCsv(
      ["Agent;Datum;Bearbeitet;Gespräch Gesamt", "Anna;01.10.2026;64;13.861.588"].join("\n"),
    )!;
    expect(report.rows[0]).toMatchObject({ talkTotalSec: 13_862, talkAvgSec: 217 });
  });

  test("explicit HH:MM:SS cells are never rescaled", () => {
    const report = readCallCsv(
      [
        "Agent;Datum;Angenommen;Gespräch Durchschnitt;Angemeldet",
        "Anna;01.10.2026;10;00:03:00;28800000",
      ].join("\n"),
    )!;
    expect(report.rows[0]).toMatchObject({ talkAvgSec: 180, loginSec: 28_800 });
  });
});

describe("call report interval rows", () => {
  test("several rows per agent and day are summed, the average weighted", () => {
    const report = readCallCsv(
      [
        "Agentenname;Intervallstart;Bearbeitet;Angenommen;Gespräch Durchschnitt;Angemeldet",
        "Anna Müller;01.10.26 08:00;10;8;00:02:00;00:30:00",
        "Anna Müller;01.10.26 09:00;30;20;00:04:00;01:00:00",
        "Anna Müller;02.10.26 08:00;5;5;00:01:00;00:15:00",
      ].join("\n"),
    )!;
    expect(report.rows).toHaveLength(2);
    const day1 = report.rows.find((r) => iso(r.date) === "2026-10-01")!;
    expect(day1).toMatchObject({
      callsToday: 40,
      callsAnswered: 28,
      loginSec: 5400,
      talkTotalSec: 10 * 120 + 30 * 240,
      talkAvgSec: Math.round((10 * 120 + 30 * 240) / 40),
    });
    expect(iso(report.reportDate)).toBe("2026-10-02");
  });

  test("xlsx interval rows are summed the same way", () => {
    const report = readCallExport([
      ["Agent", "Datum", "Angenommen", "Outbound", "Gesprächszeit gesamt"],
      ["Anna", "01.10.2026", 3, 2, "00:10:00"],
      ["Anna", "01.10.2026", 1, 4, "00:05:00"],
    ])!;
    expect(report.rows).toEqual([
      expect.objectContaining({
        callsAnswered: 4,
        callsOutbound: 6,
        callsToday: 10,
        talkTotalSec: 900,
        talkAvgSec: 90,
      }),
    ]);
  });
});

describe("call report counts", () => {
  test("outbound only comes from an outbound column, never from Bearbeitet", () => {
    const report = readCallCsv(
      ["Agent;Datum;Bearbeitet;Angenommen", "Anna;01.10.2026;12;9"].join("\n"),
    )!;
    expect(report.rows[0]).toMatchObject({ callsToday: 12, callsAnswered: 9, callsOutbound: null });
  });

  test("Bearbeitet is callsToday in CSV and xlsx alike; otherwise answered + outbound", () => {
    const csv = readCallCsv(
      ["Agent;Datum;Bearbeitet;Angenommen;Outbound", "Anna;01.10.2026;12;9;5"].join("\n"),
    )!;
    const xlsx = readCallExport([
      ["Agent", "Datum", "Bearbeitet", "Angenommen", "Outbound"],
      ["Anna", "01.10.2026", 12, 9, 5],
    ])!;
    expect(csv.rows[0]).toMatchObject({ callsToday: 12, callsOutbound: 5 });
    expect(xlsx.rows[0]).toMatchObject({ callsToday: 12, callsOutbound: 5 });

    const noHandled = readCallExport([
      ["Agent", "Datum", "Angenommen", "Outbound"],
      ["Anna", "01.10.2026", 9, 5],
    ])!;
    expect(noHandled.rows[0].callsToday).toBe(14);
  });

  test("German thousands separators", () => {
    expect(parseLocaleNumber("1.234")).toBe(1234);
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("12,5")).toBe(12.5);
    expect(parseLocaleNumber("1.5")).toBe(1.5);
    expect(parseLocaleNumber("0.25")).toBe(0.25);
    expect(parseLocaleNumber("1,234.5")).toBe(1234.5);
    expect(parseLocaleNumber("abc")).toBeNull();
    const report = readCallCsv(
      ["Agent;Datum;Bearbeitet;Angenommen", "Anna;01.10.2026;1.234;1.000"].join("\n"),
    )!;
    expect(report.rows[0]).toMatchObject({ callsToday: 1234, callsAnswered: 1000 });
  });
});

describe("call report dates", () => {
  test("a German date in the title area is the report date", () => {
    const report = readCallExport([
      ["Agentenleistung – Bericht vom 01.10.2026"],
      [],
      ["Agent", "Angenommen", "Gesprächszeit gesamt"],
      ["Anna", 3, "00:10:00"],
    ])!;
    expect(iso(report.reportDate)).toBe("2026-10-01");
    expect(iso(report.rows[0].date)).toBe("2026-10-01");
  });

  test("dd.mm.yy and ISO in the title area work too", () => {
    const short = readCallExport([
      ["Zeitraum 30.09.26 – 30.09.26"],
      ["Agent", "Angenommen", "Outbound"],
      ["Anna", 3, 1],
    ])!;
    expect(iso(short.reportDate)).toBe("2026-09-30");
    const isoTitle = readCallExport([
      ["As of 2026-09-29 18:00"],
      ["Agent", "Angenommen", "Outbound"],
      ["Anna", 3, 1],
    ])!;
    expect(iso(isoTitle.reportDate)).toBe("2026-09-29");
  });

  test("a recognised report without activity is empty, not unrecognised", () => {
    const report = readCallCsv(["Agent;Datum;Angenommen", "Anna;04.10.2026;0"].join("\n"));
    expect(report).not.toBeNull();
    expect(report!.rows).toEqual([]);
  });
});
