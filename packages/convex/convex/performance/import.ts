import {
  internalMutation,
  internalQuery,
  serverMutation,
  serverQuery,
  userMutation,
  userQuery,
} from "../functions";
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

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { EXCLUDED_OWNERS } from "./lib/salesforceImport";
import { type SnapshotFields } from "./lib/types";

/** A one-shot URL `apps/api` POSTs the original report file to (Convex
 * file storage), before parsing and importing it. Public (not internal) —
 * `apps/api` calls this directly via the Convex HTTP client, which can
 * only reach public functions; the `serverKey` argument is what actually
 * restricts the caller. */
export const apiGenerateUploadUrl = serverMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Discards a staged file — used when the report turned out to have no
 * activity to import (see `apiImportReport`'s `{status: "empty"}`), so an
 * empty day's file doesn't linger in storage forever. */
export const apiDeleteStorage = serverMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }): Promise<void> => {
    await ctx.storage.delete(storageId);
  },
});

// ----------------------------------------------------------------- upserts

/** Per-mutation memoization for `findOrCreateEmployee`, keyed by lowercased
 * name. A bulk import calls it once per snapshot/flagged row — without this,
 * each call did its own `.collect()` of the whole `performanceEmployees`
 * table, so a single file with dozens of rows re-read that table dozens of
 * times over in one mutation. Built once per `applyImport`/`recordScanResults`
 * call and kept current as new employees get inserted mid-loop. */
type EmployeeCache = Map<string, Id<"performanceEmployees">>;

async function loadEmployeeCache(
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<EmployeeCache> {
  const all = await ctx.db
    .query("performanceEmployees")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  return new Map(all.map((e) => [e.name.toLowerCase(), e._id]));
}

async function findOrCreateEmployee(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  name: string,
  cache: EmployeeCache,
): Promise<Id<"performanceEmployees">> {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const existing = cache.get(lower);
  if (existing) return existing;
  const id = await ctx.db.insert("performanceEmployees", {
    name: trimmed,
    active: true,
    companyId,
  });
  cache.set(lower, id);
  return id;
}

/** Partial upsert: only the supplied fields are updated, so a Lead report
 * and an Opportunity report for the same employee/day complement each
 * other instead of overwriting. */
async function upsertSnapshot(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  employeeName: string,
  reportDate: string,
  fields: SnapshotFields,
  sourceFile: string,
  uploadedAt: number,
  cache: EmployeeCache,
  clearFields: (keyof SnapshotFields)[] = [],
): Promise<void> {
  const employeeId = await findOrCreateEmployee(ctx, companyId, employeeName, cache);
  const cleared = Object.fromEntries(
    clearFields.filter((key) => !(key in fields)).map((key) => [key, undefined]),
  ) as SnapshotFields;
  // Convex indexes aren't unique constraints (see the schema comment on
  // by_employee_date), so more than one row can in principle match — e.g. a
  // raced concurrent upload. Merge into the first match and drop any extras
  // instead of using .unique(), which throws on ambiguity and would abort
  // the entire import over a single duplicate row.
  const matches = await ctx.db
    .query("performanceReports")
    .withIndex("by_employee_date", (q) =>
      q.eq("employeeId", employeeId).eq("reportDate", reportDate),
    )
    .collect();
  const [existing, ...duplicates] = matches;
  if (duplicates.length > 0) {
    await Promise.all(duplicates.map((d) => ctx.db.delete(d._id)));
  }
  if (existing) {
    // A re-import (fixing a past bug, or an admin re-uploading the same
    // day's report) usually recomputes byte-identical values — a day's
    // historical data doesn't change once reported, only new days get
    // new data. Skipping a no-op write avoids burning a mutation on
    // every row of every file in a bulk re-import for nothing.
    const next = { ...fields, ...cleared };
    const unchanged = (Object.keys(next) as (keyof SnapshotFields)[]).every(
      (key) => existing[key] === next[key],
    );
    if (!unchanged) {
      await ctx.db.patch(existing._id, { ...next, sourceFile, uploadedAt });
    }
  } else {
    await ctx.db.insert("performanceReports", {
      employeeId,
      companyId,
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
  const excluded = employees.filter((e) => EXCLUDED_OWNERS.has(e.name.toLowerCase()));
  const excludedIds = new Set(excluded.map((e) => e._id));

  if (excludedIds.size > 0) {
    const reports = await ctx.db.query("performanceReports").collect();
    await Promise.all(
      reports.filter((r) => excludedIds.has(r.employeeId)).map((r) => ctx.db.delete(r._id)),
    );
    await Promise.all(excluded.map((e) => ctx.db.delete(e._id)));
  }
  const rawLeads = await ctx.db.query("performanceRawLeads").collect();
  await Promise.all(
    rawLeads
      .filter((r) => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map((r) => ctx.db.delete(r._id)),
  );
  const rawOpps = await ctx.db.query("performanceRawOpps").collect();
  await Promise.all(
    rawOpps
      .filter((r) => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map((r) => ctx.db.delete(r._id)),
  );
  const wonOpps = await ctx.db.query("performanceWonOpps").collect();
  await Promise.all(
    wonOpps
      .filter((r) => EXCLUDED_OWNERS.has(r.owner.toLowerCase()))
      .map((r) => ctx.db.delete(r._id)),
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
  handler: async (ctx) => {
    const MAX_PLAUSIBLE_DAY_SECONDS = 86_400;
    const rows = await ctx.db.query("performanceReports").collect();
    return rows
      .filter(
        (r) =>
          (r.loginSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS ||
          (r.talkTotalSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS ||
          (r.talkAvgSec ?? 0) > MAX_PLAUSIBLE_DAY_SECONDS,
      )
      .map((r) => ({
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
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<string[]> => {
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return employees.filter((e) => !EXCLUDED_OWNERS.has(e.name.toLowerCase())).map((e) => e.name);
  },
});

/** Same roster as `getTeamEmployeeNames`, with each employee's id — the
 * interactions importer needs the id (a foreign key into
 * `performanceInteractions`), not just the name `matchEmployee` returns. */
export const getTeamEmployeesWithId = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    { companyId },
  ): Promise<{ id: Id<"performanceEmployees">; name: string }[]> => {
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return employees
      .filter((e) => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map((e) => ({ id: e._id, name: e.name }));
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
  v.literal("template"),
);

const flaggableFieldValidator = v.union(
  v.literal("talkTotalSec"),
  v.literal("talkAvgSec"),
  v.literal("loginSec"),
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
  companyId: Id<"companies">,
  employeeId: Id<"performanceEmployees">,
  reportDate: string,
  field: "talkTotalSec" | "talkAvgSec" | "loginSec",
  rawSeconds: number,
  rawText: string,
  sourceFile: string,
  uploadedAt: number,
): Promise<void> {
  // Same non-unique-index caveat as `upsertSnapshot` — merge into the first
  // match and drop any extras rather than `.unique()`.
  const matches = await ctx.db
    .query("performanceFlaggedRows")
    .withIndex("by_employee_date_field", (q) =>
      q.eq("employeeId", employeeId).eq("reportDate", reportDate).eq("field", field),
    )
    .collect();
  const [existing, ...duplicates] = matches;
  if (duplicates.length > 0) {
    await Promise.all(duplicates.map((d) => ctx.db.delete(d._id)));
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
      companyId,
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
  companyId: Id<"companies">,
  employeeName: string,
  reportDate: string,
  field: "talkTotalSec" | "talkAvgSec" | "loginSec",
  rawSeconds: number,
  rawText: string,
  sourceFile: string,
  uploadedAt: number,
  cache: EmployeeCache,
): Promise<void> {
  const employeeId = await findOrCreateEmployee(ctx, companyId, employeeName, cache);
  await upsertFlaggedRowById(
    ctx,
    companyId,
    employeeId,
    reportDate,
    field,
    rawSeconds,
    rawText,
    sourceFile,
    uploadedAt,
  );
}

export const applyImport = internalMutation({
  args: {
    companyId: v.id("companies"),
    snapshots: v.array(snapshotValidator),
    sourceFile: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.optional(v.string()),
    reportKind: v.optional(reportKindValidator),
    reportDate: v.optional(v.string()),
    reportDateFrom: v.optional(v.string()),
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
    // Lead/Opp imports still have to refill the drill-down tables after
    // this; they write the log row last (`recordUpload`), so a failure in
    // between leaves no log entry that would block the retry as duplicate.
    deferLog: v.optional(v.boolean()),
    // Fields this report knows are "not measured" for every row it writes,
    // removed from a stored row that had them — a call report without an
    // outbound column clears the Outbound value older imports filled from
    // "Bearbeitet".
    clearFields: v.optional(v.array(v.literal("callsOutbound"))),
  },
  handler: async (ctx, args): Promise<{ rowsImported: number }> => {
    const now = Date.now();
    const employeeCache = await loadEmployeeCache(ctx, args.companyId);
    for (const snap of args.snapshots) {
      await upsertSnapshot(
        ctx,
        args.companyId,
        snap.employeeName,
        snap.reportDate,
        snap.fields,
        args.sourceFile,
        now,
        employeeCache,
        args.clearFields,
      );
    }
    for (const flagged of args.flaggedRows ?? []) {
      await upsertFlaggedRow(
        ctx,
        args.companyId,
        flagged.employeeName,
        flagged.reportDate,
        flagged.field,
        flagged.rawSeconds,
        flagged.rawText,
        args.sourceFile,
        now,
        employeeCache,
      );
    }
    if (!args.deferLog) {
      await writeUploadLog(ctx, { ...args, rowsImported: args.snapshots.length });
    }
    return { rowsImported: args.snapshots.length };
  },
});

interface UploadLogInput {
  companyId: Id<"companies">;
  sourceFile: string;
  storageId: Id<"_storage">;
  rowsImported: number;
  contentHash?: string;
  reportKind?: Doc<"performanceUploadLog">["reportKind"];
  reportDate?: string;
  reportDateFrom?: string;
  sourceRowCount?: number;
  skippedNames?: string[];
  fileSize?: number;
  batchId?: string;
  uploadedBy?: string;
  replaceLogId?: Id<"performanceUploadLog">;
}

async function writeUploadLog(ctx: MutationCtx, args: UploadLogInput): Promise<void> {
  // A re-import doesn't necessarily carry a fresh `uploadedBy` (the
  // original uploader isn't necessarily who clicked "re-import") — fall
  // back to whatever the row already had instead of blanking it out.
  const existingLog = args.replaceLogId ? await ctx.db.get(args.replaceLogId) : null;
  const logFields = {
    companyId: args.companyId,
    filename: args.sourceFile,
    storageId: args.storageId,
    rowsImported: args.rowsImported,
    uploadedAt: Date.now(),
    contentHash: args.contentHash,
    reportKind: args.reportKind,
    reportDate: args.reportDate,
    reportDateFrom:
      args.reportDateFrom && args.reportDateFrom !== args.reportDate
        ? args.reportDateFrom
        : undefined,
    sourceRowCount: args.sourceRowCount,
    skippedNames: args.skippedNames,
    fileSize: args.fileSize,
    batchId: args.batchId,
    uploadedBy: args.uploadedBy ?? existingLog?.uploadedBy,
  };
  if (existingLog) {
    await ctx.db.patch(existingLog._id, logFields);
  } else {
    await ctx.db.insert("performanceUploadLog", logFields);
  }
}

const uploadLogArgs = {
  companyId: v.id("companies"),
  sourceFile: v.string(),
  storageId: v.id("_storage"),
  rowsImported: v.number(),
  contentHash: v.optional(v.string()),
  reportKind: v.optional(
    v.union(
      v.literal("lead"),
      v.literal("opp"),
      v.literal("call"),
      v.literal("template"),
      v.literal("interactions"),
      v.literal("wallbox_members"),
      v.literal("wallbox_opps"),
    ),
  ),
  reportDate: v.optional(v.string()),
  reportDateFrom: v.optional(v.string()),
  sourceRowCount: v.optional(v.number()),
  skippedNames: v.optional(v.array(v.string())),
  fileSize: v.optional(v.number()),
  batchId: v.optional(v.string()),
  uploadedBy: v.optional(v.string()),
  replaceLogId: v.optional(v.id("performanceUploadLog")),
};

/** The last step of a Lead/Opp import: the log row, plus which report the
 * drill-down tables now hold (when they were replaced). */
export const recordUpload = internalMutation({
  args: {
    ...uploadLogArgs,
    rawLeadsReportDate: v.optional(v.string()),
    rawOppsReportDate: v.optional(v.string()),
  },
  handler: async (ctx, { rawLeadsReportDate, rawOppsReportDate, ...log }): Promise<void> => {
    await writeUploadLog(ctx, log);
    if (rawLeadsReportDate || rawOppsReportDate) {
      const state = await loadImportState(ctx, log.companyId);
      const patch = {
        ...(rawLeadsReportDate ? { rawLeadsReportDate } : {}),
        ...(rawOppsReportDate ? { rawOppsReportDate } : {}),
      };
      if (state) await ctx.db.patch(state._id, patch);
      else await ctx.db.insert("performanceImportState", { companyId: log.companyId, ...patch });
    }
  },
});

// ------------------------------------------------------- import state/lock

async function loadImportState(
  ctx: { db: QueryCtx["db"] },
  companyId: Id<"companies">,
): Promise<Doc<"performanceImportState"> | null> {
  return await ctx.db
    .query("performanceImportState")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .first();
}

/** Which report date the drill-down tables currently hold. Dashboards
 * imported before `performanceImportState` existed fall back to the date
 * stamped on the stored rows (all rows of a table come from one report). */
export const getRawReportDates = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ leads?: string; opps?: string }> => {
    const state = await loadImportState(ctx, companyId);
    const leads =
      state?.rawLeadsReportDate ??
      (
        await ctx.db
          .query("performanceRawLeads")
          .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId))
          .first()
      )?.reportDate;
    const opps =
      state?.rawOppsReportDate ??
      (
        await ctx.db
          .query("performanceRawOpps")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .first()
      )?.reportDate;
    return { leads, opps };
  },
});

// Convex actions run for at most 10 minutes; a lock older than that belongs
// to an import that died without releasing it.
const IMPORT_LOCK_MS = 10 * 60_000;

/** Takes the dashboard's import lock for `token`, or throws the German
 * "already running" message while another import holds it. Re-entrant for
 * the same token (a batch re-import takes it once per file). */
export const acquireImportLock = internalMutation({
  args: { companyId: v.id("companies"), token: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, { companyId, token, by }): Promise<void> => {
    const now = Date.now();
    const state = await loadImportState(ctx, companyId);
    if (state?.lockToken && state.lockToken !== token && (state.lockedUntil ?? 0) > now) {
      throw new ConvexError({
        code: "import_locked",
        message: "Gerade läuft schon ein Import für dieses Dashboard – bitte kurz warten.",
      });
    }
    const lock = { lockToken: token, lockedUntil: now + IMPORT_LOCK_MS, lockedBy: by };
    if (state) await ctx.db.patch(state._id, lock);
    else await ctx.db.insert("performanceImportState", { companyId, ...lock });
  },
});

export const releaseImportLock = internalMutation({
  args: { companyId: v.id("companies"), token: v.string() },
  handler: async (ctx, { companyId, token }): Promise<void> => {
    const state = await loadImportState(ctx, companyId);
    if (state?.lockToken === token) {
      await ctx.db.patch(state._id, {
        lockToken: undefined,
        lockedUntil: undefined,
        lockedBy: undefined,
      });
    }
  },
});

async function lookupUploadByHash(
  ctx: { db: QueryCtx["db"] },
  companyId: Id<"companies">,
  contentHash: string,
): Promise<{ filename: string; uploadedAt: number } | null> {
  const existing = await ctx.db
    .query("performanceUploadLog")
    .withIndex("by_company_contentHash", (q) =>
      q.eq("companyId", companyId).eq("contentHash", contentHash),
    )
    .first();
  if (!existing) return null;
  return { filename: existing.filename, uploadedAt: existing.uploadedAt };
}

/** Finds a prior upload of the exact same file (by content hash) *within
 * the same company* — two different client companies uploading
 * byte-identical files (e.g. the blank template) must not collide — so
 * `apiImportReport` can recognize an accidental re-upload and skip
 * re-importing it. */
export const findUploadByHash = internalQuery({
  args: { companyId: v.id("companies"), contentHash: v.string() },
  handler: async (ctx, { companyId, contentHash }) =>
    lookupUploadByHash(ctx, companyId, contentHash),
});

/** Same lookup, callable by `apps/api` before it even stages the file —
 * lets the upload route skip the storage write entirely for an obvious
 * re-upload instead of staging-then-deleting. */
export const apiFindUploadByHash = serverQuery({
  args: {
    companyId: v.id("companies"),
    contentHash: v.string(),
  },
  handler: async (ctx, { companyId, contentHash }) => {
    return lookupUploadByHash(ctx, companyId, contentHash);
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

// NOTE: each of these three clear/insert pairs used to operate on the
// *entire* table with no company filter — a real bug in a multi-tenant
// world (importing one company's Salesforce export would wipe every other
// company's raw leads/opps/won-opps too, since these are wholesale-replaced
// snapshots, not deltas). Every clear is now scoped to the one company
// whose import is in flight.

export const clearRawLeads = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceRawLeads")
      .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId))
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map((row) => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
  },
});

export const insertRawLeadsChunk = internalMutation({
  args: { companyId: v.id("companies"), rows: v.array(rawLeadValidator) },
  handler: async (ctx, { companyId, rows }): Promise<void> => {
    await Promise.all(
      rows.map((row) => ctx.db.insert("performanceRawLeads", { ...row, companyId })),
    );
  },
});

export const clearRawOpps = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceRawOpps")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map((row) => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
  },
});

export const insertRawOppsChunk = internalMutation({
  args: { companyId: v.id("companies"), rows: v.array(rawOppValidator) },
  handler: async (ctx, { companyId, rows }): Promise<void> => {
    await Promise.all(
      rows.map((row) => ctx.db.insert("performanceRawOpps", { ...row, companyId })),
    );
  },
});

export const clearWonOpps = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceWonOpps")
      .withIndex("by_company_closeDate", (q) => q.eq("companyId", companyId))
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map((row) => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
  },
});

export const insertWonOppsChunk = internalMutation({
  args: { companyId: v.id("companies"), rows: v.array(wonOppValidator) },
  handler: async (ctx, { companyId, rows }): Promise<void> => {
    await Promise.all(
      rows.map((row) => ctx.db.insert("performanceWonOpps", { ...row, companyId })),
    );
  },
});

/** Admin-only functions below all act on one explicitly chosen dashboard. */
async function requireCompany(ctx: QueryCtx, companyId: Id<"companies">): Promise<void> {
  if (!(await ctx.db.get(companyId))) {
    throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
  }
}

const UPLOAD_LOG_PAGE = 60;
const UPLOAD_LOG_MAX = 1000;

/** Most recent uploads, for the admin upload page's log table. `limit`
 * grows with "Mehr laden"; `hasMore` says whether older rows exist. */
export const listUploadLog = userQuery({
  role: "admin",
  args: { companyId: v.id("companies"), limit: v.optional(v.number()) },
  handler: async (ctx, { companyId, limit }) => {
    await requireCompany(ctx, companyId);
    const take = Math.min(Math.max(Math.floor(limit ?? UPLOAD_LOG_PAGE), 1), UPLOAD_LOG_MAX);
    const fetched = await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(take + 1);
    const rows = fetched.slice(0, take);
    return {
      hasMore: fetched.length > take,
      rows: rows.map((r) => ({
        _id: r._id,
        filename: r.filename,
        rowsImported: r.rowsImported,
        uploadedAt: r.uploadedAt,
        reportKind: r.reportKind,
        reportDate: r.reportDate,
        reportDateFrom: r.reportDateFrom,
        sourceRowCount: r.sourceRowCount,
        skippedNames: r.skippedNames,
        fileSize: r.fileSize,
        batchId: r.batchId,
        uploadedBy: r.uploadedBy,
        scannedForFlags: r.scannedForFlags,
      })),
    };
  },
});

const DAILY_STATUS_KINDS = [
  "lead",
  "opp",
  "wallbox_members",
  "wallbox_opps",
  "call",
  "interactions",
] as const;
type DailyStatusKind = (typeof DAILY_STATUS_KINDS)[number];

/** "Tagesstatus" on the upload page: for each of the given report days
 * (the client passes the last few workdays, Berlin calendar), which of the
 * four daily exports have been imported. A multi-day interactions or call
 * file counts for every day it covers. */
export const dailyUploadStatus = userQuery({
  role: "admin",
  args: { companyId: v.id("companies"), dates: v.array(v.string()) },
  handler: async (
    ctx,
    { companyId, dates },
  ): Promise<{ date: string; kinds: DailyStatusKind[] }[]> => {
    await requireCompany(ctx, companyId);
    const days = [...new Set(dates)]
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .slice(-14);
    if (days.length === 0) return [];
    const from = days[0];
    const to = days[days.length - 1];
    // Multi-day files are filed under their last day; look a month past
    // `to` so one that ends later but starts inside the window still counts.
    const until = new Date(Date.parse(`${to}T00:00:00Z`) + 31 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const rows = await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_reportDate", (q) =>
        q.eq("companyId", companyId).gte("reportDate", from).lte("reportDate", until),
      )
      .take(2000);
    const byDay = new Map(days.map((d) => [d, new Set<DailyStatusKind>()]));
    for (const r of rows) {
      const kind = r.reportKind;
      if (!r.reportDate || !kind || !(DAILY_STATUS_KINDS as readonly string[]).includes(kind)) {
        continue;
      }
      const start = r.reportDateFrom ?? r.reportDate;
      for (const d of days) {
        if (d >= start && d <= r.reportDate) byDay.get(d)!.add(kind as DailyStatusKind);
      }
    }
    return days.map((date) => ({
      date,
      kinds: DAILY_STATUS_KINDS.filter((k) => byDay.get(date)!.has(k)),
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

export const listUnscannedCallUploads = userQuery({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<UnscannedCallUpload[]> => {
    await requireCompany(ctx, companyId);
    const rows = await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", companyId))
      .filter((q) => q.eq(q.field("reportKind"), "call"))
      .collect();
    const unscanned = rows.filter((r) => !r.scannedForFlags);
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
      }),
    );
    return withUrls.filter((r): r is UnscannedCallUpload => r !== null);
  },
});

/** Team roster for the client-side rescan to match agent names against —
 * same set `getTeamEmployeeNames` gives the server-side import path, just
 * exposed to a signed-in admin instead of `internal.*`-only. */
export const listEmployeeNames = userQuery({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<string[]> => {
    await requireCompany(ctx, companyId);
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return employees.filter((e) => !EXCLUDED_OWNERS.has(e.name.toLowerCase())).map((e) => e.name);
  },
});

/** Records what a client-side rescan of one already-uploaded call report
 * found, without re-running the full import pipeline (`applyImport`) —
 * the report's other metrics were already imported correctly the first
 * time; a rescan only ever finds *additional* implausible-duration cells
 * the parser now catches, so this just files those and marks the upload as
 * checked. Safe to call repeatedly (`upsertFlaggedRow`'s usual dedup). */
export const recordScanResults = userMutation({
  role: "admin",
  args: {
    logId: v.id("performanceUploadLog"),
    flaggedRows: v.array(flaggedRowInputValidator),
  },
  handler: async (ctx, { logId, flaggedRows }): Promise<{ flagged: number }> => {
    const log = await ctx.db.get(logId);
    if (!log || !log.companyId) {
      throw new ConvexError({
        code: "not_found",
        message: "Upload-log entry not found.",
      });
    }
    const companyId = log.companyId;
    const now = Date.now();
    const employeeCache = await loadEmployeeCache(ctx, companyId);
    for (const flagged of flaggedRows) {
      await upsertFlaggedRow(
        ctx,
        companyId,
        flagged.employeeName,
        flagged.reportDate,
        flagged.field,
        flagged.rawSeconds,
        flagged.rawText,
        log.filename,
        now,
        employeeCache,
      );
    }
    await ctx.db.patch(logId, { scannedForFlags: true });
    return { flagged: flaggedRows.length };
  },
});

/** Pending call-report rows needing admin attention (see
 * `performanceFlaggedRows` in schema.ts), newest first, joined with the
 * employee's current name for display. */
export const listFlaggedRows = userQuery({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompany(ctx, companyId);
    const rows = await ctx.db
      .query("performanceFlaggedRows")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "pending"))
      .order("desc")
      .collect();
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const nameById = new Map(employees.map((e) => [e._id, e.name]));
    return rows.map((r) => ({
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
export const resolveFlaggedRow = userMutation({
  role: "admin",
  args: {
    id: v.id("performanceFlaggedRows"),
    action: v.union(v.literal("ignore"), v.literal("force"), v.literal("edit")),
    value: v.optional(v.number()),
  },
  handler: async (ctx, { id, action, value }): Promise<void> => {
    const row = await ctx.db.get(id);
    if (!row || !row.companyId) {
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
      .withIndex("by_employee_date", (q) =>
        q.eq("employeeId", row.employeeId).eq("reportDate", row.reportDate),
      )
      .first();
    const patch: Partial<Doc<"performanceReports">> = { [row.field]: applied };
    if (report) {
      await ctx.db.patch(report._id, patch);
    } else {
      await ctx.db.insert("performanceReports", {
        employeeId: row.employeeId,
        companyId: row.companyId,
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

/** The id of an earlier log row of the same file in `companyId`, so a call
 * or interactions report fanned out to other dashboards replaces its row
 * there on a re-import instead of adding a second one. */
export const findUploadLogIdByHash = internalQuery({
  args: { companyId: v.id("companies"), contentHash: v.string() },
  handler: async (ctx, { companyId, contentHash }) => {
    if (!contentHash) return null;
    const row = await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_contentHash", (q) =>
        q.eq("companyId", companyId).eq("contentHash", contentHash),
      )
      .first();
    return row?._id ?? null;
  },
});

/** Upload-log row for a Wallbox report (written last, after the data). */
export const logWallboxImport = internalMutation({
  args: {
    ...uploadLogArgs,
    reportKind: v.union(v.literal("wallbox_members"), v.literal("wallbox_opps")),
  },
  handler: async (ctx, args): Promise<void> => {
    await writeUploadLog(ctx, args);
  },
});

/** Lets the re-import actions confirm the dashboard exists (the admin
 * check itself happens in the `userAction` builder). */
export const companyExists = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<boolean> => (await ctx.db.get(companyId)) !== null,
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
      .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
      .collect(),
});

// ------------------------------------------------------------- interactions
// Raw per-interaction rows (`performanceInteractions`) are a full snapshot
// of the source export for the days it covers, not a delta — replaced for
// exactly the date range the file contains (its first to its last day), so
// a file with only yesterday never wipes the rest of the month. See
// `uploadParse.ts`'s `writeInteractions`, the only caller.

const interactionInsertValidator = v.object({
  employeeId: v.id("performanceEmployees"),
  date: v.string(),
  startedAt: v.number(),
  durationSec: v.number(),
  direction: v.optional(v.string()),
});

/** Deletes up to `CLEAR_BATCH_SIZE` interactions dated `from`..`to` (ISO,
 * inclusive) per call — batched like `clearRawLeads`, the caller loops
 * while `more`. */
export const clearInteractionsInRange = internalMutation({
  args: { companyId: v.id("companies"), from: v.string(), to: v.string() },
  handler: async (ctx, { companyId, from, to }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceInteractions")
      .withIndex("by_company_date", (q) =>
        q.eq("companyId", companyId).gte("date", from).lte("date", to),
      )
      .take(CLEAR_BATCH_SIZE);
    await Promise.all(batch.map((row) => ctx.db.delete(row._id)));
    return { more: batch.length === CLEAR_BATCH_SIZE };
  },
});

/** Like `clearInteractionsInRange`, but only for the given employees — a
 * shared Genesys export fanned out into another dashboard replaces just the
 * agents it actually contains there. */
export const clearInteractionsForEmployees = internalMutation({
  args: {
    employeeIds: v.array(v.id("performanceEmployees")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { employeeIds, from, to }): Promise<{ more: boolean }> => {
    let deleted = 0;
    for (const employeeId of employeeIds) {
      const batch = await ctx.db
        .query("performanceInteractions")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", employeeId).gte("date", from).lte("date", to),
        )
        .take(CLEAR_BATCH_SIZE - deleted);
      await Promise.all(batch.map((row) => ctx.db.delete(row._id)));
      deleted += batch.length;
      if (deleted >= CLEAR_BATCH_SIZE) return { more: true };
    }
    return { more: false };
  },
});

export const insertInteractionsChunk = internalMutation({
  args: {
    companyId: v.id("companies"),
    rows: v.array(interactionInsertValidator),
    sourceFile: v.string(),
    uploadedAt: v.number(),
  },
  handler: async (ctx, { companyId, rows, sourceFile, uploadedAt }): Promise<void> => {
    await Promise.all(
      rows.map((row) =>
        ctx.db.insert("performanceInteractions", {
          ...row,
          companyId,
          sourceFile,
          uploadedAt,
        }),
      ),
    );
  },
});

export const logInteractionsImport = internalMutation({
  args: {
    companyId: v.id("companies"),
    sourceFile: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.optional(v.string()),
    reportDate: v.optional(v.string()),
    reportDateFrom: v.optional(v.string()),
    sourceRowCount: v.optional(v.number()),
    skippedNames: v.optional(v.array(v.string())),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
    rowsImported: v.number(),
    replaceLogId: v.optional(v.id("performanceUploadLog")),
  },
  handler: async (ctx, args): Promise<void> => {
    await writeUploadLog(ctx, { ...args, reportKind: "interactions" });
  },
});
