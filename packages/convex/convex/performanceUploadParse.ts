"use node";

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

import { type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import {
  cleanAgentName,
  matchEmployee,
  readCallCsv,
  readCallExport,
  type CallRow,
  type DurationFlag,
} from "./performance/lib/callImport";
import {
  readInteractionsCsv,
  type InteractionRow,
} from "./performance/lib/interactionImport";
import {
  aggregateLeadReport,
  aggregateOppReport,
  readSalesforceExport,
  type RawLead,
  type RawOpp,
  type WonOpp,
} from "./performance/lib/salesforceImport";
import {
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./performance/lib/types";
import { normalizeZipLocalHeaders } from "./performance/lib/xlsxZip";
import { toISODate, todayUTC } from "./performance/lib/workdays";
import { assertServerKey, parseAggregatedTemplate } from "./performanceImport";

// Safely under Convex's 8192-element array-argument limit, with headroom
// for the rest of each row's payload size.
const RAW_CHUNK_SIZE = 2000;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

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
    snapshots: EmployeeSnapshot[];
    sourceFile: string;
    storageId: Id<"_storage">;
    contentHash: string;
    reportKind?: "lead" | "opp" | "call" | "template";
    reportDate?: string;
    sourceRowCount?: number;
    skippedNames?: string[];
    flaggedRows?: FlaggedRowInput[];
    fileSize?: number;
    batchId?: string;
    replaceLogId?: Id<"performanceUploadLog">;
  }
): Promise<{ rowsImported: number }> {
  return runSafely("applyImport", () =>
    ctx.runMutation(internal.performanceImport.applyImport, args)
  );
}

/** Loops a batched `clear*` mutation (see performanceImport.ts's
 * `CLEAR_BATCH_SIZE` comment) until a full pass deletes nothing, instead of
 * relying on one unbounded collect-then-delete that fails once the stored
 * table crosses Convex's per-execution read limit. */
async function clearInBatches(
  label: string,
  clearOnce: () => Promise<{ more: boolean }>
): Promise<void> {
  let more = true;
  while (more) {
    ({ more } = await runSafely(label, clearOnce));
  }
}

/** Wholesale-replaces a raw drill-down table in bounded-size chunks, so a
 * large export's raw rows never cross Convex's array-argument limit in a
 * single call. */
async function writeRawLeads(ctx: ActionCtx, raw: RawLead[]): Promise<void> {
  await clearInBatches("clearRawLeads", () =>
    ctx.runMutation(internal.performanceImport.clearRawLeads, {})
  );
  for (let i = 0; i < raw.length; i += RAW_CHUNK_SIZE) {
    const chunk = raw.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertRawLeadsChunk", () =>
      ctx.runMutation(internal.performanceImport.insertRawLeadsChunk, {
        rows: chunk,
      })
    );
  }
}

async function writeRawOpps(ctx: ActionCtx, raw: RawOpp[]): Promise<void> {
  await clearInBatches("clearRawOpps", () =>
    ctx.runMutation(internal.performanceImport.clearRawOpps, {})
  );
  for (let i = 0; i < raw.length; i += RAW_CHUNK_SIZE) {
    const chunk = raw.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertRawOppsChunk", () =>
      ctx.runMutation(internal.performanceImport.insertRawOppsChunk, {
        rows: chunk,
      })
    );
  }
}

async function writeWonOpps(ctx: ActionCtx, wonOpps: WonOpp[]): Promise<void> {
  await clearInBatches("clearWonOpps", () =>
    ctx.runMutation(internal.performanceImport.clearWonOpps, {})
  );
  for (let i = 0; i < wonOpps.length; i += RAW_CHUNK_SIZE) {
    const chunk = wonOpps.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertWonOppsChunk", () =>
      ctx.runMutation(internal.performanceImport.insertWonOppsChunk, {
        rows: chunk,
      })
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
  rows: CallRow[]
): Promise<{
  snapshots: EmployeeSnapshot[];
  skipped: string[];
  flaggedRows: FlaggedRowInput[];
}> {
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

/** Matches each interaction's `Benutzer` name(s) against the team roster
 * and keeps only those already active in the Performance Dashboard for the
 * interaction's own calendar month — per the import rule: a raw Genesys
 * export otherwise pulls in every agent who touched the queue, not just
 * the sales team this feature tracks. A multi-agent interaction (transfer/
 * conference) produces one insert per matched, active employee. */
async function buildInteractionInserts(
  ctx: ActionCtx,
  rows: InteractionRow[]
): Promise<{
  inserts: InteractionInsert[];
  months: string[];
  skipped: string[];
}> {
  const employees: { id: Id<"performanceEmployees">; name: string }[] =
    await ctx.runQuery(internal.performanceImport.getTeamEmployeesWithId, {});
  if (employees.length === 0) {
    throw new ConvexError({
      code: "no_employees",
      message:
        "Es sind noch keine Mitarbeiter vorhanden. Bitte zuerst den Lead- oder Opportunity-Report hochladen.",
    });
  }
  const known = employees.map(e => e.name);
  const idByName = new Map(employees.map(e => [e.name, e.id]));

  const months = [...new Set(rows.map(r => r.date.slice(0, 7)))];
  const activeByMonth: Record<string, Id<"performanceEmployees">[]> =
    await ctx.runQuery(internal.performanceImport.getActiveEmployeeIdsByMonth, {
      months,
    });
  const activeSets = new Map(
    Object.entries(activeByMonth).map(([ym, ids]) => [ym, new Set(ids)])
  );

  const inserts: InteractionInsert[] = [];
  const skipped = new Set<string>();
  for (const row of rows) {
    const active = activeSets.get(row.date.slice(0, 7));
    for (const rawName of row.names) {
      const matched = matchEmployee(rawName, known);
      if (!matched) {
        skipped.add(rawName);
        continue;
      }
      const employeeId = idByName.get(matched)!;
      if (!active?.has(employeeId)) continue;
      inserts.push({
        employeeId,
        date: row.date,
        startedAt: row.startedAt,
        durationSec: row.durationSec,
        direction: row.direction,
      });
    }
  }
  return { inserts, months, skipped: [...skipped] };
}

/** Wholesale-replaces every month the upload covers, then writes the new
 * rows in bounded-size chunks (see `RAW_CHUNK_SIZE`) — same clear-then-
 * insert shape as `writeRawLeads`/`writeRawOpps`. */
async function writeInteractions(
  ctx: ActionCtx,
  inserts: InteractionInsert[],
  months: string[],
  sourceFile: string
): Promise<void> {
  await clearInBatches("clearInteractionsForMonths", () =>
    ctx.runMutation(internal.performanceImport.clearInteractionsForMonths, {
      months,
    })
  );
  const uploadedAt = Date.now();
  for (let i = 0; i < inserts.length; i += RAW_CHUNK_SIZE) {
    const chunk = inserts.slice(i, i + RAW_CHUNK_SIZE);
    await runSafely("insertInteractionsChunk", () =>
      ctx.runMutation(internal.performanceImport.insertInteractionsChunk, {
        rows: chunk,
        sourceFile,
        uploadedAt,
      })
    );
  }
}

export type ImportResult =
  | { status: "ok"; rowsImported: number; skipped?: string[] }
  | { status: "empty"; reportDate: string }
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

async function processReport(
  ctx: ActionCtx,
  args: {
    filename: string;
    storageId: Id<"_storage">;
    contentHash: string;
    fileSize?: number;
    batchId?: string;
    replaceLogId?: Id<"performanceUploadLog">;
  }
): Promise<ImportResult> {
  const { storageId, contentHash, fileSize, batchId, replaceLogId } = args;
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

  if (extension === ".csv") {
    const text = stripBom(await blob.text());
    const detected = readCallCsv(text);
    if (detected) {
      if (detected.rows.length === 0) {
        // A report with zero activity (e.g. a weekend): ignored entirely,
        // no data, no upload-log entry.
        return { status: "empty", reportDate: toISODate(detected.reportDate) };
      }
      const { snapshots, skipped, flaggedRows } = await buildCallSnapshots(
        ctx,
        detected.rows
      );
      const result = await runApplyImport(ctx, {
        snapshots,
        sourceFile: filename,
        storageId,
        contentHash,
        reportKind: "call",
        reportDate: toISODate(detected.reportDate),
        sourceRowCount: detected.rows.length,
        skippedNames: skipped,
        flaggedRows,
        fileSize,
        batchId,
        replaceLogId,
      });
      return { status: "ok", rowsImported: result.rowsImported, skipped };
    }

    const interactionRows = readInteractionsCsv(text);
    if (interactionRows) {
      if (interactionRows.length === 0) {
        // Recognized, but no employee-attributable interaction at all.
        return { status: "empty", reportDate: toISODate(todayUTC()) };
      }
      const { inserts, months, skipped } = await buildInteractionInserts(
        ctx,
        interactionRows
      );
      await writeInteractions(ctx, inserts, months, filename);
      await runSafely("logInteractionsImport", () =>
        ctx.runMutation(internal.performanceImport.logInteractionsImport, {
          sourceFile: filename,
          storageId,
          contentHash,
          sourceRowCount: interactionRows.length,
          skippedNames: skipped,
          fileSize,
          batchId,
          rowsImported: inserts.length,
          replaceLogId,
        })
      );
      return { status: "ok", rowsImported: inserts.length, skipped };
    }

    throw new ConvexError({
      code: "unrecognized_report",
      message:
        "CSV nicht erkannt. Erwartet wird ein Call-Report mit Agentenname und Call-Spalten, oder ein Interaktionen-Export.",
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const rows = readSheetRows(bytes);
  console.warn(
    `[performanceUploadParse] ${filename}: parsed ${rows.length} sheet rows`
  );

  const sf = readSalesforceExport(rows);
  if (sf) {
    if (sf.kind === "lead") {
      const { snapshots, raw } = aggregateLeadReport(sf.rows, sf.reportDate);
      const result = await runApplyImport(ctx, {
        snapshots,
        sourceFile: filename,
        storageId,
        contentHash,
        reportKind: "lead",
        reportDate: toISODate(sf.reportDate),
        sourceRowCount: sf.rows.length,
        fileSize,
        batchId,
        replaceLogId,
      });
      await writeRawLeads(ctx, raw);
      return { status: "ok", rowsImported: result.rowsImported };
    }
    const { snapshots, raw, wonOpps } = aggregateOppReport(
      sf.rows,
      sf.reportDate
    );
    const result = await runApplyImport(ctx, {
      snapshots,
      sourceFile: filename,
      storageId,
      contentHash,
      reportKind: "opp",
      reportDate: toISODate(sf.reportDate),
      sourceRowCount: sf.rows.length,
      fileSize,
      batchId,
      replaceLogId,
    });
    await writeRawOpps(ctx, raw);
    await writeWonOpps(ctx, wonOpps);
    return { status: "ok", rowsImported: result.rowsImported };
  }

  const calls = readCallExport(rows);
  if (calls) {
    const { snapshots, skipped, flaggedRows } = await buildCallSnapshots(
      ctx,
      calls.rows
    );
    const result = await runApplyImport(ctx, {
      snapshots,
      sourceFile: filename,
      storageId,
      contentHash,
      reportKind: "call",
      reportDate: toISODate(calls.reportDate),
      sourceRowCount: calls.rows.length,
      skippedNames: skipped,
      flaggedRows,
      fileSize,
      batchId,
      replaceLogId,
    });
    return { status: "ok", rowsImported: result.rowsImported, skipped };
  }

  const template = parseAggregatedTemplate(rows);
  const result = await runApplyImport(ctx, {
    snapshots: template,
    sourceFile: filename,
    storageId,
    contentHash,
    reportKind: "template",
    sourceRowCount: template.length,
    fileSize,
    batchId,
    replaceLogId,
  });
  return { status: "ok", rowsImported: result.rowsImported };
}

/**
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
    contentHash: v.string(),
    // Admin-confirmed re-import of a file whose content hash already
    // matches a prior upload — bypasses the duplicate check below. Needed
    // for legitimately re-importing after a bug fix (or a corrected
    // upstream export) rather than being permanently blocked by an old,
    // no-longer-representative upload-log entry.
    force: v.optional(v.boolean()),
    fileSize: v.optional(v.number()),
    batchId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { serverKey, filename, storageId, contentHash, force, fileSize, batchId }
  ): Promise<ImportResult> => {
    assertServerKey(serverKey);

    // Checked before any parsing — covers every report type (Salesforce
    // Lead/Opp, call report, aggregated template) uniformly, and skips the
    // (potentially expensive) parse entirely for a re-upload.
    if (!force) {
      const priorUpload = await ctx.runQuery(
        internal.performanceImport.findUploadByHash,
        { contentHash }
      );
      if (priorUpload) {
        return {
          status: "duplicate",
          filename: priorUpload.filename,
          uploadedAt: priorUpload.uploadedAt,
        };
      }
    }

    return processReport(ctx, {
      filename,
      storageId,
      contentHash,
      fileSize,
      batchId,
    });
  },
});

/** Re-processes a file already sitting in storage from a prior upload —
 * rereads it fresh through the (possibly since-fixed) detection/parsing
 * logic and patches the existing log row in place, rather than requiring
 * the admin to re-select and re-upload the same file from their computer.
 * Session-token gated (called directly from the browser, not through
 * apps/api) since there's no new file to stage/scan here. */
export const reimportUpload = action({
  args: { token: v.string(), logId: v.id("performanceUploadLog") },
  handler: async (ctx, { token, logId }): Promise<ImportResult> => {
    await ctx.runQuery(internal.performanceImport.requireAdminByToken, {
      token,
    });
    const log = await ctx.runQuery(internal.performanceImport.getUploadLogRow, {
      logId,
    });
    if (!log) {
      throw new ConvexError({
        code: "not_found",
        message: "Upload-log entry not found.",
      });
    }
    return processReport(ctx, {
      filename: log.filename,
      storageId: log.storageId,
      contentHash: log.contentHash ?? "",
      fileSize: log.fileSize,
      batchId: log.batchId,
      replaceLogId: logId,
    });
  },
});

/** Re-imports every file in a batch, sequentially (not in parallel) so a
 * large batch doesn't fan out into a burst of concurrent Node actions —
 * each file's parse is small and fast, and the DB layer already skips a
 * write when the reprocessed values come out unchanged (see
 * `upsertSnapshot`), so re-running an already-correct file is cheap. */
export const reimportBatch = action({
  args: { token: v.string(), batchId: v.string() },
  handler: async (
    ctx,
    { token, batchId }
  ): Promise<{ results: (ImportResult & { logId: string })[] }> => {
    await ctx.runQuery(internal.performanceImport.requireAdminByToken, {
      token,
    });
    const rows = await ctx.runQuery(
      internal.performanceImport.getUploadLogRowsByBatch,
      { batchId }
    );
    const results: (ImportResult & { logId: string })[] = [];
    for (const log of rows) {
      const result = await processReport(ctx, {
        filename: log.filename,
        storageId: log.storageId,
        contentHash: log.contentHash ?? "",
        fileSize: log.fileSize,
        batchId: log.batchId,
        replaceLogId: log._id,
      });
      results.push({ ...result, logId: log._id });
    }
    return { results };
  },
});
