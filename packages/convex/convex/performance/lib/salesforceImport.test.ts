import { describe, expect, test } from "vitest";

import { decodeCsvBytes, parseCsvText, readCallCsv } from "./callImport";
import {
  aggregateLeadReport,
  aggregateOppReport,
  readSalesforceExport,
  toDate,
} from "./salesforceImport";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

describe("Salesforce export detection", () => {
  test("German lead export: labels, any case, German As-of date, dates with time", () => {
    const sf = readSalesforceExport([
      ["KI_Lead_Report"],
      ["Stand: 01.10.2026 14:03"],
      [],
      ["LEAD-INHABER", "Lead-Status", "Statusdetails", "Erstellt am", "Letzte Aktivität"],
      [
        "Anna Müller",
        "Analysis",
        "Identification running",
        "01.08.2026 09:15",
        "2026-09-01T10:00:00Z",
      ],
      ["Anna Müller", "Open", "", "30.09.2026 14:03", ""],
      ["Sales - Queue", "Open", "", "30.09.2026", ""],
    ])!;
    expect(sf.kind).toBe("lead");
    expect(iso(sf.reportDate)).toBe("2026-10-01");
    if (sf.kind !== "lead") throw new Error("lead expected");
    const { snapshots, raw } = aggregateLeadReport(sf.rows, sf.reportDate);
    const today = snapshots.find((s) => s.reportDate === "2026-10-01")!;
    expect(today.fields).toMatchObject({
      leadsAnalysis: 1,
      overduesAnalysis: 1,
      leadsDetailsIdent: 1,
      leadsNoAction14: 1,
    });
    expect(raw.map((r) => [r.createDate, r.lastActivity])).toEqual([
      ["2026-08-01", "2026-09-01"],
      ["2026-09-30", undefined],
    ]);
  });

  test("German opportunity export with Phase, Schlusstermin, Alter, Kundennummer", () => {
    const sf = readSalesforceExport([
      [
        "Opportunity-Inhaber",
        "Phase",
        "Phasendetails",
        "Erstelldatum",
        "Schlusstermin",
        "Alter",
        "Kundennummer",
      ],
      ["Ben Becker", "Negotiation", "Pending Credit", "01.08.2026", "05.10.2026", "61", 477209],
      ["Ben Becker", "Geschlossen und gewonnen", "", "01.09.2026", "02.10.2026", "", ""],
    ])!;
    expect(sf.kind).toBe("opp");
    if (sf.kind !== "opp") throw new Error("opp expected");
    const reportDate = new Date(Date.UTC(2026, 9, 3));
    const { snapshots, raw, wonOpps } = aggregateOppReport(sf.rows, reportDate);
    expect(raw).toEqual([
      expect.objectContaining({
        stage: "Negotiation",
        closeDate: "2026-10-05",
        age: 61,
        customerNumber: "477209",
      }),
    ]);
    expect(wonOpps).toEqual([{ owner: "Ben Becker", closeDate: "2026-10-02" }]);
    expect(snapshots.find((s) => s.reportDate === "2026-10-03")!.fields).toMatchObject({
      oppsOpen: 1,
      oppsClose7d: 1,
      oppsPending: 1,
      oppsOver30: 1,
      wonMonth: 1,
    });
  });

  test("the English export keeps working, with 'As of' in the title", () => {
    const sf = readSalesforceExport([
      ["As of 2026-10-02 08:00"],
      ["Opportunity Owner", "Stage", "Close Date"],
      ["Ben Becker", "Closed Won", "10/1/2026"],
    ])!;
    expect(sf.kind).toBe("opp");
    expect(iso(sf.reportDate)).toBe("2026-10-02");
  });

  test("a CSV Salesforce export is recognised from its parsed rows", () => {
    const text = [
      '"Lead Owner","Lead Status","Create Date"',
      '"Anna Müller","Open","01.10.2026 08:00"',
    ].join("\r\n");
    const sf = readSalesforceExport(parseCsvText(text, ","))!;
    expect(sf.kind).toBe("lead");
    expect(sf.rows).toHaveLength(1);
  });

  test("a call report is not mistaken for a Salesforce export", () => {
    expect(
      readSalesforceExport([
        ["Agent", "Status", "Angenommen"],
        ["Anna", "Verfügbar", 3],
      ]),
    ).toBeNull();
  });

  test("toDate accepts dates with time", () => {
    expect(iso(toDate("01.10.2026 14:03"))).toBe("2026-10-01");
    expect(iso(toDate("2026-10-01T23:30:00.000Z"))).toBe("2026-10-01");
    expect(iso(toDate("1.2.26"))).toBe("2026-02-01");
    expect(toDate("kein Datum")).toBeNull();
  });
});

describe("CSV encoding", () => {
  test("a Windows-1252 export keeps its umlauts", () => {
    // "Agent;Datum;Angenommen\nJürgen Größ;01.10.2026;3" in cp1252.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Agent;Datum;Angenommen\nJ"),
      0xfc,
      ...new TextEncoder().encode("rgen Gr"),
      0xf6,
      0xdf,
      ...new TextEncoder().encode(";01.10.2026;3"),
    ]);
    const text = decodeCsvBytes(bytes);
    expect(text).toContain("Jürgen Größ");
    expect(readCallCsv(text)!.rows[0].employee).toBe("Jürgen Größ");
  });

  test("UTF-8 with BOM and the cp1252 euro sign", () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Müller")]);
    expect(decodeCsvBytes(utf8)).toBe("Müller");
    expect(decodeCsvBytes(new Uint8Array([0x80, 0x20, 0x31]))).toBe("€ 1");
  });
});
