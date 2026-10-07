import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { ConvexError } from "convex/values";
import { Elysia, t } from "elysia";
import * as XLSX from "xlsx";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { ApiError, Errors } from "../lib/errors.js";
import { authed } from "../lib/middleware.js";
import { scanFile } from "../lib/onedrive/scan.js";
import { rateLimit } from "../lib/rate-limit.js";

const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".csv"];

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Matches performance/lib/aggregatedTemplate.ts's HEADER_ALIASES —
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

// Vercel rejects request bodies over ~4.5 MB before they reach the route;
// the intranet refuses bigger files client-side with the same limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function convexErrorData(err: unknown): { code?: string; message?: string } | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data = err.data as { code?: string; message?: string } | string | undefined;
  return typeof data === "string" ? { message: data } : data;
}

/** The parser's own German message ("Dateityp nicht erkannt – …") as the
 * response's `error`, which the upload queue shows verbatim. */
function importError(err: unknown): ApiError {
  const data = convexErrorData(err);
  const message = data?.message;
  if (data?.code === "import_locked" && message) {
    return new ApiError(409, "conflict", message);
  }
  if (message) return Errors.badRequest(message);
  console.error("[performance] import failed:", err);
  return Errors.badRequest("Import fehlgeschlagen. Bitte erneut versuchen oder die Datei prüfen.");
}

/** Access runs through the intranet sign-in (Clerk): uploads are for
 * intranet admins, the export for whoever sees the dashboard's team view —
 * both checked in Convex (`performance/access.ts`, `performance/export.ts`). */
export const performanceRoute = new Elysia({ prefix: "/performance" })
  .use(authed)
  .post(
    "/uploads",
    async ({ caller, body }) => {
      const companyId = body.companyId as Id<"companies">;
      const { uploadedBy } = await getConvex().query(api.performance.access.apiUploadAccess, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        companyId,
      });

      await rateLimit("performance.upload", caller.clerkUserId, 120, "1 h");

      const file = body.file;
      const force = body.force === "true";
      const batchId = body.batchId;
      const lowerName = file.name.toLowerCase();
      const extension = ALLOWED_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
      if (!extension) {
        throw Errors.badRequest("Bitte eine .xlsx-, .xlsm- oder .csv-Datei auswählen.");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw Errors.badRequest(
          "Die Datei ist größer als 4 MB. Bitte den Export auf weniger Spalten oder einen kürzeren Zeitraum beschränken oder als .xlsx speichern.",
        );
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
          companyId,
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
          companyId,
          filename: file.name,
          storageId,
          contentHash,
          force,
          fileSize: bytes.length,
          batchId,
          uploadedBy,
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
        // Nothing was imported or logged — don't keep the staged copy.
        await getConvex()
          .mutation(api.performance.import.apiDeleteStorage, {
            serverKey: getConvexServerKey(),
            storageId,
          })
          .catch(() => undefined);
        throw importError(err);
      }
    },
    {
      signedIn: true,
      body: t.Object({
        file: t.File(),
        companyId: t.String(),
        force: t.Optional(t.String()),
        batchId: t.Optional(t.String()),
      }),
    },
  )

  // Blank upload template with the aggregated-format's recognized headers
  // — no Convex round-trip, the headers are static.
  .get("/template", () => xlsxResponse([TEMPLATE_HEADER], "Vorlage", "performance-vorlage.xlsx"), {
    signedIn: true,
  })

  // Per-employee KPI export for one month (port of the reference script's
  // `employee_export`).
  .get(
    "/export",
    async ({ caller, query }) => {
      const rows = await getConvex().query(api.performance.export.apiExportTeam, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        companyId: query.companyId as Id<"companies"> | undefined,
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
    {
      signedIn: true,
      query: t.Object({
        ym: t.String({ pattern: "^\\d{4}-\\d{2}$" }),
        companyId: t.Optional(t.String()),
      }),
    },
  );
