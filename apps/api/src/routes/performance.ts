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

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

function xlsxResponse(aoa: unknown[][], sheetName: string, filename: string): Response {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName);
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

export const performanceRoute = new Elysia({ prefix: "/performance" })
  .post(
    "/uploads",
    async ({ request, body }) => {
      const admin = await requirePerformanceAdmin(request);

      const rateKey = request.headers.get("authorization") ?? "unknown";
      await rateLimit("performance.upload", rateKey, 30, "1 h");

      const file = body.file;
      const force = body.force === "true";
      const batchId = body.batchId;
      const lowerName = file.name.toLowerCase();
      const extension = ALLOWED_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
      if (!extension) {
        throw Errors.badRequest("Bitte eine .xlsx-, .xlsm- oder .csv-Datei auswählen.");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const report = await scanFile({
        bytes,
        fileName: file.name,
        declaredMime: file.type,
      });
      if (report.verdict === "blocked") {
        const reason = report.flags.find((f) => f.severity === "danger");
        throw Errors.badRequest(reason?.detail ?? "Dieser Dateityp ist nicht zulässig.");
      }

      // Content hash, not filename — catches a re-upload of the same
      // report under a renamed file too, and works uniformly across every
      // report type (Salesforce Lead/Opp, call report, aggregated
      // template) since it's checked before any type-specific parsing.
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const contentHash = Buffer.from(digest).toString("hex");

      if (!force) {
        const priorUpload = await getConvex().query(api.performance.import.apiFindUploadByHash, {
          serverKey: getConvexServerKey(),
          companyId: admin.companyId,
          contentHash,
        });
        if (priorUpload) {
          return {
            status: "duplicate" as const,
            filename: priorUpload.filename,
            uploadedAt: priorUpload.uploadedAt,
          };
        }
      }

      const uploadUrl = await getConvex().mutation(api.performance.import.apiGenerateUploadUrl, {
        serverKey: getConvexServerKey(),
      });
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

      // Parsing (xlsx/csv detection, aggregation) happens inside Convex,
      // not here — a real Salesforce export can have tens of thousands of
      // rows, which blows past Convex's 8192-element array-argument limit
      // if shipped as a single argument. This route only stages the file
      // and hands off its storageId.
      try {
        const result = await getConvex().action(api.performance.uploadParse.apiImportReport, {
          serverKey: getConvexServerKey(),
          companyId: admin.companyId,
          filename: file.name,
          storageId,
          contentHash,
          force,
          fileSize: bytes.length,
          batchId,
          uploadedBy: admin.name || admin.email,
        });

        if (result.status === "empty" || result.status === "duplicate") {
          // "empty": no activity that day (e.g. a weekend). "duplicate": a
          // concurrent upload of the same file won the race against the
          // pre-stage hash check above. Either way, drop the now-orphaned
          // staged file rather than leaving it in storage.
          await getConvex().mutation(api.performance.import.apiDeleteStorage, {
            serverKey: getConvexServerKey(),
            storageId,
          });
        }
        return result;
      } catch (err) {
        throw Errors.badRequest(extractConvexMessage(err, "Import failed"));
      }
    },
    {
      body: t.Object({
        file: t.File(),
        force: t.Optional(t.String()),
        batchId: t.Optional(t.String()),
      }),
    },
  )

  // Blank upload template with the aggregated-format's recognized headers
  // — no Convex round-trip, the headers are static.
  .get("/template", async ({ request }) => {
    await requirePerformanceAdmin(request);
    return xlsxResponse([TEMPLATE_HEADER], "Vorlage", "performance-vorlage.xlsx");
  })

  // Per-employee KPI export for one month (port of the reference script's
  // `employee_export`).
  .get(
    "/export",
    async ({ request, query }) => {
      const admin = await requirePerformanceAdmin(request);
      const rows = await getConvex().query(api.performance.export.apiExportTeam, {
        serverKey: getConvexServerKey(),
        companyId: admin.companyId,
        ym: query.ym,
      });
      const aoa = [
        EXPORT_HEADER,
        ...rows.map((r) => [
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
    { query: t.Object({ ym: t.String({ pattern: "^\\d{4}-\\d{2}$" }) }) },
  );
