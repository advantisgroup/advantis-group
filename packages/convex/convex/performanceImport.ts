/**
 * Database-side half of the Performance feature's report-upload pipeline.
 * Ported from the reference script's application-level import functions
 * (`upsert_snapshot`, `import_rows`, `purge_excluded`).
 *
 * Report detection, parsing, and aggregation (Salesforce/call-report
 * dispatch, `parseAggregatedTemplate`'s fallback) live in
 * `performanceUploadParse.ts`'s `apiImportReport` action instead of here —
 * that file needs the Node-only `xlsx` package and reads the uploaded file
 * directly from Convex storage (a real Salesforce export can have tens of
 * thousands of rows, which blows past Convex's 8192-element
 * array-argument limit if shipped here as an action argument). This file
 * stays focused on the actual database writes (`applyImport`, the raw-table
 * chunk mutations, `upsertSnapshot`, `purgeExcluded`), which
 * `apiImportReport` calls into via `ctx.runMutation`.
 */
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { monthBounds } from "./performance/lib/kpi";
import { EXCLUDED_OWNERS } from "./performance/lib/salesforceImport";
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
 * session) before reaching Convex. Exported so `performanceUploadParse.ts`
 * (a separate "use node" action file — see its header comment) can reuse
 * the same check. */
export function assertServerKey(serverKey: string): void {
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
  // Convex indexes aren't unique constraints (see the schema comment on
  // by_employee_date), so more than one row can in principle match — e.g. a
  // raced concurrent upload. Merge into the first match and drop any extras
  // instead of using .unique(), which throws on ambiguity and would abort
  // the entire import over a single duplicate row.
  const matches = await ctx.db
    .query("performanceReports")
    .withIndex("by_employee_date", q =>
      q.eq("employeeId", employeeId).eq("reportDate", reportDate)
    )
    .collect();
  const [existing, ...duplicates] = matches;
  if (duplicates.length > 0) {
    await Promise.all(duplicates.map(d => ctx.db.delete(d._id)));
  }
  if (existing) {
    // A re-import (fixing a past bug, or an admin re-uploading the same
    // day's report) usually recomputes byte-identical values — a day's
    // historical data doesn't change once reported, only new days get
    // new data. Skipping a no-op write avoids burning a mutation on
    // every row of every file in a bulk re-import for nothing.
    const unchanged = (Object.keys(fields) as (keyof SnapshotFields)[]).every(
      key => existing[key] === fields[key]
    );
    if (!unchanged) {
      await ctx.db.patch(existing._id, { ...fields, sourceFile, uploadedAt });
    }
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

/** Same roster as `getTeamEmployeeNames`, with each employee's id — the
 * interactions importer needs the id (a foreign key into
 * `performanceInteractions`), not just the name `matchEmployee` returns. */
export const getTeamEmployeesWithId = internalQuery({
  args: {},
  handler: async (
    ctx
  ): Promise<{ id: Id<"performanceEmployees">; name: string }[]> => {
    const employees = await ctx.db.query("performanceEmployees").collect();
    return employees
      .filter(e => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map(e => ({ id: e._id, name: e.name }));
  },
});

/** Employees with at least one Performance report in each of `months`
 * ("YYYY-MM") — the "already active in the Performance Dashboard this
 * month" gate for imported interactions, so a raw Genesys export doesn't
 * pull in agents from queues/departments this feature doesn't track. */
export const getActiveEmployeeIdsByMonth = internalQuery({
  args: { months: v.array(v.string()) },
  handler: async (
    ctx,
    { months }
  ): Promise<Record<string, Id<"performanceEmployees">[]>> => {
    const out: Record<string, Id<"performanceEmployees">[]> = {};
    for (const ym of months) {
      const { start, end } = monthBounds(ym);
      const rows = await ctx.db
        .query("performanceReports")
        .withIndex("by_reportDate", q =>
          q.gte("reportDate", start).lte("reportDate", end)
        )
        .collect();
      out[ym] = [...new Set(rows.map(r => r.employeeId))];
    }
    return out;
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

const reportKindValidator = v.union(
  v.literal("lead"),
  v.literal("opp"),
  v.literal("call"),
  v.literal("template")
);

export const applyImport = internalMutation({
  args: {
    snapshots: v.array(snapshotValidator),
    sourceFile: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.optional(v.string()),
    reportKind: v.optional(reportKindValidator),
    reportDate: v.optional(v.string()),
    sourceRowCount: v.optional(v.number()),
    skippedNames: v.optional(v.array(v.string())),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
    // Set only by a re-import (see `reimportUpload`) — updates this row in
    // place instead of inserting a new one, so re-processing an
    // already-uploaded file doesn't leave a duplicate log entry behind.
    replaceLogId: v.optional(v.id("performanceUploadLog")),
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
    const logFields = {
      filename: args.sourceFile,
      storageId: args.storageId,
      rowsImported: args.snapshots.length,
      uploadedAt: now,
      contentHash: args.contentHash,
      reportKind: args.reportKind,
      reportDate: args.reportDate,
      sourceRowCount: args.sourceRowCount,
      skippedNames: args.skippedNames,
      fileSize: args.fileSize,
      batchId: args.batchId,
    };
    if (args.replaceLogId) {
      await ctx.db.patch(args.replaceLogId, logFields);
    } else {
      await ctx.db.insert("performanceUploadLog", logFields);
    }
    await purgeExcluded(ctx);
    return { rowsImported: args.snapshots.length };
  },
});

async function lookupUploadByHash(
  ctx: { db: QueryCtx["db"] },
  contentHash: string
): Promise<{ filename: string; uploadedAt: number } | null> {
  const existing = await ctx.db
    .query("performanceUploadLog")
    .withIndex("by_contentHash", q => q.eq("contentHash", contentHash))
    .first();
  if (!existing) return null;
  return { filename: existing.filename, uploadedAt: existing.uploadedAt };
}

/** Finds a prior upload of the exact same file (by content hash), so
 * `apiImportReport` can recognize an accidental re-upload — of any report
 * type, since every upload funnels through the same hash check before
 * type-specific parsing — and skip re-importing it. */
export const findUploadByHash = internalQuery({
  args: { contentHash: v.string() },
  handler: async (ctx, { contentHash }) => lookupUploadByHash(ctx, contentHash),
});

/** Same lookup, callable by `apps/api` before it even stages the file —
 * lets the upload route skip the storage write entirely for an obvious
 * re-upload instead of staging-then-deleting. */
export const apiFindUploadByHash = query({
  args: { serverKey: v.string(), contentHash: v.string() },
  handler: async (ctx, { serverKey, contentHash }) => {
    assertServerKey(serverKey);
    return lookupUploadByHash(ctx, contentHash);
  },
});

// Raw drill-down rows are a full point-in-time snapshot of the source
// report, not a delta — replaced wholesale rather than accumulated. Split
// into a clear + chunked-insert pair (rather than one `applyImport` call
// carrying the whole array) because a real Salesforce export's raw rows can
// number in the thousands, which risks Convex's 8192-element array-argument
// limit if shipped as a single call — see performanceUploadParse.ts, the
// only caller.
export const clearRawLeads = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.db.query("performanceRawLeads").collect();
    await Promise.all(existing.map(row => ctx.db.delete(row._id)));
  },
});

export const insertRawLeadsChunk = internalMutation({
  args: { rows: v.array(rawLeadValidator) },
  handler: async (ctx, { rows }): Promise<void> => {
    await Promise.all(
      rows.map(row => ctx.db.insert("performanceRawLeads", row))
    );
  },
});

export const clearRawOpps = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.db.query("performanceRawOpps").collect();
    await Promise.all(existing.map(row => ctx.db.delete(row._id)));
  },
});

export const insertRawOppsChunk = internalMutation({
  args: { rows: v.array(rawOppValidator) },
  handler: async (ctx, { rows }): Promise<void> => {
    await Promise.all(
      rows.map(row => ctx.db.insert("performanceRawOpps", row))
    );
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
      .take(60);
    return rows.map(r => ({
      _id: r._id,
      filename: r.filename,
      rowsImported: r.rowsImported,
      uploadedAt: r.uploadedAt,
      reportKind: r.reportKind,
      reportDate: r.reportDate,
      sourceRowCount: r.sourceRowCount,
      skippedNames: r.skippedNames,
      fileSize: r.fileSize,
      batchId: r.batchId,
    }));
  },
});

// ---------------------------------------------- re-import (from Node action)
// `reimportUpload`/`reimportBatch` live in performanceUploadParse.ts (a "use
// node" action file, needed for the xlsx/CSV parsers) but actions can't
// touch ctx.db directly — these internal query wrappers are how they read
// the admin session and the log rows to reprocess.

/** Actions can't call `requireAdminLogin` directly (it needs `ctx.db`) —
 * this wraps it as an internal query an action can `ctx.runQuery` into. */
export const requireAdminByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
  },
});

export const getUploadLogRow = internalQuery({
  args: { logId: v.id("performanceUploadLog") },
  handler: async (ctx, { logId }) => await ctx.db.get(logId),
});

export const getUploadLogRowsByBatch = internalQuery({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) =>
    await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_batchId", q => q.eq("batchId", batchId))
      .collect(),
});

// ------------------------------------------------------------- interactions
// Raw per-interaction rows (`performanceInteractions`) are a full snapshot
// of the source export for the months it covers, not a delta — wholesale-
// replaced per calendar month on import, same rationale as
// `performanceRawLeads`/`Opps`. See `performanceUploadParse.ts`'s
// `writeInteractions`, the only caller.

const interactionInsertValidator = v.object({
  employeeId: v.id("performanceEmployees"),
  date: v.string(),
  startedAt: v.number(),
  durationSec: v.number(),
  direction: v.optional(v.string()),
});

export const clearInteractionsForMonths = internalMutation({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }): Promise<void> => {
    for (const ym of months) {
      const { start, end } = monthBounds(ym);
      const rows = await ctx.db
        .query("performanceInteractions")
        .withIndex("by_date", q => q.gte("date", start).lte("date", end))
        .collect();
      await Promise.all(rows.map(row => ctx.db.delete(row._id)));
    }
  },
});

export const insertInteractionsChunk = internalMutation({
  args: {
    rows: v.array(interactionInsertValidator),
    sourceFile: v.string(),
    uploadedAt: v.number(),
  },
  handler: async (ctx, { rows, sourceFile, uploadedAt }): Promise<void> => {
    await Promise.all(
      rows.map(row =>
        ctx.db.insert("performanceInteractions", {
          ...row,
          sourceFile,
          uploadedAt,
        })
      )
    );
  },
});

export const logInteractionsImport = internalMutation({
  args: {
    sourceFile: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.optional(v.string()),
    sourceRowCount: v.optional(v.number()),
    skippedNames: v.optional(v.array(v.string())),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
    rowsImported: v.number(),
    replaceLogId: v.optional(v.id("performanceUploadLog")),
  },
  handler: async (ctx, args): Promise<void> => {
    const logFields = {
      filename: args.sourceFile,
      storageId: args.storageId,
      rowsImported: args.rowsImported,
      uploadedAt: Date.now(),
      contentHash: args.contentHash,
      reportKind: "interactions" as const,
      sourceRowCount: args.sourceRowCount,
      skippedNames: args.skippedNames,
      fileSize: args.fileSize,
      batchId: args.batchId,
    };
    if (args.replaceLogId) {
      await ctx.db.patch(args.replaceLogId, logFields);
    } else {
      await ctx.db.insert("performanceUploadLog", logFields);
    }
  },
});
