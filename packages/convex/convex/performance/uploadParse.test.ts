/**
 * The upload pipeline end to end: a file goes into storage, `apiImportReport`
 * detects and imports it, and the test checks what landed in the database.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

async function setup(employeeNames: string[] = ["Anna Müller", "Ben Becker"]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      createdAt: now,
      updatedAt: now,
    });
    const employees: Id<"performanceEmployees">[] = [];
    for (const name of employeeNames) {
      employees.push(
        await ctx.db.insert("performanceEmployees", { name, active: true, companyId }),
      );
    }
    return { companyId, employees };
  });

  let uploads = 0;
  async function upload(
    filename: string,
    content: string | Uint8Array<ArrayBuffer>,
    opts: { force?: boolean } = {},
  ) {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    uploads++;
    return t.action(api.performance.uploadParse.apiImportReport, {
      serverKey,
      companyId: ids.companyId,
      filename,
      storageId,
      contentHash: `hash-${uploads}`,
      force: opts.force,
    });
  }
  return { t, ids, upload };
}

function interactionsCsv(rows: [string, string, string][]): string {
  return [
    "Benutzer;Datum;Dauer;Richtung;Vollständiger Export abgeschlossen",
    ...rows.map(([name, when, dur]) => `${name};${when};${dur};Ausgehend;JA`),
  ].join("\n");
}

function leadCsv(asOf: string, rows: [string, string, string][]): string {
  return [
    `As of ${asOf}`,
    "Lead Owner;Lead Status;Create Date;Last Activity",
    ...rows.map(([owner, status, created]) => `${owner};${status};${created};`),
  ].join("\n");
}

describe("Salesforce import", () => {
  test("an older report updates its day but never replaces newer drill-down lists", async () => {
    const { t, ids, upload } = await setup();
    const newer = await upload(
      "lead-0510.csv",
      leadCsv("2026-10-05", [
        ["Anna Müller", "Open", "01.10.2026"],
        ["Anna Müller", "Analysis", "02.10.2026"],
      ]),
    );
    expect(newer).toMatchObject({ status: "ok", reportKind: "lead", reportDate: "2026-10-05" });

    const older = await upload(
      "lead-0110.csv",
      leadCsv("2026-10-01", [["Ben Becker", "Open", "01.10.2026"]]),
    );
    expect(older).toMatchObject({ status: "ok", reportDate: "2026-10-01", rawKept: "2026-10-05" });

    const raw = await t.run((ctx) =>
      ctx.db
        .query("performanceRawLeads")
        .withIndex("by_company_owner", (q) => q.eq("companyId", ids.companyId))
        .collect(),
    );
    expect(raw.map((r) => [r.owner, r.reportDate])).toEqual([
      ["Anna Müller", "2026-10-05"],
      ["Anna Müller", "2026-10-05"],
    ]);
    const benReport = await t.run((ctx) =>
      ctx.db
        .query("performanceReports")
        .withIndex("by_company_reportDate", (q) =>
          q.eq("companyId", ids.companyId).eq("reportDate", "2026-10-01"),
        )
        .collect(),
    );
    expect(benReport).toHaveLength(1);

    // The same or a newer day does replace them.
    await upload("lead-0610.csv", leadCsv("2026-10-06", [["Ben Becker", "Open", "06.10.2026"]]));
    const after = await t.run((ctx) =>
      ctx.db
        .query("performanceRawLeads")
        .withIndex("by_company_owner", (q) => q.eq("companyId", ids.companyId))
        .collect(),
    );
    expect(after.map((r) => r.owner)).toEqual(["Ben Becker"]);
  });

  test("the upload log row is written after the drill-down tables", async () => {
    const { t, ids, upload } = await setup();
    await upload("lead.csv", leadCsv("2026-10-05", [["Anna Müller", "Open", "01.10.2026"]]));
    const [log] = await t.run((ctx) =>
      ctx.db
        .query("performanceUploadLog")
        .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", ids.companyId))
        .collect(),
    );
    const [raw] = await t.run((ctx) => ctx.db.query("performanceRawLeads").collect());
    expect(log).toMatchObject({ reportKind: "lead", reportDate: "2026-10-05", rowsImported: 1 });
    expect(log._creationTime).toBeGreaterThanOrEqual(raw._creationTime);
  });
});

describe("import lock", () => {
  test("a second import for the same dashboard waits for the first", async () => {
    const { t, ids, upload } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("performanceImportState", {
        companyId: ids.companyId,
        lockToken: "other-import",
        lockedUntil: Date.now() + 60_000,
      }),
    );
    await expect(
      upload("lead.csv", leadCsv("2026-10-05", [["Anna Müller", "Open", "01.10.2026"]])),
    ).rejects.toThrow("Gerade läuft schon ein Import für dieses Dashboard");
  });

  test("an expired lock doesn't block, and a finished import releases it", async () => {
    const { t, ids, upload } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("performanceImportState", {
        companyId: ids.companyId,
        lockToken: "crashed-import",
        lockedUntil: Date.now() - 1,
      }),
    );
    await upload("lead.csv", leadCsv("2026-10-05", [["Anna Müller", "Open", "01.10.2026"]]));
    const state = await t.run((ctx) => ctx.db.query("performanceImportState").first());
    expect(state?.lockToken).toBeUndefined();
    expect(state?.rawLeadsReportDate).toBe("2026-10-05");
    // Released even when the import itself fails.
    await expect(upload("x.csv", "Foo;Bar\n1;2")).rejects.toThrow();
    const after = await t.run((ctx) => ctx.db.query("performanceImportState").first());
    expect(after?.lockToken).toBeUndefined();
  });
});

describe("unrecognised files", () => {
  test("get a German error naming the expected exports", async () => {
    const { upload } = await setup();
    await expect(upload("irgendwas.csv", "Foo;Bar\n1;2")).rejects.toThrow("Dateityp nicht erkannt");
  });
});

describe("interactions import", () => {
  test("replaces only the days the file contains", async () => {
    const { t, ids, upload } = await setup();
    await upload(
      "interaktionen-woche.csv",
      interactionsCsv([
        ["Anna Müller", "01.10.26 08:00", "00:02:00"],
        ["Anna Müller", "02.10.26 08:00", "00:03:00"],
        ["Ben Becker", "05.10.26 09:00", "00:01:00"],
      ]),
    );
    // A later file with only 05.10. must leave 01.10. and 02.10. alone.
    const result = await upload(
      "interaktionen-heute.csv",
      interactionsCsv([
        ["Ben Becker", "05.10.26 10:00", "00:04:00"],
        ["Ben Becker", "05.10.26 11:00", "00:05:00"],
      ]),
    );
    expect(result).toMatchObject({ status: "ok", rowsImported: 2 });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("performanceInteractions")
        .withIndex("by_company_date", (q) => q.eq("companyId", ids.companyId))
        .collect(),
    );
    expect(rows.map((r) => [r.date, r.durationSec]).sort()).toEqual([
      ["2026-10-01", 120],
      ["2026-10-02", 180],
      ["2026-10-05", 240],
      ["2026-10-05", 300],
    ]);
  });

  test("imports matched agents without a report that month and logs unmatched names", async () => {
    const { t, ids, upload } = await setup();
    const result = await upload(
      "interaktionen.csv",
      interactionsCsv([
        ["Anna Müller", "01.10.26 08:00", "00:02:00"],
        ["Fremd, Fritz (Consulting For Edenred)", "01.10.26 08:30", "00:02:00"],
      ]),
    );
    expect(result).toMatchObject({ status: "ok", rowsImported: 1, skipped: ["Fremd, Fritz"] });

    const log = await t.run((ctx) =>
      ctx.db
        .query("performanceUploadLog")
        .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", ids.companyId))
        .first(),
    );
    expect(log).toMatchObject({
      reportKind: "interactions",
      reportDate: "2026-10-01",
      skippedNames: ["Fremd, Fritz"],
    });
  });
});
