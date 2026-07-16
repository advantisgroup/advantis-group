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
} from "./performance/lib/callImport";
import {
  aggregateLeadReport,
  aggregateOppReport,
  readSalesforceExport,
  type RawLead,
  type RawOpp,
} from "./performance/lib/salesforceImport";
import {
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./performance/lib/types";
import { normalizeZipLocalHeaders } from "./performance/lib/xlsxZip";
import { toISODate } from "./performance/lib/workdays";
import { assertServerKey, parseAggregatedTemplate } from "./performanceImport";

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];
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
    uploadLogLabel: string;
    storageId: Id<"_storage">;
  }
): Promise<{ rowsImported: number }> {
  return runSafely("applyImport", () =>
    ctx.runMutation(internal.performanceImport.applyImport, args)
  );
}

/** Wholesale-replaces a raw drill-down table in bounded-size chunks, so a
 * large export's raw rows never cross Convex's array-argument limit in a
 * single call. */
async function writeRawLeads(ctx: ActionCtx, raw: RawLead[]): Promise<void> {
  await runSafely("clearRawLeads", () =>
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
  await runSafely("clearRawOpps", () =>
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

export type ImportResult =
  | { status: "ok"; rowsImported: number; skipped?: string[] }
  | { status: "empty"; reportDate: string };

/**
 * Detects the report type (Salesforce Lead/Opp, call report as CSV or
 * Excel, or an aggregated template) and imports it — ported from
 * `import_file`.
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
  },
  handler: async (
    ctx,
    { serverKey, filename, storageId }
  ): Promise<ImportResult> => {
    assertServerKey(serverKey);

    const lowerName = filename.toLowerCase();
    const extension = ALLOWED_EXTENSIONS.find(ext => lowerName.endsWith(ext));
    if (!extension) {
      throw new ConvexError({
        code: "validation",
        message: "Unsupported file extension.",
      });
    }

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
      const result = await runApplyImport(ctx, {
        snapshots,
        sourceFile: filename,
        uploadLogLabel: `${filename} (Call-Report ${toISODate(detected.reportDate)}: ${snapshots.length} Team-Agenten übernommen, ${skipped.length} ignoriert)`,
        storageId,
      });
      return { status: "ok", rowsImported: result.rowsImported, skipped };
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
          uploadLogLabel: `${filename} (Lead-Report, ${sf.rows.length} Zeilen)`,
          storageId,
        });
        await writeRawLeads(ctx, raw);
        return { status: "ok", rowsImported: result.rowsImported };
      }
      const { snapshots, raw } = aggregateOppReport(sf.rows, sf.reportDate);
      const result = await runApplyImport(ctx, {
        snapshots,
        sourceFile: filename,
        uploadLogLabel: `${filename} (Opportunity-Report, ${sf.rows.length} Zeilen)`,
        storageId,
      });
      await writeRawOpps(ctx, raw);
      return { status: "ok", rowsImported: result.rowsImported };
    }

    const calls = readCallExport(rows);
    if (calls) {
      const { snapshots, skipped } = await buildCallSnapshots(ctx, calls.rows);
      const result = await runApplyImport(ctx, {
        snapshots,
        sourceFile: filename,
        uploadLogLabel: `${filename} (Call-Report ${toISODate(calls.reportDate)}: ${snapshots.length} Team-Agenten übernommen, ${skipped.length} ignoriert)`,
        storageId,
      });
      return { status: "ok", rowsImported: result.rowsImported, skipped };
    }

    const template = parseAggregatedTemplate(rows);
    const result = await runApplyImport(ctx, {
      snapshots: template,
      sourceFile: filename,
      uploadLogLabel: filename,
      storageId,
    });
    return { status: "ok", rowsImported: result.rowsImported };
  },
});
