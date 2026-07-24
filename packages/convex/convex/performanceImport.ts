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

import { type Doc, type Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  fmtDuration,
  MAX_PLAUSIBLE_DAY_SECONDS,
} from "./performance/lib/callImport";
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

/** Per-mutation memoization for `findOrCreateEmployee`, keyed by lowercased
 * name. A bulk import calls it once per snapshot/flagged row — without this,
 * each call did its own `.collect()` of the whole `performanceEmployees`
 * table, so a single file with dozens of rows re-read that table dozens of
 * times over in one mutation. Built once per `applyImport`/`recordScanResults`
 * call and kept current as new employees get inserted mid-loop. */
type EmployeeCache = Map<string, Id<"performanceEmployees">>;

async function loadEmployeeCache(ctx: MutationCtx): Promise<EmployeeCache> {
  const all = await ctx.db.query("performanceEmployees").collect();
  return new Map(all.map(e => [e.name.toLowerCase(), e._id]));
}

async function findOrCreateEmployee(
  ctx: MutationCtx,
  name: string,
  cache: EmployeeCache
): Promise<Id<"performanceEmployees">> {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const existing = cache.get(lower);
  if (existing) return existing;
  const id = await ctx.db.insert("performanceEmployees", {
    name: trimmed,
    active: true,
  });
  cache.set(lower, id);
  return id;
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
  uploadedAt: number,
  cache: EmployeeCache
): Promise<void> {
  const employeeId = await findOrCreateEmployee(ctx, employeeName, cache);
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
 * earlier import. `aggregateLeadReport`/`aggregateOppReport` already skip
 * `EXCLUDED_OWNERS` via `isPerson` before a row is ever built, so a normal
 * import never introduces new excluded-owner data — this is only cleanup
 * for rows written before that filter existed (or before a name was added
 * to the set). Exposed as its own on-demand mutation (`purgeExcludedOwners`
 * below) rather than run automatically on every `applyImport`: it was
 * unconditionally full-scanning `performanceReports`/`RawLeads`/`RawOpps`/
 * `WonOpps` on every single upload for a cleanup that, once run, has
 * nothing left to find. */
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
  const wonOpps = await ctx.db.query("performanceWonOpps").collect();
  await Promise.all(
    wonOpps
      .filter(r => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map(r => ctx.db.delete(r._id))
  );
}

/** On-demand runner for `purgeExcluded` — invoke manually (e.g. from the
 * Convex dashboard) after adding a name to `EXCLUDED_OWNERS`, instead of
 * paying for a full scan of every import table on every routine upload. */
export const purgeExcludedOwners = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    await purgeExcluded(ctx);
  },
});

/** Diagnostic for the milliseconds-vs-seconds import bug fixed in
 * `parseDuration` (`callImport.ts`): lists every stored report row whose
 * loginSec/talkTotalSec/talkAvgSec is still past the physical one-day
 * ceiling, i.e. was imported before the fix and needs a re-import to pick
 * up the corrected value. Run manually from the Convex dashboard — not
 * wired to any client route, since it's a one-off audit, not part of the
 * app's regular read path. */
export const findImplausibleDurations = internalQuery({
  args: {},
  handler: async ctx => {
    const MAX_PLAUSIBLE_DAY_SECONDS = 86_400;
    const rows = await ctx.db.query("performanceReports").collect();
    return rows
      .filter(
        r =>
          (r.loginSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS ||
          (r.talkTotalSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS ||
          (r.talkAvgSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS
      )
      .map(r => ({
        reportDate: r.reportDate,
        employeeId: r.employeeId,
        sourceFile: r.sourceFile,
        loginSec: r.loginSec,
        talkTotalSec: r.talkTotalSec,
        talkAvgSec: r.talkAvgSec,
      }));
  },
});

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

const wonOppValidator = v.object({
  owner: v.string(),
  closeDate: v.string(),
});

const reportKindValidator = v.union(
  v.literal("lead"),
  v.literal("opp"),
  v.literal("call"),
  v.literal("template")
);

const flaggableFieldValidator = v.union(
  v.literal("talkTotalSec"),
  v.literal("talkAvgSec"),
  v.literal("loginSec")
);

const flaggedRowInputValidator = v.object({
  employeeName: v.string(),
  reportDate: v.string(),
  field: flaggableFieldValidator,
  rawSeconds: v.number(),
  rawText: v.string(),
});

/** Upserts a single flagged (implausible-duration) row, keyed on
 * (employeeId, reportDate, field) like `upsertSnapshot`. A re-import of the
 * exact same bad cell refreshes a still-`pending` row's metadata in place;
 * one already `ignored`/`resolved` for that exact raw value is left
 * untouched so a routine re-import can't silently undo an admin's earlier
 * call. A different raw value at the same key (the upstream file changed,
 * still implausibly) reopens it as `pending` for a fresh look. */
async function upsertFlaggedRowById(
  ctx: MutationCtx,
  employeeId: Id<"performanceEmployees">,
  reportDate: string,
  field: "talkTotalSec" | "talkAvgSec" | "loginSec",
  rawSeconds: number,
  rawText: string,
  sourceFile: string,
  uploadedAt: number
): Promise<void> {
  // Same non-unique-index caveat as `upsertSnapshot` — merge into the first
  // match and drop any extras rather than `.unique()`.
  const matches = await ctx.db
    .query("performanceFlaggedRows")
    .withIndex("by_employee_date_field", q =>
      q
        .eq("employeeId", employeeId)
        .eq("reportDate", reportDate)
        .eq("field", field)
    )
    .collect();
  const [existing, ...duplicates] = matches;
  if (duplicates.length > 0) {
    await Promise.all(duplicates.map(d => ctx.db.delete(d._id)));
  }
  if (existing) {
    if (existing.status !== "pending" && existing.rawSeconds === rawSeconds) {
      return;
    }
    await ctx.db.patch(existing._id, {
      rawSeconds,
      rawText,
      sourceFile,
      uploadedAt,
      status: "pending",
      resolvedAt: undefined,
      resolvedValue: undefined,
    });
  } else {
    await ctx.db.insert("performanceFlaggedRows", {
      employeeId,
      reportDate,
      field,
      rawSeconds,
      rawText,
      sourceFile,
      uploadedAt,
      status: "pending",
    });
  }
}

/** `upsertFlaggedRowById`, resolving the employee by name first — the shape
 * an import's `EmployeeSnapshot`-style row arrives in. */
async function upsertFlaggedRow(
  ctx: MutationCtx,
  employeeName: string,
  reportDate: string,
  field: "talkTotalSec" | "talkAvgSec" | "loginSec",
  rawSeconds: number,
  rawText: string,
  sourceFile: string,
  uploadedAt: number,
  cache: EmployeeCache
): Promise<void> {
  const employeeId = await findOrCreateEmployee(ctx, employeeName, cache);
  await upsertFlaggedRowById(
    ctx,
    employeeId,
    reportDate,
    field,
    rawSeconds,
    rawText,
    sourceFile,
    uploadedAt
  );
}

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
    flaggedRows: v.optional(v.array(flaggedRowInputValidator)),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
    // Set only by a re-import (see `reimportUpload`) — updates this row in
    // place instead of inserting a new one, so re-processing an
    // already-uploaded file doesn't leave a duplicate log entry behind.
    replaceLogId: v.optional(v.id("performanceUploadLog")),
  },
  handler: async (ctx, args): Promise<{ rowsImported: number }> => {
    const now = Date.now();
    // A re-import doesn't necessarily carry a fresh `uploadedBy` (the
    // original uploader isn't necessarily who clicked "re-import") — fall
    // back to whatever the row already had instead of blanking it out.
    const existingLog = args.replaceLogId
      ? await ctx.db.get(args.replaceLogId)
      : null;
    const uploadedBy = args.uploadedBy ?? existingLog?.uploadedBy;
    const employeeCache = await loadEmployeeCache(ctx);
    for (const snap of args.snapshots) {
      await upsertSnapshot(
        ctx,
        snap.employeeName,
        snap.reportDate,
        snap.fields,
        args.sourceFile,
        now,
        employeeCache
      );
    }
    for (const flagged of args.flaggedRows ?? []) {
      await upsertFlaggedRow(
        ctx,
        flagged.employeeName,
        flagged.reportDate,
        flagged.field,
        flagged.rawSeconds,
        flagged.rawText,
        args.sourceFile,
        now,
        employeeCache
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
      uploadedBy,
    };
    if (args.replaceLogId) {
      await ctx.db.patch(args.replaceLogId, logFields);
    } else {
      await ctx.db.insert("performanceUploadLog", logFields);
    }
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
//
// The clear side is itself batched (`.take` + report `more`, looped by the
// caller) rather than a single `.collect()` + `Promise.all(delete)` — once
// the *stored* table (independent of whatever the new upload contains)
// crosses Convex's 4096-reads-per-execution ceiling, an unbounded clear
// fails every subsequent upload's clear-then-reimport step, no matter how
// small the new file is (the "Opp Report kann nicht verarbeitet werden"
// crash this fixes: shrinking the new file never helped, because the crash
// was in clearing old data, not parsing new data).
const CLEAR_BATCH_SIZE = 500;

export const clearRawLeads = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceRawLeads")
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map(row => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
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
  handler: async (ctx): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceRawOpps")
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map(row => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
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

export const clearWonOpps = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceWonOpps")
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map(row => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
  },
});

export const insertWonOppsChunk = internalMutation({
  args: { rows: v.array(wonOppValidator) },
  handler: async (ctx, { rows }): Promise<void> => {
    await Promise.all(
      rows.map(row => ctx.db.insert("performanceWonOpps", row))
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
      .withIndex("by_uploadedAt")
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
      uploadedBy: r.uploadedBy,
      scannedForFlags: r.scannedForFlags,
    }));
  },
});

/** Call-report uploads the browser hasn't yet re-checked client-side for
 * implausible-duration cells (see `scannedForFlags` in schema.ts) — covers
 * every file imported before that check existed. Resolves each one's
 * storage URL server-side (the only thing that needs `ctx.storage`) so the
 * client can `fetch()` the bytes directly and do the actual parsing itself,
 * instead of spending a Convex action on a re-check of old history. */
export interface UnscannedCallUpload {
  _id: Id<"performanceUploadLog">;
  filename: string;
  fileUrl: string;
  reportDate?: string;
  uploadedAt: number;
  batchId?: string;
}

export const listUnscannedCallUploads = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<UnscannedCallUpload[]> => {
    await requireAdminLogin(ctx, token);
    const rows = await ctx.db
      .query("performanceUploadLog")
      .filter(q => q.eq(q.field("reportKind"), "call"))
      .collect();
    const unscanned = rows.filter(r => !r.scannedForFlags);
    const withUrls = await Promise.all(
      unscanned.map(async (r): Promise<UnscannedCallUpload | null> => {
        const fileUrl = await ctx.storage.getUrl(r.storageId);
        if (fileUrl === null) return null;
        return {
          _id: r._id,
          filename: r.filename,
          fileUrl,
          reportDate: r.reportDate,
          uploadedAt: r.uploadedAt,
          batchId: r.batchId,
        };
      })
    );
    return withUrls.filter((r): r is UnscannedCallUpload => r !== null);
  },
});

/** Team roster for the client-side rescan to match agent names against —
 * same set `getTeamEmployeeNames` gives the server-side import path, just
 * exposed to a signed-in admin instead of `internal.*`-only. */
export const listEmployeeNames = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<string[]> => {
    await requireAdminLogin(ctx, token);
    const employees = await ctx.db.query("performanceEmployees").collect();
    return employees
      .filter(e => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map(e => e.name);
  },
});

/** Records what a client-side rescan of one already-uploaded call report
 * found, without re-running the full import pipeline (`applyImport`) —
 * the report's other metrics were already imported correctly the first
 * time; a rescan only ever finds *additional* implausible-duration cells
 * the parser now catches, so this just files those and marks the upload as
 * checked. Safe to call repeatedly (`upsertFlaggedRow`'s usual dedup). */
export const recordScanResults = mutation({
  args: {
    token: v.string(),
    logId: v.id("performanceUploadLog"),
    flaggedRows: v.array(flaggedRowInputValidator),
  },
  handler: async (
    ctx,
    { token, logId, flaggedRows }
  ): Promise<{ flagged: number }> => {
    await requireAdminLogin(ctx, token);
    const log = await ctx.db.get(logId);
    if (!log) {
      throw new ConvexError({
        code: "not_found",
        message: "Upload-log entry not found.",
      });
    }
    const now = Date.now();
    const employeeCache = await loadEmployeeCache(ctx);
    for (const flagged of flaggedRows) {
      await upsertFlaggedRow(
        ctx,
        flagged.employeeName,
        flagged.reportDate,
        flagged.field,
        flagged.rawSeconds,
        flagged.rawText,
        log.filename,
        now,
        employeeCache
      );
    }
    await ctx.db.patch(logId, { scannedForFlags: true });
    return { flagged: flaggedRows.length };
  },
});

/** Pending call-report rows needing admin attention (see
 * `performanceFlaggedRows` in schema.ts), newest first, joined with the
 * employee's current name for display. */
export const listFlaggedRows = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
    const rows = await ctx.db
      .query("performanceFlaggedRows")
      .withIndex("by_status", q => q.eq("status", "pending"))
      .order("desc")
      .collect();
    const employees = await ctx.db.query("performanceEmployees").collect();
    const nameById = new Map(employees.map(e => [e._id, e.name]));
    return rows.map(r => ({
      _id: r._id,
      employeeId: r.employeeId,
      employeeName: nameById.get(r.employeeId) ?? "?",
      reportDate: r.reportDate,
      field: r.field,
      rawSeconds: r.rawSeconds,
      rawText: r.rawText,
      sourceFile: r.sourceFile,
      uploadedAt: r.uploadedAt,
    }));
  },
});

/** Resolves one flagged row: `ignore` just dismisses it (the field stays
 * unmeasured in `performanceReports`); `force` writes the rejected raw value
 * through as-is (the admin has confirmed it's real, e.g. a genuinely long
 * shift); `edit` writes an admin-supplied corrected value instead. Both
 * writing paths create the `performanceReports` row if this employee/day had
 * no other measured field to have created one already (see
 * `buildCallSnapshots`: a row with nothing left after a flagged field never
 * reaches `upsertSnapshot`). */
export const resolveFlaggedRow = mutation({
  args: {
    token: v.string(),
    id: v.id("performanceFlaggedRows"),
    action: v.union(v.literal("ignore"), v.literal("force"), v.literal("edit")),
    value: v.optional(v.number()),
  },
  handler: async (ctx, { token, id, action, value }): Promise<void> => {
    await requireAdminLogin(ctx, token);
    const row = await ctx.db.get(id);
    if (!row) {
      throw new ConvexError({
        code: "not_found",
        message: "Flagged row not found.",
      });
    }

    if (action === "ignore") {
      await ctx.db.patch(id, { status: "ignored", resolvedAt: Date.now() });
      return;
    }

    const applied = action === "force" ? row.rawSeconds : value;
    if (applied === undefined) {
      throw new ConvexError({
        code: "validation",
        message: "A corrected value (in seconds) is required.",
      });
    }

    const report = await ctx.db
      .query("performanceReports")
      .withIndex("by_employee_date", q =>
        q.eq("employeeId", row.employeeId).eq("reportDate", row.reportDate)
      )
      .first();
    const patch: Partial<Doc<"performanceReports">> = { [row.field]: applied };
    if (report) {
      await ctx.db.patch(report._id, patch);
    } else {
      await ctx.db.insert("performanceReports", {
        employeeId: row.employeeId,
        reportDate: row.reportDate,
        sourceFile: row.sourceFile,
        uploadedAt: Date.now(),
        ...patch,
      });
    }
    await ctx.db.patch(id, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedValue: applied,
    });
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

/** Batched like `clearRawLeads`/`clearRawOpps`/`clearWonOpps` above — deletes
 * up to `CLEAR_BATCH_SIZE` rows across the given months per call and reports
 * `more` whenever it deleted anything, so the caller loops until a full pass
 * over every month finds nothing left instead of risking the same unbounded
 * collect-then-delete blowing Convex's per-execution read limit on a month
 * with heavy interaction volume. */
export const clearInteractionsForMonths = internalMutation({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }): Promise<{ more: boolean }> => {
    let remaining = CLEAR_BATCH_SIZE;
    let deletedAny = false;
    for (const ym of months) {
      if (remaining <= 0) break;
      const { start, end } = monthBounds(ym);
      const batch = await ctx.db
        .query("performanceInteractions")
        .withIndex("by_date", q => q.gte("date", start).lte("date", end))
        .take(remaining);
      if (batch.length > 0) {
        await Promise.all(batch.map(row => ctx.db.delete(row._id)));
        deletedAny = true;
        remaining -= batch.length;
      }
    }
    return { more: deletedAny };
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
    uploadedBy: v.optional(v.string()),
    rowsImported: v.number(),
    replaceLogId: v.optional(v.id("performanceUploadLog")),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLog = args.replaceLogId
      ? await ctx.db.get(args.replaceLogId)
      : null;
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
      uploadedBy: args.uploadedBy ?? existingLog?.uploadedBy,
    };
    if (args.replaceLogId) {
      await ctx.db.patch(args.replaceLogId, logFields);
    } else {
      await ctx.db.insert("performanceUploadLog", logFields);
    }
  },
});
