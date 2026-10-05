"use node";

import { serverAction, userAction } from "../functions";

/**
 * Report-file detection/parsing for the Performance upload pipeline —
 * ported from the reference script's `import_file`. Split into its own
 * "use node" action file (Convex requires "use node" files to contain only
 * actions, and this one needs the full `xlsx` npm package) rather than
 * living alongside `performanceImport.ts`'s mutations/queries.
 *
 * Reads the uploaded file directly from Convex storage instead of
 * receiving parsed rows/text as an action argument: a real Salesforce
 * export can have tens of thousands of rows, which blows past Convex's
 * 8192-element array-argument limit if shipped as a single `sheetRows`
 * array (the "Array length is too long" failure this file replaces).
 * `apps/api`'s upload route now only stages the file and passes a
 * `storageId`.
 */
import { ConvexError, v } from "convex/values";
import * as XLSX from "xlsx";

import { type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { type ActionCtx } from "../_generated/server";
import {
  cleanAgentName,
  decodeCsvBytes,
  firstLine,
  matchEmployee,
  parseCsvText,
  readCallCsv,
  readCallExport,
  sniffDelimiter,
  type CallRow,
  type DurationFlag,
} from "./lib/callImport";
import {
  interactionDateRange,
  readInteractionsCsv,
  type InteractionRow,
} from "./lib/interactionImport";
import {
  aggregateLeadReport,
  aggregateOppReport,
  readSalesforceExport,
  type RawLead,
  type RawOpp,
  type WonOpp,
} from "./lib/salesforceImport";
import {
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./lib/types";
import { normalizeZipLocalHeaders } from "./lib/xlsxZip";
import { toISODate, todayBerlin } from "./lib/workdays";
import { parseAggregatedTemplate } from "./lib/aggregatedTemplate";

// Safely under Convex's 8192-element array-argument limit, with headroom
// for the rest of each row's payload size.
const RAW_CHUNK_SIZE = 2000;

/** Reads the first sheet of a workbook into an array of rows, matching
 * openpyxl's `ws.iter_rows(values_only=True)`. `cellDates: true` makes
 * SheetJS return UTC-midnight `Date` objects for date cells, matching the
 * UTC contract documented on `CellValue` in `performance/lib/types.ts`. */
function readSheetRows(bytes: Uint8Array): SheetRow[] {
  normalizeZipLocalHeaders(bytes);
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
}

/** Convex redacts a plain thrown Error down to an opaque "Server Error" for
 * the caller unless it's a ConvexError — so without this, apps/api (and the
 * admin uploading the file) would see no detail at all about what actually
 * went wrong inside a `ctx.runMutation` call. */
async function runSafely<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConvexError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[performanceUploadParse] ${label} failed:`, err);
    throw new ConvexError({ code: "import_mutation_failed", message });
  }
}

async function runApplyImport(
  ctx: ActionCtx,
  args: {
    companyId: Id<"companies">;
    snapshots: EmployeeSnapshot[];
    sourceFile: string;
    storageId: Id<"_storage">;
    contentHash: string;
    reportKind?: "lead" | "opp" | "call" | "template";
    reportDate?: string;
    reportDateFrom?: string;
    sourceRowCount?: number;
    skippedNames?: string[];
    flaggedRows?: FlaggedRowInput[];
    fileSize?: number;
    batchId?: string;
    uploadedBy?: string;
    replaceLogId?: Id<"performanceUploadLog">;
    deferLog?: boolean;
    clearFields?: "callsOutbound"[];
  },
): Promise<{ rowsImported: number }> {
  return runSafely("applyImport", () =>
    ctx.runMutation(internal.performance.import.applyImport, args),
  );
}

/** A Lead/Opp import: snapshots first, then the drill-down tables — only
 * when this report is at least as new as what they hold, so re-importing
 * last week's file doesn't put last week's open leads back — and the log
 * row last, so a failure on the way leaves nothing that blocks a retry. */
async function importSalesforce(
  ctx: ActionCtx,
  base: Omit<Parameters<typeof runApplyImport>[1], "reportKind" | "deferLog" | "snapshots">,
  kind: "lead" | "opp",
  snapshots: EmployeeSnapshot[],
  writeRaw: () => Promise<void>,
): Promise<ImportResult> {
  const reportDate = base.reportDate!;
  const result = await runApplyImport(ctx, {
    ...base,
    snapshots,
    reportKind: kind,
    deferLog: true,
  });
  const current = await ctx.runQuery(internal.performance.import.getRawReportDates, {
    companyId: base.companyId,
  });
  const currentDate = kind === "lead" ? current.leads : current.opps;
  const replaceRaw = currentDate === undefined || reportDate >= currentDate;
  if (replaceRaw) await writeRaw();
  const { flaggedRows: _flagged, ...log } = base;
  await runSafely("recordUpload", () =>
    ctx.runMutation(internal.performance.import.recordUpload, {
      ...log,
      reportKind: kind,
      rowsImported: result.rowsImported,
      ...(replaceRaw
        ? kind === "lead"
          ? { rawLeadsReportDate: reportDate }
          : { rawOppsReportDate: reportDate }
        : {}),
    }),
  );
  return {
    status: "ok",
    rowsImported: result.rowsImported,
    reportKind: kind,
    reportDate,
    ...(replaceRaw ? {} : { rawKept: currentDate }),
  };
}

/** Loops a batched `clear*` mutation (see performanceImport.ts's
 * `CLEAR_BATCH_SIZE` comment) until a full pass deletes nothing, instead of
 * relying on one unbounded collect-then-delete that fails once the stored
 * table crosses Convex's per-execution read limit. */
async function clearInBatches(
  label: string,
  clearOnce: () => Promise<{ more: boolean }>,
): Promise<void> {
  let more = true;
  while (more) {
    ({ more } = await runSafely(label, clearOnce));
  }
}

/** Wholesale-replaces a raw drill-down table in bounded-size chunks, so a
 * large export's raw rows never cross Convex's array-argument limit in a
 * single call. */
async function writeRawLeads(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  raw: RawLead[],
): Promise<void> {
  await clearInBatches("clearRawLeads", () =>
    ctx.runMutation(internal.performance.import.clearRawLeads, { companyId }),
  );
  for (let i = 0; i < raw.length; i += RAW_CHUNK_SIZE) {
    const chunk = raw.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertRawLeadsChunk", () =>
      ctx.runMutation(internal.performance.import.insertRawLeadsChunk, {
        companyId,
        rows: chunk,
      }),
    );
  }
}

async function writeRawOpps(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  raw: RawOpp[],
): Promise<void> {
  await clearInBatches("clearRawOpps", () =>
    ctx.runMutation(internal.performance.import.clearRawOpps, { companyId }),
  );
  for (let i = 0; i < raw.length; i += RAW_CHUNK_SIZE) {
    const chunk = raw.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertRawOppsChunk", () =>
      ctx.runMutation(internal.performance.import.insertRawOppsChunk, {
        companyId,
        rows: chunk,
      }),
    );
  }
}

async function writeWonOpps(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  wonOpps: WonOpp[],
): Promise<void> {
  await clearInBatches("clearWonOpps", () =>
    ctx.runMutation(internal.performance.import.clearWonOpps, { companyId }),
  );
  for (let i = 0; i < wonOpps.length; i += RAW_CHUNK_SIZE) {
    const chunk = wonOpps.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertWonOppsChunk", () =>
      ctx.runMutation(internal.performance.import.insertWonOppsChunk, {
        companyId,
        rows: chunk,
      }),
    );
  }
}

const CALL_FIELDS: (keyof CallRow & keyof MetricFields)[] = [
  "callsToday",
  "callsAnswered",
  "callsOutbound",
  "talkAvgSec",
  "talkTotalSec",
  "loginSec",
];

export interface FlaggedRowInput extends DurationFlag {
  employeeName: string;
  reportDate: string;
}

/** One row per employee/day, matched against the known team; agents with
 * no unambiguous team match are skipped (reported in `skipped`), same as
 * `import_calls`. Requires at least one Lead/Opportunity report to have
 * been imported already, so there's a team to match against. A row whose
 * duration cell got rejected by `parseDurationField` isn't dropped
 * silently — it's reported in `flaggedRows` for admin review instead. */
async function buildCallSnapshots(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  rows: CallRow[],
): Promise<{
  snapshots: EmployeeSnapshot[];
  skipped: string[];
  flaggedRows: FlaggedRowInput[];
}> {
  const known: string[] = await ctx.runQuery(internal.performance.import.getTeamEmployeeNames, {
    companyId,
  });
  if (known.length === 0) {
    throw new ConvexError({
      code: "no_employees",
      message:
        "Es sind noch keine Mitarbeiter vorhanden. Bitte zuerst den Lead- oder Opportunity-Report hochladen.",
    });
  }
  const snapshots: EmployeeSnapshot[] = [];
  const skipped: string[] = [];
  const flaggedRows: FlaggedRowInput[] = [];
  for (const rec of rows) {
    const emp = matchEmployee(rec.employee, known);
    if (!emp) {
      skipped.push(cleanAgentName(rec.employee));
      continue;
    }
    const reportDate = toISODate(rec.date);
    for (const flag of rec.flags ?? []) {
      flaggedRows.push({ employeeName: emp, reportDate, ...flag });
    }
    const fields: SnapshotFields = {};
    for (const f of CALL_FIELDS) {
      const value = rec[f];
      if (value !== null && value !== undefined) fields[f] = value;
    }
    if (Object.keys(fields).length === 0) continue;
    snapshots.push({ employeeName: emp, reportDate, fields });
  }
  return { snapshots, skipped, flaggedRows };
}

interface InteractionInsert {
  employeeId: Id<"performanceEmployees">;
  date: string;
  startedAt: number;
  durationSec: number;
  direction?: string;
}

/** Matches each interaction's `Benutzer` name(s) against the dashboard's
 * roster. Agents outside the roster (other queues) are reported as skipped
 * rather than imported; whether a matched employee already has a report
 * that month doesn't matter, so the upload order of the day's files
 * doesn't either. A multi-agent interaction (transfer/conference) produces
 * one insert per matched employee. */
async function buildInteractionInserts(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  rows: InteractionRow[],
): Promise<{
  inserts: InteractionInsert[];
  skipped: string[];
}> {
  const employees: { id: Id<"performanceEmployees">; name: string }[] = await ctx.runQuery(
    internal.performance.import.getTeamEmployeesWithId,
    {
      companyId,
    },
  );
  if (employees.length === 0) {
    throw new ConvexError({
      code: "no_employees",
      message:
        "Es sind noch keine Mitarbeiter vorhanden. Bitte zuerst den Lead- oder Opportunity-Report hochladen.",
    });
  }
  const known = employees.map((e) => e.name);
  const idByName = new Map(employees.map((e) => [e.name, e.id]));

  const inserts: InteractionInsert[] = [];
  const skipped = new Set<string>();
  const matchCache = new Map<string, string | null>();
  for (const row of rows) {
    for (const rawName of row.names) {
      let matched = matchCache.get(rawName);
      if (matched === undefined) {
        matched = matchEmployee(rawName, known);
        matchCache.set(rawName, matched);
      }
      if (!matched) {
        skipped.add(rawName);
        continue;
      }
      const employeeId = idByName.get(matched)!;
      inserts.push({
        employeeId,
        date: row.date,
        startedAt: row.startedAt,
        durationSec: row.durationSec,
        direction: row.direction,
      });
    }
  }
  return { inserts, skipped: [...skipped].sort() };
}

/** Replaces the file's own date range (first to last day it contains),
 * then writes the new rows in bounded-size chunks (see `RAW_CHUNK_SIZE`) —
 * same clear-then-insert shape as `writeRawLeads`/`writeRawOpps`. */
async function writeInteractions(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  inserts: InteractionInsert[],
  range: { from: string; to: string },
  sourceFile: string,
): Promise<void> {
  await clearInBatches("clearInteractionsInRange", () =>
    ctx.runMutation(internal.performance.import.clearInteractionsInRange, {
      companyId,
      ...range,
    }),
  );
  const uploadedAt = Date.now();
  for (let i = 0; i < inserts.length; i += RAW_CHUNK_SIZE) {
    const chunk = inserts.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertInteractionsChunk", () =>
      ctx.runMutation(internal.performance.import.insertInteractionsChunk, {
        companyId,
        rows: chunk,
        sourceFile,
        uploadedAt,
      }),
    );
  }
}

export type ReportKind = "lead" | "opp" | "call" | "template" | "interactions";

export type ImportResult =
  | {
      status: "ok";
      rowsImported: number;
      reportKind: ReportKind;
      reportDate: string;
      /** First day, for a report spanning several days (interactions). */
      reportDateFrom?: string;
      skipped?: string[];
      flagged?: number;
      /** Set when the drill-down lists were left alone because they already
       * hold a newer report (the date given). */
      rawKept?: string;
    }
  | { status: "empty"; reportKind?: ReportKind; reportDate: string }
  | { status: "duplicate"; filename: string; uploadedAt: number };

/**
 * Detects the report type (Salesforce Lead/Opp, call report as CSV or
 * Excel, or an aggregated template) and imports it — ported from
 * `import_file`. Shared by a fresh upload (`apiImportReport`) and a
 * re-import of an already-stored file (`reimportUpload`); `replaceLogId`
 * is set only by the latter, to patch the existing log row in place
 * instead of inserting a new one.
 */
// Matches the extension anywhere, not just at the string's end: a
// re-import's `filename` comes from an upload-log row, and every row
// logged before this file's own refactor stored a decorated label
// ("report.csv (Call-Report 2026-07-01: 9 matched, 3 skipped)") instead
// of the raw filename — `.endsWith()` never matches those. Trimming down
// to the matched prefix also self-heals the log entry's filename back to
// something readable the next time it's (re)written.
const EXTENSION_RE = /\.(xlsx|xlsm|csv)\b/i;

function unrecognizedFile(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "unrecognized_report",
    message:
      "Dateityp nicht erkannt – erwartet: Salesforce Lead- oder Opportunity-Export, Genesys Call-Report, Genesys Interaktionen-Export oder die Upload-Vorlage (Spalte „Mitarbeiter“ plus mindestens eine Kennzahl).",
  });
}

async function processReport(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  args: {
    filename: string;
    storageId: Id<"_storage">;
    contentHash: string;
    fileSize?: number;
    batchId?: string;
    uploadedBy?: string;
    replaceLogId?: Id<"performanceUploadLog">;
  },
): Promise<ImportResult> {
  const { storageId, contentHash, fileSize, batchId, uploadedBy, replaceLogId } = args;
  const match = EXTENSION_RE.exec(args.filename);
  if (!match) {
    throw new ConvexError({
      code: "validation",
      message: "Unsupported file extension.",
    });
  }
  const extension = `.${match[1].toLowerCase()}`;
  const filename = args.filename.slice(0, match.index + match[0].length);

  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new ConvexError({
      code: "not_found",
      message: "Uploaded file is no longer available.",
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const csvText = extension === ".csv" ? decodeCsvBytes(bytes) : null;
  const rows =
    csvText !== null
      ? parseCsvText(csvText, sniffDelimiter(firstLine(csvText)))
      : readSheetRows(bytes);

  const base = {
    companyId,
    sourceFile: filename,
    storageId,
    contentHash,
    fileSize,
    batchId,
    uploadedBy,
    replaceLogId,
  };

  const sf = readSalesforceExport(rows);
  if (sf) {
    const reportDate = toISODate(sf.reportDate);
    const sfBase = { ...base, reportDate, sourceRowCount: sf.rows.length };
    if (sf.kind === "lead") {
      const { snapshots, raw } = aggregateLeadReport(sf.rows, sf.reportDate);
      return importSalesforce(ctx, sfBase, "lead", snapshots, () =>
        writeRawLeads(ctx, companyId, raw),
      );
    }
    const { snapshots, raw, wonOpps } = aggregateOppReport(sf.rows, sf.reportDate);
    return importSalesforce(ctx, sfBase, "opp", snapshots, async () => {
      await writeRawOpps(ctx, companyId, raw);
      await writeWonOpps(ctx, companyId, wonOpps);
    });
  }

  const calls = csvText !== null ? readCallCsv(csvText) : readCallExport(rows);
  if (calls) {
    const reportDate = toISODate(calls.reportDate);
    // A report with zero activity (e.g. a weekend): ignored entirely, no
    // data, no upload-log entry.
    if (calls.rows.length === 0) return { status: "empty", reportKind: "call", reportDate };
    const { snapshots, skipped, flaggedRows } = await buildCallSnapshots(
      ctx,
      companyId,
      calls.rows,
    );
    const firstDay = toISODate(
      calls.rows.reduce((min, r) => (r.date < min ? r.date : min), calls.rows[0].date),
    );
    const reportDateFrom = firstDay !== reportDate ? firstDay : undefined;
    const result = await runApplyImport(ctx, {
      ...base,
      snapshots,
      reportKind: "call",
      reportDate,
      reportDateFrom,
      sourceRowCount: calls.rows.length,
      skippedNames: skipped,
      flaggedRows,
      clearFields: calls.hasOutbound ? undefined : ["callsOutbound"],
    });
    return {
      status: "ok",
      rowsImported: result.rowsImported,
      reportKind: "call",
      reportDate,
      reportDateFrom,
      skipped,
      flagged: flaggedRows.length,
    };
  }

  const interactionRows = csvText !== null ? readInteractionsCsv(csvText) : null;
  if (interactionRows) {
    if (interactionRows.length === 0) {
      // Recognized, but no employee-attributable interaction at all.
      return {
        status: "empty",
        reportKind: "interactions",
        reportDate: toISODate(todayBerlin()),
      };
    }
    const range = interactionDateRange(interactionRows);
    const { inserts, skipped } = await buildInteractionInserts(ctx, companyId, interactionRows);
    await writeInteractions(ctx, companyId, inserts, range, filename);
    await runSafely("logInteractionsImport", () =>
      ctx.runMutation(internal.performance.import.logInteractionsImport, {
        ...base,
        reportDate: range.to,
        reportDateFrom: range.from,
        sourceRowCount: interactionRows.length,
        skippedNames: skipped,
        rowsImported: inserts.length,
      }),
    );
    return {
      status: "ok",
      rowsImported: inserts.length,
      reportKind: "interactions",
      reportDate: range.to,
      reportDateFrom: range.from !== range.to ? range.from : undefined,
      skipped,
    };
  }

  const template = parseAggregatedTemplate(rows);
  if (!template) throw unrecognizedFile();
  if (template.snapshots.length === 0) {
    return { status: "empty", reportKind: "template", reportDate: template.reportDate };
  }
  const result = await runApplyImport(ctx, {
    ...base,
    snapshots: template.snapshots,
    reportKind: "template",
    reportDate: template.reportDate,
    sourceRowCount: template.snapshots.length,
  });
  return {
    status: "ok",
    rowsImported: result.rowsImported,
    reportKind: "template",
    reportDate: template.reportDate,
  };
}

/**
 * Server-key gated: only `apps/api`'s upload route calls this, after it has
 * checked via `access.apiUploadAccess` that the signed-in intranet user is
 * an admin — same trust boundary as the `api*`-prefixed OneDrive functions
 * in `onedrive.ts`.
 */
export const apiImportReport = serverAction({
  args: {
    companyId: v.id("companies"),
    filename: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.string(),
    // Admin-confirmed re-import of a file whose content hash already
    // matches a prior upload — bypasses the duplicate check below. Needed
    // for legitimately re-importing after a bug fix (or a corrected
    // upstream export) rather than being permanently blocked by an old,
    // no-longer-representative upload-log entry.
    force: v.optional(v.boolean()),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { companyId, filename, storageId, contentHash, force, fileSize, batchId, uploadedBy },
  ): Promise<ImportResult> => {
    return withImportLock(ctx, companyId, uploadedBy, async () => {
      // Checked before any parsing — covers every report type uniformly,
      // and skips the parse entirely for a re-upload. Inside the lock, so
      // the same file dropped twice at once is imported only once. Scoped
      // to `companyId` — two dashboards may get byte-identical files.
      if (!force) {
        const priorUpload = await ctx.runQuery(internal.performance.import.findUploadByHash, {
          companyId,
          contentHash,
        });
        if (priorUpload) {
          return {
            status: "duplicate",
            filename: priorUpload.filename,
            uploadedAt: priorUpload.uploadedAt,
          };
        }
      }
      return processReport(ctx, companyId, {
        filename,
        storageId,
        contentHash,
        fileSize,
        batchId,
        uploadedBy,
      });
    });
  },
});

/** Runs one import (or a batch re-import) while holding the dashboard's
 * import lock, so two imports never interleave their clear-then-insert
 * steps and duplicate rows. A second import meanwhile fails right away
 * with a German "please wait" message instead of queueing. */
async function withImportLock<T>(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  by: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const token = crypto.randomUUID();
  await ctx.runMutation(internal.performance.import.acquireImportLock, { companyId, token, by });
  try {
    return await run();
  } finally {
    await ctx.runMutation(internal.performance.import.releaseImportLock, { companyId, token });
  }
}

async function requireCompanyExists(ctx: ActionCtx, companyId: Id<"companies">): Promise<void> {
  if (!(await ctx.runQuery(internal.performance.import.companyExists, { companyId }))) {
    throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
  }
}

/** Re-processes a file already sitting in storage from a prior upload —
 * rereads it fresh through the (possibly since-fixed) detection/parsing
 * logic and patches the existing log row in place, rather than requiring
 * the admin to re-select and re-upload the same file from their computer.
 * Admin-only, called directly from the browser (not through apps/api) since
 * there's no new file to stage/scan here. */
export const reimportUpload = userAction({
  role: "admin",
  args: {
    logId: v.id("performanceUploadLog"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, { logId, companyId }): Promise<ImportResult> => {
    await requireCompanyExists(ctx, companyId);
    const log = await ctx.runQuery(internal.performance.import.getUploadLogRow, {
      logId,
    });
    if (!log || log.companyId !== companyId) {
      throw new ConvexError({
        code: "not_found",
        message: "Upload-log entry not found.",
      });
    }
    return withImportLock(ctx, companyId, log.uploadedBy, () =>
      processReport(ctx, companyId, {
        filename: log.filename,
        storageId: log.storageId,
        contentHash: log.contentHash ?? "",
        fileSize: log.fileSize,
        batchId: log.batchId,
        uploadedBy: log.uploadedBy,
        replaceLogId: logId,
      }),
    );
  },
});

/** Re-imports every file in a batch, sequentially (not in parallel) so a
 * large batch doesn't fan out into a burst of concurrent Node actions —
 * each file's parse is small and fast, and the DB layer already skips a
 * write when the reprocessed values come out unchanged (see
 * `upsertSnapshot`), so re-running an already-correct file is cheap. */
export const reimportBatch = userAction({
  role: "admin",
  args: {
    batchId: v.string(),
    companyId: v.id("companies"),
  },
  handler: async (
    ctx,
    { batchId, companyId },
  ): Promise<{ results: (ImportResult & { logId: string })[] }> => {
    await requireCompanyExists(ctx, companyId);
    const rows = await ctx.runQuery(internal.performance.import.getUploadLogRowsByBatch, {
      batchId,
    });
    return withImportLock(ctx, companyId, undefined, async () => {
      const results: (ImportResult & { logId: string })[] = [];
      // Salesforce files first (they create the roster the call and
      // interaction files match against), oldest report first within each.
      const ordered = [...rows].sort(
        (a, b) =>
          kindOrder(a.reportKind) - kindOrder(b.reportKind) ||
          (a.reportDate ?? "").localeCompare(b.reportDate ?? ""),
      );
      for (const log of ordered) {
        // A batch id is only ever shared by files uploaded together by the
        // same company — skip anything that somehow doesn't match instead
        // of silently importing it into the wrong company.
        if (log.companyId !== companyId) continue;
        const result = await processReport(ctx, companyId, {
          filename: log.filename,
          storageId: log.storageId,
          contentHash: log.contentHash ?? "",
          fileSize: log.fileSize,
          batchId: log.batchId,
          uploadedBy: log.uploadedBy,
          replaceLogId: log._id,
        });
        results.push({ ...result, logId: log._id });
      }
      return { results };
    });
  },
});

function kindOrder(kind: ReportKind | undefined): number {
  return kind === "lead" || kind === "opp" ? 0 : kind === "template" ? 1 : 2;
}
