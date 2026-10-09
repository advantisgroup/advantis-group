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
// the intranet sends bigger files through `/uploads/ticket` instead.
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
  const raw = err instanceof Error ? err.message : String(err);
  if (/timed? ?out|timeout/i.test(raw)) {
    return Errors.badRequest(
      "Die Verarbeitung hat zu lange gedauert und wurde abgebrochen. Die Datei ist vermutlich zu groß – bitte den Report in Salesforce filtern (z. B. nur aktueller und letzter Monat oder offene Leads) bzw. weniger Spalten exportieren und neu hochladen.",
    );
  }
  if (/memory/i.test(raw)) {
    return Errors.badRequest(
      "Die Datei ist zu groß zum Verarbeiten (Arbeitsspeicher reicht nicht). Bitte den Report in Salesforce filtern bzw. weniger Spalten exportieren und neu hochladen.",
    );
  }
  return Errors.badRequest(
    "Import fehlgeschlagen, ohne genauen Grund vom Server. Bitte erneut versuchen; wenn es wieder passiert, der IT Dateiname und Uhrzeit schicken.",
  );
}

const STAGING_FAILED =
  "Die Datei konnte nicht zwischengespeichert werden. Bitte in ein paar Minuten erneut versuchen.";

/** Access runs through the intranet sign-in (Clerk): uploads are for
 * intranet admins, the export for whoever sees the dashboard's team view —
 * both checked in Convex (`performance/access.ts`, `performance/export.ts`). */
/** Bigger reports go straight from the browser into Convex storage (see
 * `/uploads/ticket` and `/uploads/stored`); the route then reads them back. */
const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;

const TOO_LARGE =
  "Die Datei ist größer als 25 MB. Bitte den Export auf weniger Spalten oder einen kürzeren Zeitraum beschränken oder als .xlsx speichern.";

function requireReportExtension(filename: string): void {
  const lowerName = filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw Errors.badRequest("Bitte eine .xlsx-, .xlsm- oder .csv-Datei auswählen.");
  }
}

async function deleteStaged(storageId: Id<"_storage">): Promise<void> {
  await getConvex()
    .mutation(api.performance.import.apiDeleteStorage, {
      serverKey: getConvexServerKey(),
      storageId,
    })
    .catch(() => undefined);
}

/**
 * Everything after the bytes are in hand, shared by both upload paths:
 * malware scan, duplicate check by content hash, staging (when the file
 * isn't in Convex storage yet) and the import itself.
 */
async function importReportBytes(input: {
  companyId: Id<"companies">;
  uploadedBy: string;
  filename: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** Already in Convex storage (direct upload); staged here otherwise. */
  storageId?: Id<"_storage">;
  force: boolean;
  batchId?: string;
}) {
  const { companyId, uploadedBy, filename, mime, bytes, force, batchId } = input;
  const report = await scanFile({ bytes, fileName: filename, declaredMime: mime });
  if (report.verdict === "blocked") {
    if (input.storageId) await deleteStaged(input.storageId);
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
      if (input.storageId) await deleteStaged(input.storageId);
      return {
        status: "duplicate" as const,
        filename: priorUpload.filename,
        uploadedAt: priorUpload.uploadedAt,
      };
    }
  }

  let storageId = input.storageId;
  if (!storageId) {
    const uploadUrl = await getConvex().mutation(api.performance.import.apiGenerateUploadUrl, {
      serverKey: getConvexServerKey(),
    });
    const staged = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": mime || "application/octet-stream" },
      body: bytes,
    });
    if (!staged.ok) {
      console.error("[performance] staging upload failed:", staged.status);
      throw Errors.badRequest(STAGING_FAILED);
    }
    storageId = ((await staged.json()) as { storageId: Id<"_storage"> }).storageId;
  }

  // Parsing (xlsx/csv detection, aggregation) happens inside Convex,
  // not here — a real Salesforce export can have tens of thousands of
  // rows, which blows past Convex's 8192-element array-argument limit
  // if shipped as a single argument. This route only stages the file
  // and hands off its storageId.
  try {
    const result = await getConvex().action(api.performance.uploadParse.apiImportReport, {
      serverKey: getConvexServerKey(),
      companyId,
      filename,
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
      // hash check above. Either way, drop the now-orphaned staged file.
      await deleteStaged(storageId);
    }
    return result;
  } catch (err) {
    // Nothing was imported or logged — don't keep the staged copy.
    await deleteStaged(storageId);
    throw importError(err);
  }
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
      requireReportExtension(file.name);
      if (file.size > MAX_UPLOAD_BYTES) {
        throw Errors.badRequest(
          "Die Datei ist größer als 4 MB. Bitte den Export auf weniger Spalten oder einen kürzeren Zeitraum beschränken oder als .xlsx speichern.",
        );
      }

      return importReportBytes({
        companyId,
        uploadedBy,
        filename: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        force: body.force === "true",
        batchId: body.batchId,
      });
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

  // Large files, step 1: a Convex upload URL plus a ticket. The browser
  // uploads the file there itself, so Vercel's ~4.5 MB body cap no longer
  // applies.
  .post(
    "/uploads/ticket",
    async ({ caller, body }) => {
      const companyId = body.companyId as Id<"companies">;
      await getConvex().query(api.performance.access.apiUploadAccess, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        companyId,
      });
      requireReportExtension(body.filename);
      if (body.size > MAX_DIRECT_UPLOAD_BYTES) throw Errors.badRequest(TOO_LARGE);
      await rateLimit("performance.upload", caller.clerkUserId, 120, "1 h");
      return getConvex().mutation(api.performance.import.apiCreateUploadTicket, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        companyId,
      });
    },
    {
      signedIn: true,
      body: t.Object({ companyId: t.String(), filename: t.String(), size: t.Number() }),
    },
  )

  // Large files, step 2: claims the ticket with the stored file and imports it.
  .post(
    "/uploads/stored",
    async ({ caller, body }) => {
      const companyId = body.companyId as Id<"companies">;
      const storageId = body.storageId as Id<"_storage">;
      const { uploadedBy } = await getConvex().query(api.performance.access.apiUploadAccess, {
        serverKey: getConvexServerKey(),
        clerkUserId: caller.clerkUserId,
        companyId,
      });
      requireReportExtension(body.filename);
      let claimed: { url: string; size: number; contentType: string | null };
      try {
        claimed = await getConvex().mutation(api.performance.import.apiClaimUploadTicket, {
          serverKey: getConvexServerKey(),
          ticketId: body.ticketId as Id<"performanceUploadTickets">,
          clerkUserId: caller.clerkUserId,
          companyId,
          storageId,
        });
      } catch (err) {
        throw importError(err);
      }
      const res = await fetch(claimed.url);
      if (!res.ok) {
        console.error("[performance] reading stored upload failed:", res.status);
        throw Errors.badRequest(STAGING_FAILED);
      }
      return importReportBytes({
        companyId,
        uploadedBy,
        filename: body.filename,
        mime: claimed.contentType ?? "application/octet-stream",
        bytes: new Uint8Array(await res.arrayBuffer()),
        storageId,
        force: body.force === true,
        batchId: body.batchId,
      });
    },
    {
      signedIn: true,
      body: t.Object({
        companyId: t.String(),
        ticketId: t.String(),
        storageId: t.String(),
        filename: t.String(),
        force: t.Optional(t.Boolean()),
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
