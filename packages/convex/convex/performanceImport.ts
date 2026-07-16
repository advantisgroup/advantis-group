/**
 * Import pipeline for the Performance feature's report uploads. Ported
 * from the reference script's application-level import functions
 * (`upsert_snapshot`, `import_salesforce`, `import_calls`, `import_rows`,
 * `import_file`, `purge_excluded`).
 *
 * `apps/api`'s upload route does the "dumb" work — receive bytes, run the
 * security scan, store the original file, decode it into raw sheet
 * rows/CSV text — then calls `importReport` with that raw data. Detection,
 * aggregation, and all database writes happen here, so the report-parsing
 * business logic (`performance/lib/*`) stays entirely inside Convex
 * instead of being duplicated across the process boundary.
 */
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  cleanAgentName,
  matchEmployee,
  readCallCsv,
  readCallExport,
  type CallRow,
} from "./performance/lib/callImport";
import {
  aggregateLeadReport,
  aggregateOppReport,
  EXCLUDED_OWNERS,
  readSalesforceExport,
} from "./performance/lib/salesforceImport";
import {
  METRIC_KEYS,
  type CellValue,
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./performance/lib/types";
import { requireAdminLogin } from "./performanceAuth";
import { toISODate } from "./performance/lib/workdays";

/** Same convention as `onedrive.ts`: functions prefixed `api*` are
 * server-key gated and only called by `apps/api`, which has already
 * authenticated the caller (here: a valid, admin-role Performance
 * session) before reaching Convex. */
function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/** A one-shot URL `apps/api` POSTs the original report file to (Convex
 * file storage), before parsing and importing it. Public (not internal) —
 * `apps/api` calls this directly via the Convex HTTP client, which can
 * only reach public functions; the `serverKey` argument is what actually
 * restricts the caller. */
export const apiGenerateUploadUrl = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }): Promise<string> => {
    assertServerKey(serverKey);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Discards a staged file — used when the report turned out to have no
 * activity to import (see `apiImportReport`'s `{status: "empty"}`), so an
 * empty day's file doesn't linger in storage forever. */
export const apiDeleteStorage = mutation({
  args: { serverKey: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { serverKey, storageId }): Promise<void> => {
    assertServerKey(serverKey);
    await ctx.storage.delete(storageId);
  },
});

// ------------------------------------------------- aggregated template import
// Fallback format when a file is neither a Salesforce export nor a call
// report: one row per employee, with the metrics already aggregated by
// whoever filled in the template (see `/performance/vorlage.xlsx`,
// added in a later phase).

const HEADER_ALIASES: Record<string, string[]> = {
  employee: [
    "mitarbeiter",
    "employee",
    "name",
    "salesrep",
    "vertriebler",
    "mitarbeiterin",
  ],
  date: ["datum", "date", "reportdatum", "reportdate", "stichtag"],
  leadsCreated: [
    "leadserstelltmonat",
    "leadscreatedthismonth",
    "leadscreated",
    "leadserstellt",
    "leadsmonat",
  ],
  workableCreated: [
    "workableerstelltmonat",
    "workablecreatedthismonth",
    "workablecreated",
    "workableerstellt",
    "workablemonat",
  ],
  leadsAnalysis: ["leadsstatusanalysis", "leadsanalysis", "statusanalysis"],
  leadsDetailsIdent: [
    "leadsdetailsidentificationrunning",
    "detailsidentificationrunning",
    "leadsstatusdetailsidentificationrunning",
    "detailsidentification",
  ],
  oppsOpen: [
    "opportunitiesoffengesamt",
    "opportunitiesgesamtoffen",
    "oppsopen",
    "opportunitiesopen",
    "opportunitiesoffen",
  ],
  oppsClose7d: [
    "opportunitiesclosedate7tage",
    "oppsclosedate7tage",
    "closedate7days",
    "opportunitiesclosedatein7tagen",
    "oppsclose7d",
    "opportunitiesclosedateindenkommenden7tagen",
  ],
  oppsPending: [
    "oppspendingcreditdocuments",
    "opportunitiespendingcreditdocuments",
    "pendingcreditdocuments",
    "oppspending",
    "opportunitiespending",
    "stagedetailspendingcreditoderpendingdocuments",
  ],
  wonMonth: ["wonmonat", "wonthismonth", "won", "gewonnenmonat"],
  callsToday: [
    "callsheute",
    "callstoday",
    "anzahlcallstoday",
    "anzahlcallsheute",
    "calls",
  ],
  overduesAnalysis: [
    "overduesanalysis",
    "overdueanalysis",
    "analysis30",
    "analysis30tage",
  ],
  overduesOpps: [
    "overduesopportunities",
    "overdueopportunities",
    "overduesopps",
  ],
  oppsOver30: ["opportunities30tage", "opps30tage", "opportunity30", "opps30"],
  leadsNoAction14: [
    "leadslastactivity2wochen",
    "leadslastaction2wochen",
    "leadsinaktiv2wochen",
  ],
  oppsNoAction14: [
    "oppslastactivity2wochen",
    "opportunitieslastactivity2wochen",
    "oppsinaktiv2wochen",
  ],
  unqualifiedReasons: [
    "unqualifiedreasons",
    "unqualifiedreason",
    "unqualifiziertgruende",
    "unqualifiedgruende",
    "gruendeunqualified",
  ],
};

const TEMPLATE_ALIAS_LOOKUP = new Map<string, string>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
  for (const alias of aliases) TEMPLATE_ALIAS_LOOKUP.set(alias, field);
}

function normHeaderSimple(v: CellValue): string {
  return v === null || v === undefined
    ? ""
    : String(v)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function toIntLoose(v: CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  const f = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(f) ? Math.round(f) : 0;
}

const TEMPLATE_DATE_FORMATS: ((s: string) => Date | null)[] = [
  s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  },
  s => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  },
  s => {
    const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null;
  },
  s => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
  },
];

/** Always returns an ISO date — defaults to today when the cell is absent
 * or unparseable, matching the reference script's `_to_date`. */
function toDateOrToday(v: CellValue): string {
  if (v instanceof Date) return toISODate(v);
  if (v !== null && v !== undefined && v !== "") {
    const s = String(v).trim();
    for (const parse of TEMPLATE_DATE_FORMATS) {
      const d = parse(s);
      if (d) return toISODate(d);
    }
  }
  return toISODate(new Date());
}

/** Reads the first table of an aggregated-template report: one row per
 * employee, already-computed metrics. Throws when the file doesn't look
 * like a usable template at all. */
export function parseAggregatedTemplate(
  wsRows: SheetRow[]
): EmployeeSnapshot[] {
  if (wsRows.length === 0) {
    throw new ConvexError({
      code: "validation",
      message: "Die Datei enthält keine Daten.",
    });
  }
  const header = wsRows[0];
  const colmap: Partial<
    Record<
      keyof MetricFields | "employee" | "date" | "unqualifiedReasons",
      number
    >
  > = {};
  header.forEach((h, idx) => {
    const field = TEMPLATE_ALIAS_LOOKUP.get(normHeaderSimple(h));
    if (field) colmap[field as keyof typeof colmap] = idx;
  });
  if (colmap.employee === undefined) {
    throw new ConvexError({
      code: "validation",
      message:
        "Spalte 'Mitarbeiter' wurde nicht gefunden. Bitte die Vorlage verwenden.",
    });
  }

  const out: EmployeeSnapshot[] = [];
  for (const r of wsRows.slice(1)) {
    if (!r || r.every(v => v === null || v === undefined || v === "")) continue;
    const nameRaw = r[colmap.employee];
    if (nameRaw === null || nameRaw === undefined || nameRaw === "") continue;
    const employeeName = String(nameRaw).trim();
    const reportDate = toDateOrToday(
      colmap.date !== undefined ? r[colmap.date] : null
    );

    const fields: SnapshotFields = {};
    for (const key of METRIC_KEYS) {
      const idx = colmap[key];
      fields[key] = idx !== undefined ? toIntLoose(r[idx]) : 0;
    }
    const reasonsIdx = colmap.unqualifiedReasons;
    if (reasonsIdx !== undefined) {
      const v = r[reasonsIdx];
      fields.unqualifiedReasons =
        v !== null && v !== undefined && v !== "" ? String(v).trim() : "";
    } else {
      fields.unqualifiedReasons = "";
    }
    out.push({ employeeName, reportDate, fields });
  }
  if (out.length === 0) {
    throw new ConvexError({
      code: "validation",
      message: "Keine Datenzeilen gefunden.",
    });
  }
  return out;
}

// ----------------------------------------------------------------- upserts

async function findOrCreateEmployee(
  ctx: MutationCtx,
  name: string
): Promise<Id<"performanceEmployees">> {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const all = await ctx.db.query("performanceEmployees").collect();
  const existing = all.find(e => e.name.toLowerCase() === lower);
  if (existing) return existing._id;
  return await ctx.db.insert("performanceEmployees", {
    name: trimmed,
    active: true,
  });
}

/** Partial upsert: only the supplied fields are updated, so a Lead report
 * and an Opportunity report for the same employee/day complement each
 * other instead of overwriting. */
async function upsertSnapshot(
  ctx: MutationCtx,
  employeeName: string,
  reportDate: string,
  fields: SnapshotFields,
  sourceFile: string,
  uploadedAt: number
): Promise<void> {
  const employeeId = await findOrCreateEmployee(ctx, employeeName);
  const existing = await ctx.db
    .query("performanceReports")
    .withIndex("by_employee_date", q =>
      q.eq("employeeId", employeeId).eq("reportDate", reportDate)
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, sourceFile, uploadedAt });
  } else {
    await ctx.db.insert("performanceReports", {
      employeeId,
      reportDate,
      ...fields,
      sourceFile,
      uploadedAt,
    });
  }
}

/** Removes data for excluded owners that may still be lingering from an
 * earlier import. */
async function purgeExcluded(ctx: MutationCtx): Promise<void> {
  if (EXCLUDED_OWNERS.size === 0) return;
  const employees = await ctx.db.query("performanceEmployees").collect();
  const excluded = employees.filter(e =>
    EXCLUDED_OWNERS.has(e.name.toLowerCase())
  );
  const excludedIds = new Set(excluded.map(e => e._id));

  if (excludedIds.size > 0) {
    const reports = await ctx.db.query("performanceReports").collect();
    await Promise.all(
      reports
        .filter(r => excludedIds.has(r.employeeId))
        .map(r => ctx.db.delete(r._id))
    );
    await Promise.all(excluded.map(e => ctx.db.delete(e._id)));
  }
  const rawLeads = await ctx.db.query("performanceRawLeads").collect();
  await Promise.all(
    rawLeads
      .filter(r => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map(r => ctx.db.delete(r._id))
  );
  const rawOpps = await ctx.db.query("performanceRawOpps").collect();
  await Promise.all(
    rawOpps
      .filter(r => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map(r => ctx.db.delete(r._id))
  );
}

export const getTeamEmployeeNames = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const employees = await ctx.db.query("performanceEmployees").collect();
    return employees
      .filter(e => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map(e => e.name);
  },
});

const snapshotFieldsValidator = v.object({
  leadsCreated: v.optional(v.number()),
  workableCreated: v.optional(v.number()),
  leadsAnalysis: v.optional(v.number()),
  leadsDetailsIdent: v.optional(v.number()),
  oppsOpen: v.optional(v.number()),
  oppsClose7d: v.optional(v.number()),
  oppsPending: v.optional(v.number()),
  wonMonth: v.optional(v.number()),
  callsToday: v.optional(v.number()),
  overduesAnalysis: v.optional(v.number()),
  overduesOpps: v.optional(v.number()),
  oppsOver30: v.optional(v.number()),
  leadsNoAction14: v.optional(v.number()),
  oppsNoAction14: v.optional(v.number()),
  callsAnswered: v.optional(v.number()),
  callsOutbound: v.optional(v.number()),
  talkTotalSec: v.optional(v.number()),
  talkAvgSec: v.optional(v.number()),
  loginSec: v.optional(v.number()),
  unqualifiedReasons: v.optional(v.string()),
});

const snapshotValidator = v.object({
  employeeName: v.string(),
  reportDate: v.string(),
  fields: snapshotFieldsValidator,
});

const rawLeadValidator = v.object({
  reportDate: v.string(),
  owner: v.string(),
  status: v.optional(v.string()),
  statusDetails: v.optional(v.string()),
  createDate: v.optional(v.string()),
  lastActivity: v.optional(v.string()),
});

const rawOppValidator = v.object({
  reportDate: v.string(),
  owner: v.string(),
  stage: v.optional(v.string()),
  stageDetails: v.optional(v.string()),
  createdDate: v.optional(v.string()),
  closeDate: v.optional(v.string()),
  age: v.optional(v.number()),
  lastActivity: v.optional(v.string()),
  customerNumber: v.optional(v.string()),
});

export const applyImport = internalMutation({
  args: {
    snapshots: v.array(snapshotValidator),
    rawLeads: v.optional(v.array(rawLeadValidator)),
    rawOpps: v.optional(v.array(rawOppValidator)),
    sourceFile: v.string(),
    uploadLogLabel: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<{ rowsImported: number }> => {
    const now = Date.now();
    for (const snap of args.snapshots) {
      await upsertSnapshot(
        ctx,
        snap.employeeName,
        snap.reportDate,
        snap.fields,
        args.sourceFile,
        now
      );
    }
    // Raw drill-down rows are a full point-in-time snapshot of the source
    // report, not a delta — replaced wholesale rather than accumulated.
    if (args.rawLeads) {
      const existing = await ctx.db.query("performanceRawLeads").collect();
      await Promise.all(existing.map(row => ctx.db.delete(row._id)));
      await Promise.all(
        args.rawLeads.map(row => ctx.db.insert("performanceRawLeads", row))
      );
    }
    if (args.rawOpps) {
      const existing = await ctx.db.query("performanceRawOpps").collect();
      await Promise.all(existing.map(row => ctx.db.delete(row._id)));
      await Promise.all(
        args.rawOpps.map(row => ctx.db.insert("performanceRawOpps", row))
      );
    }
    await ctx.db.insert("performanceUploadLog", {
      filename: args.uploadLogLabel,
      storageId: args.storageId,
      rowsImported: args.snapshots.length,
      uploadedAt: now,
    });
    await purgeExcluded(ctx);
    return { rowsImported: args.snapshots.length };
  },
});

/** Most recent uploads, for the admin upload page's log table. */
export const listUploadLog = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
    const rows = await ctx.db
      .query("performanceUploadLog")
      .order("desc")
      .take(30);
    return rows.map(r => ({
      _id: r._id,
      filename: r.filename,
      rowsImported: r.rowsImported,
      uploadedAt: r.uploadedAt,
    }));
  },
});

// ------------------------------------------------------------------- entry

export type ImportResult =
  | { status: "ok"; rowsImported: number; skipped?: string[] }
  | { status: "empty"; reportDate: string };

const CALL_FIELDS: (keyof CallRow & keyof MetricFields)[] = [
  "callsToday",
  "callsAnswered",
  "callsOutbound",
  "talkAvgSec",
  "talkTotalSec",
  "loginSec",
];

/** One row per employee/day, matched against the known team; agents with
 * no unambiguous team match are skipped (reported in `skipped`), same as
 * `import_calls`. Requires at least one Lead/Opportunity report to have
 * been imported already, so there's a team to match against. */
async function buildCallSnapshots(
  ctx: ActionCtx,
  rows: CallRow[]
): Promise<{ snapshots: EmployeeSnapshot[]; skipped: string[] }> {
  const known: string[] = await ctx.runQuery(
    internal.performanceImport.getTeamEmployeeNames,
    {}
  );
  if (known.length === 0) {
    throw new ConvexError({
      code: "no_employees",
      message:
        "Es sind noch keine Mitarbeiter vorhanden. Bitte zuerst den Lead- oder Opportunity-Report hochladen.",
    });
  }
  const snapshots: EmployeeSnapshot[] = [];
  const skipped: string[] = [];
  for (const rec of rows) {
    const emp = matchEmployee(rec.employee, known);
    if (!emp) {
      skipped.push(cleanAgentName(rec.employee));
      continue;
    }
    const fields: SnapshotFields = {};
    for (const f of CALL_FIELDS) {
      const value = rec[f];
      if (value !== null && value !== undefined) fields[f] = value;
    }
    if (Object.keys(fields).length === 0) continue;
    snapshots.push({
      employeeName: emp,
      reportDate: toISODate(rec.date),
      fields,
    });
  }
  return { snapshots, skipped };
}

/**
 * Detects the report type (Salesforce Lead/Opp, call report as CSV or
 * Excel, or an aggregated template) and imports it — ported from
 * `import_file`. Exactly one of `csvText`/`sheetRows` should be provided,
 * matching the source file's extension.
 *
 * Server-key gated: only `apps/api`'s upload route calls this, after it has
 * already verified the caller holds a valid, admin-role Performance
 * session — same trust boundary as the `api*`-prefixed OneDrive functions
 * in `onedrive.ts`.
 */
export const apiImportReport = action({
  args: {
    serverKey: v.string(),
    filename: v.string(),
    storageId: v.id("_storage"),
    csvText: v.optional(v.string()),
    sheetRows: v.optional(v.any()),
  },
  handler: async (
    ctx,
    { serverKey, filename, storageId, csvText, sheetRows }
  ): Promise<ImportResult> => {
    assertServerKey(serverKey);
    if (csvText !== undefined) {
      const detected = readCallCsv(csvText);
      if (!detected) {
        throw new ConvexError({
          code: "unrecognized_report",
          message:
            "CSV nicht erkannt. Erwartet wird ein Call-Report mit Agentenname und Call-Spalten.",
        });
      }
      if (detected.rows.length === 0) {
        // A report with zero activity (e.g. a weekend): ignored entirely,
        // no data, no upload-log entry.
        return { status: "empty", reportDate: toISODate(detected.reportDate) };
      }
      const { snapshots, skipped } = await buildCallSnapshots(
        ctx,
        detected.rows
      );
      const result = await ctx.runMutation(
        internal.performanceImport.applyImport,
        {
          snapshots,
          sourceFile: filename,
          uploadLogLabel: `${filename} (Call-Report ${toISODate(detected.reportDate)}: ${snapshots.length} Team-Agenten übernommen, ${skipped.length} ignoriert)`,
          storageId,
        }
      );
      return { status: "ok", rowsImported: result.rowsImported, skipped };
    }

    const rows = sheetRows as SheetRow[] | undefined;
    if (!rows) {
      throw new ConvexError({
        code: "validation",
        message: "No data provided.",
      });
    }

    const sf = readSalesforceExport(rows);
    if (sf) {
      if (sf.kind === "lead") {
        const { snapshots, raw } = aggregateLeadReport(sf.rows, sf.reportDate);
        const result = await ctx.runMutation(
          internal.performanceImport.applyImport,
          {
            snapshots,
            rawLeads: raw,
            sourceFile: filename,
            uploadLogLabel: `${filename} (Lead-Report, ${sf.rows.length} Zeilen)`,
            storageId,
          }
        );
        return { status: "ok", rowsImported: result.rowsImported };
      }
      const { snapshots, raw } = aggregateOppReport(sf.rows, sf.reportDate);
      const result = await ctx.runMutation(
        internal.performanceImport.applyImport,
        {
          snapshots,
          rawOpps: raw,
          sourceFile: filename,
          uploadLogLabel: `${filename} (Opportunity-Report, ${sf.rows.length} Zeilen)`,
          storageId,
        }
      );
      return { status: "ok", rowsImported: result.rowsImported };
    }

    const calls = readCallExport(rows);
    if (calls) {
      const { snapshots, skipped } = await buildCallSnapshots(ctx, calls.rows);
      const result = await ctx.runMutation(
        internal.performanceImport.applyImport,
        {
          snapshots,
          sourceFile: filename,
          uploadLogLabel: `${filename} (Call-Report ${toISODate(calls.reportDate)}: ${snapshots.length} Team-Agenten übernommen, ${skipped.length} ignoriert)`,
          storageId,
        }
      );
      return { status: "ok", rowsImported: result.rowsImported, skipped };
    }

    const template = parseAggregatedTemplate(rows);
    const result = await ctx.runMutation(
      internal.performanceImport.applyImport,
      {
        snapshots: template,
        sourceFile: filename,
        uploadLogLabel: filename,
        storageId,
      }
    );
    return { status: "ok", rowsImported: result.rowsImported };
  },
});
