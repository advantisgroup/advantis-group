import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { ConvexError } from "convex/values";
import { Elysia, t } from "elysia";
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

/** Reads the first sheet of a workbook into an array of rows (each a plain
 * array of cell values), matching `openpyxl`'s
 * `ws.iter_rows(values_only=True)`. `cellDates: true` makes SheetJS return
 * UTC-midnight `Date` objects for date cells, matching the UTC contract
 * documented on `CellValue` in `performance/lib/types.ts`. */
function readSheetRows(bytes: Uint8Array): unknown[][] {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
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
      const report = await scanFile({
        bytes,
        fileName: file.name,
        declaredMime: file.type,
      });
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
