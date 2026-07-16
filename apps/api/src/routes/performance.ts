import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { ConvexError } from "convex/values";
import { Elysia, t } from "elysia";
import { fileTypeFromBuffer } from "file-type";
import * as XLSX from "xlsx";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { Errors } from "../lib/errors.js";
import { scanFile } from "../lib/onedrive/scan.js";
import { requirePerformanceAdmin } from "../lib/performance.js";
import { rateLimit } from "../lib/rate-limit.js";

const serverKey = () => getConvexServerKey();

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Matches performanceImport.ts's aggregated-template HEADER_ALIASES —
// these exact labels round-trip cleanly back through that parser.
const TEMPLATE_HEADER = [
  "Mitarbeiter",
  "Datum",
  "Leads Created",
  "Workable Created",
  "Leads Analysis",
  "Details Identification",
  "Opps Open",
  "Opps Close 7d",
  "Opps Pending",
  "Won",
  "Overdues Analysis",
  "Overdues Opps",
  "Opps30",
  "Leads Inaktiv 2 Wochen",
  "Opps Inaktiv 2 Wochen",
  "Unqualified Reasons",
];

const EXPORT_HEADER = [
  "Mitarbeiter",
  "Leads Created",
  "Workable Created",
  "Leads Analysis",
  "Details Identification",
  "Opps Open",
  "Opps Close 7d",
  "Opps Pending",
  "Won",
  "Overdues Analysis",
  "Overdues Opps",
  "Opps30",
  "Leads Inaktiv 2 Wochen",
  "Opps Inaktiv 2 Wochen",
  "Workable Rate (%)",
  "Hitrate (%)",
  "FC1 Forecast",
  "Unqualified Reasons",
];

function xlsxResponse(
  aoa: unknown[][],
  sheetName: string,
  filename: string
): Response {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(aoa),
    sheetName
  );
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function extractConvexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string | undefined;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
  }
  return fallback;
}

/** Reads bytes as UTF-8 text, stripping a BOM if present (matches the
 * reference script's `encoding="utf-8-sig"`). */
function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// --- Temporary upload diagnostics -----------------------------------------
// Instrumentation for the "Bad uncompressed size" failures SheetJS 0.18.5
// throws on some real-world .xlsx exports: it compares each ZIP entry's
// central-directory size against the local-file-header size, and throws when a
// streaming writer left the local header's size fields at 0. These logs dump
// the file type and the per-entry compression table so we can see exactly
// which entries trip it. Remove once the upload pipeline is confirmed fixed.
const DEBUG = "[performance][debug]";

function hexBytes(bytes: Uint8Array, count: number): string {
  return Array.from(bytes.slice(0, count), b =>
    b.toString(16).padStart(2, "0")
  ).join(" ");
}

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Walks the ZIP central directory and, for each entry, compares its recorded
 * size/method against the local file header at the entry's offset — the exact
 * comparison SheetJS makes. A local `usz` of 0 against a non-zero central-dir
 * size (and/or the data-descriptor flag bit 3) is what makes it throw. */
function inspectZip(bytes: Uint8Array): void {
  const EOCD_SIG = 0x06054b50;
  const CD_SIG = 0x02014b50;
  const LFH_SIG = 0x04034b50;

  let eocd = -1;
  const scanFloor = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (u32(bytes, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    console.warn(`${DEBUG} no ZIP end-of-central-directory record found`);
    return;
  }

  const count = u16(bytes, eocd + 10);
  let cd = u32(bytes, eocd + 16);
  console.warn(`${DEBUG} zip: ${count} entries, central directory at ${cd}`);

  for (let i = 0; i < count && cd + 46 <= bytes.length; i++) {
    if (u32(bytes, cd) !== CD_SIG) {
      console.warn(`${DEBUG} entry ${i}: unexpected central-dir signature`);
      break;
    }
    const method = u16(bytes, cd + 10);
    const cdCsz = u32(bytes, cd + 20);
    const cdUsz = u32(bytes, cd + 24);
    const nameLen = u16(bytes, cd + 28);
    const extraLen = u16(bytes, cd + 30);
    const commentLen = u16(bytes, cd + 32);
    const lho = u32(bytes, cd + 42);
    const name = new TextDecoder().decode(
      bytes.slice(cd + 46, cd + 46 + nameLen)
    );

    let local = "local header not found";
    if (u32(bytes, lho) === LFH_SIG) {
      const localFlags = u16(bytes, lho + 6);
      const localCsz = u32(bytes, lho + 18);
      const localUsz = u32(bytes, lho + 22);
      const descriptor = (localFlags & 0x8) === 0x8;
      const trips = localUsz === 0 && cdUsz !== 0;
      local =
        `local(csz=${localCsz},usz=${localUsz},flags=0x${localFlags.toString(16)}` +
        `,dataDescriptor=${descriptor})` +
        (trips ? " <- trips SheetJS size check" : "");
    }
    console.warn(
      `${DEBUG} entry ${i}: ${name} method=${method === 8 ? "deflate" : method === 0 ? "store" : method} cd(csz=${cdCsz},usz=${cdUsz}) ${local}`
    );

    cd += 46 + nameLen + extraLen + commentLen;
  }
}

async function logUpload(bytes: Uint8Array, file: File): Promise<void> {
  try {
    const detected = await fileTypeFromBuffer(bytes);
    console.warn(
      `${DEBUG} upload: name=${file.name} declaredMime=${file.type || "(none)"} size=${bytes.length} magic=[${hexBytes(bytes, 8)}] detected=${detected ? `${detected.ext}/${detected.mime}` : "(unknown)"}`
    );
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) inspectZip(bytes);
  } catch (err) {
    console.warn(`${DEBUG} upload inspection failed:`, err);
  }
}
// --------------------------------------------------------------------------

/** Reads the first sheet of a workbook into an array of rows (each a plain
 * array of cell values), matching `openpyxl`'s
 * `ws.iter_rows(values_only=True)`. `cellDates: true` makes SheetJS return
 * UTC-midnight `Date` objects for date cells, matching the UTC contract
 * documented on `CellValue` in `performance/lib/types.ts`. */
function readSheetRows(bytes: Uint8Array): unknown[][] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  } catch (err) {
    console.warn(
      `${DEBUG} XLSX.read failed:`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  console.warn(
    `${DEBUG} XLSX.read ok: sheets=${JSON.stringify(workbook.SheetNames)} firstSheet=${sheetName} range=${sheet["!ref"] ?? "n/a"} rows=${rows.length}`
  );
  return rows;
}

export const performanceRoute = new Elysia({ prefix: "/performance" })
  .post(
    "/uploads",
    async ({ request, body }) => {
      await requirePerformanceAdmin(request);

      const rateKey = request.headers.get("authorization") ?? "unknown";
      await rateLimit("performance.upload", rateKey, 30, "1 h");

      const file = body.file;
      const lowerName = file.name.toLowerCase();
      const extension = ALLOWED_EXTENSIONS.find(ext => lowerName.endsWith(ext));
      if (!extension) {
        throw Errors.badRequest(
          "Bitte eine .xlsx-, .xlsm- oder .csv-Datei auswählen."
        );
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      await logUpload(bytes, file);
      const report = await scanFile({
        bytes,
        fileName: file.name,
        declaredMime: file.type,
      });
      console.warn(
        `${DEBUG} scan: verdict=${report.verdict} flags=${JSON.stringify(report.flags.map(f => `${f.code}:${f.severity}`))}`
      );
      if (report.verdict === "blocked") {
        const reason = report.flags.find(f => f.severity === "danger");
        throw Errors.badRequest(
          reason?.detail ?? "Dieser Dateityp ist nicht zulässig."
        );
      }

      const uploadUrl = await getConvex().mutation(
        api.performanceImport.apiGenerateUploadUrl,
        {
          serverKey: serverKey(),
        }
      );
      const staged = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: bytes,
      });
      if (!staged.ok) {
        console.error("[performance] staging upload failed:", staged.status);
        throw Errors.internal("Could not store the file");
      }
      const { storageId } = (await staged.json()) as {
        storageId: Id<"_storage">;
      };

      console.warn(`${DEBUG} import branch: ${extension}`);
      try {
        const result =
          extension === ".csv"
            ? await getConvex().action(api.performanceImport.apiImportReport, {
                serverKey: serverKey(),
                filename: file.name,
                storageId,
                csvText: decodeUtf8(bytes),
              })
            : await getConvex().action(api.performanceImport.apiImportReport, {
                serverKey: serverKey(),
                filename: file.name,
                storageId,
                sheetRows: readSheetRows(bytes),
              });

        console.warn(`${DEBUG} import result: ${JSON.stringify(result)}`);
        if (result.status === "empty") {
          // No activity that day (e.g. a weekend): drop the staged file,
          // same as the reference script deleting it rather than logging an
          // empty import.
          await getConvex().mutation(api.performanceImport.apiDeleteStorage, {
            serverKey: serverKey(),
            storageId,
          });
        }
        return result;
      } catch (err) {
        console.warn(
          `${DEBUG} import failed:`,
          err instanceof Error ? (err.stack ?? err.message) : err
        );
        throw Errors.badRequest(extractConvexMessage(err, "Import failed"));
      }
    },
    { body: t.Object({ file: t.File() }) }
  )

  // Blank upload template with the aggregated-format's recognized headers
  // — no Convex round-trip, the headers are static.
  .get("/template", async ({ request }) => {
    await requirePerformanceAdmin(request);
    return xlsxResponse(
      [TEMPLATE_HEADER],
      "Vorlage",
      "performance-vorlage.xlsx"
    );
  })

  // Per-employee KPI export for one month (port of the reference script's
  // `employee_export`).
  .get(
    "/export",
    async ({ request, query }) => {
      await requirePerformanceAdmin(request);
      const rows = await getConvex().query(
        api.performanceExport.apiExportTeam,
        {
          serverKey: serverKey(),
          ym: query.ym,
        }
      );
      const aoa = [
        EXPORT_HEADER,
        ...rows.map(r => [
          r.name,
          r.leadsCreated,
          r.workableCreated,
          r.leadsAnalysis,
          r.leadsDetailsIdent,
          r.oppsOpen,
          r.oppsClose7d,
          r.oppsPending,
          r.wonMonth,
          r.overduesAnalysis,
          r.overduesOpps,
          r.oppsOver30,
          r.leadsNoAction14,
          r.oppsNoAction14,
          r.workableRate,
          r.hitrate,
          r.fc1,
          r.unqualifiedReasons,
        ]),
      ];
      return xlsxResponse(aoa, "Report", `performance-${query.ym}.xlsx`);
    },
    { query: t.Object({ ym: t.String({ pattern: "^\\d{4}-\\d{2}$" }) }) }
  );
