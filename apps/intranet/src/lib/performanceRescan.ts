import {
  cleanAgentName,
  decodeCsvBytes,
  matchEmployee,
  readCallCsv,
  readCallExport,
  type CallRow,
  type DurationFlag,
} from "@advantis/convex/performance/callImport";
import { normalizeZipLocalHeaders } from "@advantis/convex/performance/xlsxZip";
import * as XLSX from "xlsx";

export interface RescanFlaggedRow extends DurationFlag {
  employeeName: string;
  reportDate: string;
}

export interface RescanResult {
  flaggedRows: RescanFlaggedRow[];
  skipped: string[];
}

/** "2026-07-01" (UTC) — matches `toISODate` in
 * `packages/convex/convex/performance/lib/workdays.ts`, duplicated here
 * rather than imported since that module isn't part of the browser-safe
 * `@advantis/convex/performance/*` surface. */
function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function readSheetRowsClientSide(bytes: Uint8Array): CallRow[] | null {
  normalizeZipLocalHeaders(bytes);
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return readCallExport(rows)?.rows ?? null;
}

/** Downloads an already-uploaded call report straight from Convex storage
 * and re-parses it with the exact same call-report parser the import
 * pipeline uses, entirely in the browser — this file was uploaded before
 * the plausibility check on duration cells existed (or before this rescan
 * feature did), so it never had a chance to raise the flags a fresh upload
 * would today. Only the rows this finds get sent back to Convex (see
 * `performanceImport.recordScanResults`); nothing about the file's already-
 * imported data is touched or re-submitted. */
export async function rescanCallReport(
  filename: string,
  fileUrl: string,
  knownEmployeeNames: string[],
): Promise<RescanResult> {
  const lower = filename.toLowerCase();
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Could not download ${filename} (${res.status})`);
  }

  let rows: CallRow[] | null;
  if (lower.endsWith(".csv")) {
    const text = decodeCsvBytes(new Uint8Array(await res.arrayBuffer()));
    rows = readCallCsv(text)?.rows ?? null;
  } else {
    const bytes = new Uint8Array(await res.arrayBuffer());
    rows = readSheetRowsClientSide(bytes);
  }

  const flaggedRows: RescanFlaggedRow[] = [];
  const skipped = new Set<string>();
  for (const row of rows ?? []) {
    if (!row.flags?.length) continue;
    const emp = matchEmployee(row.employee, knownEmployeeNames);
    if (!emp) {
      skipped.add(cleanAgentName(row.employee));
      continue;
    }
    const reportDate = toISODate(row.date);
    for (const flag of row.flags) {
      flaggedRows.push({ employeeName: emp, reportDate, ...flag });
    }
  }
  return { flaggedRows, skipped: [...skipped] };
}
