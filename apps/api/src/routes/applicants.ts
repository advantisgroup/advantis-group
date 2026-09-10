import { randomUUID } from "node:crypto";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Elysia, t } from "elysia";

import {
  AiRunError,
  parseModelJson,
  runEncryptionKey,
  runModelText,
  startAiRun,
  str,
  strList,
  type AiRunContext,
} from "../lib/ai.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { requireAuth } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";
import { autoProfil } from "../lib/types.js";

const MAX_CV_BYTES = 3.5 * 1024 * 1024;

const EXTRACTION_PROMPT = `Du erhältst eine Bewerbung (Lebenslauf/Anschreiben) als PDF.
Extrahiere die Daten des Bewerbers und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown, ohne Erklärung:
{
  "name": "Vor- und Nachname",
  "email": "",
  "telefon": "",
  "adresse": "",
  "geburtsdatum": "",
  "position": "Angestrebte oder aktuelle Position",
  "skills": ["Skill 1", "Skill 2"],
  "ausbildung": "Kurze Zusammenfassung der Ausbildung",
  "berufserfahrung": "Kurze Zusammenfassung der Berufserfahrung",
  "zusammenfassung": "2-3 Sätze Gesamteindruck / Profil"
}
Nicht auffindbare Felder als leeren String bzw. leeres Array lassen. Skills so vollständig wie möglich auflisten (Fachkenntnisse, Software, Sprachen, Zertifikate).`;

interface ExtractedApplicant {
  name: string;
  email: string;
  telefon: string;
  adresse: string;
  geburtsdatum: string;
  position: string;
  skills: string[];
  ausbildung: string;
  berufserfahrung: string;
  zusammenfassung: string;
}

interface DuplicateMatch {
  applicantId: Id<"applicants">;
  name: string;
  matchedOn: "email" | "telefon";
}

/** What a finished cvExtract run holds. The duplicate branch keeps the
 * extracted fields so "create anyway" never has to read the PDF twice. */
type CvExtractOutput =
  | { kind: "created"; applicantId: Id<"applicants">; name: string; fileName: string }
  | {
      kind: "duplicate";
      duplicate: DuplicateMatch;
      pendingStorageId: Id<"_storage">;
      extractedFields: ExtractedApplicant;
      fileName: string;
    };

function validatePdf(file: { type: string; size: number }): void {
  if (file.type !== "application/pdf") {
    throw Errors.badRequest("Bitte eine PDF-Datei hochladen");
  }
  if (file.size > MAX_CV_BYTES) {
    throw Errors.badRequest("Datei größer als 3,5 MB");
  }
}

async function runExtraction(
  run: AiRunContext,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ExtractedApplicant> {
  const data = parseModelJson(
    await runModelText(run, {
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(bytes).toString("base64"),
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  );
  const extracted = {
    name: str(data.name),
    email: str(data.email),
    telefon: str(data.telefon),
    adresse: str(data.adresse),
    geburtsdatum: str(data.geburtsdatum),
    position: str(data.position),
    skills: strList(data.skills),
    ausbildung: str(data.ausbildung),
    berufserfahrung: str(data.berufserfahrung),
    zusammenfassung: str(data.zusammenfassung),
  };
  // A CV the model couldn't find a name in is almost always a scan with no
  // text layer — a retry won't help, manual entry will.
  if (!extracted.name) throw new AiRunError("no_content", false);
  return extracted;
}

/** Stages raw PDF bytes into Convex file storage, returning the storageId. */
async function stageBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Id<"_storage">> {
  const uploadUrl = await getConvex().mutation(api.applicants.apiGenerateStagingUrl, {
    serverKey: getConvexServerKey(),
  });
  const staged = await fetch(uploadUrl, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: bytes,
  });
  if (!staged.ok) {
    console.error("[applicants] staging upload failed:", staged.status);
    throw Errors.internal("Die Datei konnte nicht gespeichert werden");
  }
  const { storageId } = (await staged.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

async function createFromExtraction(
  createdByUserId: Id<"users">,
  extracted: ExtractedApplicant,
  storageId: Id<"_storage">,
  fileName: string,
): Promise<Id<"applicants">> {
  const profiles = await getConvex().query(api.applicants.apiListProfiles, {
    serverKey: getConvexServerKey(),
  });
  const profilId = autoProfil(
    profiles.map((p) => ({ id: p._id, name: p.name, skills: p.skills })),
    extracted.position,
  );
  const { applicantId } = await getConvex().mutation(api.applicants.apiCreateFromExtraction, {
    serverKey: getConvexServerKey(),
    createdByUserId,
    name: extracted.name,
    email: extracted.email || undefined,
    telefon: extracted.telefon || undefined,
    adresse: extracted.adresse || undefined,
    geburtsdatum: extracted.geburtsdatum || undefined,
    position: extracted.position || undefined,
    skills: extracted.skills,
    ausbildung: extracted.ausbildung || undefined,
    berufserfahrung: extracted.berufserfahrung || undefined,
    zusammenfassung: extracted.zusammenfassung || undefined,
    profilId: profilId ? (profilId as Id<"applicantSkillProfiles">) : undefined,
    storageId,
    fileName,
  });
  return applicantId;
}

async function requireApplicantAccess(clerkUserId: string) {
  const access = await getConvex().query(api.applicants.apiCheckAccess, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  if (!access?.hasAccess) throw Errors.forbidden();
  return access;
}

export const applicantsRoute = new Elysia()
  /** One run per PDF, so a batch can be dropped in and left alone — each
   * file lands in the import tray on its own as it finishes. */
  .post(
    "/applicants/extract",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("applicants.extract", clerkUserId, 20, "1 m");
      const access = await requireApplicantAccess(clerkUserId);

      const { file } = body;
      validatePdf(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileName = file.name;

      return await startAiRun(
        { clerkUserId, kind: "cvExtract", subjectKey: `cvExtract:${randomUUID()}`, href: "/hr" },
        async (run) => {
          const extracted = await runExtraction(run, bytes);
          run.phase("finishing");

          const duplicate = await getConvex().query(api.applicants.apiFindDuplicateByContact, {
            serverKey: getConvexServerKey(),
            email: extracted.email || undefined,
            telefon: extracted.telefon || undefined,
          });
          const storageId = await stageBytes(bytes);
          const output: CvExtractOutput = duplicate
            ? {
                kind: "duplicate",
                duplicate,
                pendingStorageId: storageId,
                extractedFields: extracted,
                fileName,
              }
            : {
                kind: "created",
                applicantId: await createFromExtraction(
                  access.userId,
                  extracted,
                  storageId,
                  fileName,
                ),
                name: extracted.name,
                fileName,
              };
          return JSON.stringify(output);
        },
      );
    },
    { body: t.Object({ file: t.File() }) },
  )
  /** The "not the same person, create a new record" answer to a duplicate —
   * reuses what the run already read instead of paying for it again. */
  .post("/applicants/extract/:runId/create", async ({ request, params }) => {
    const { clerkUserId } = await requireAuth(request);
    const access = await requireApplicantAccess(clerkUserId);
    const run = await getConvex().query(api.aiRuns.apiGet, {
      serverKey: getConvexServerKey(),
      clerkUserId,
      runId: params.runId,
    });
    if (!run || run.kind !== "cvExtract" || run.status !== "done" || !run.output) {
      throw Errors.notFound("Import not found");
    }
    const result = JSON.parse(decrypt(run.output, runEncryptionKey("cvExtract"))) as CvExtractOutput;
    if (result.kind !== "duplicate") throw Errors.badRequest("Already created");
    const applicantId = await createFromExtraction(
      access.userId,
      result.extractedFields,
      result.pendingStorageId,
      result.fileName,
    );
    return { applicantId };
  })
  /**
   * Re-runs extraction against a CV for an EXISTING applicant, without
   * persisting anything — the client reviews the result (merged with the
   * applicant's current values) and drives `applicants.update` +
   * `applicants.addDocument` itself. Avoids `apiCreateFromExtraction`
   * entirely so a rescan can never create a duplicate applicant.
   */
  .post(
    "/applicants/rescan",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("applicants.rescan", clerkUserId, 20, "1 m");
      await requireApplicantAccess(clerkUserId);

      const { file, applicantId } = body;
      validatePdf(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileName = file.name;

      return await startAiRun(
        {
          clerkUserId,
          kind: "cvRescan",
          subjectKey: `cvRescan:${applicantId}`,
          href: `/hr/${applicantId}/dokumente`,
        },
        async (run) => {
          const extractedFields = await runExtraction(run, bytes);
          run.phase("finishing");
          const storageId = await stageBytes(bytes);
          return JSON.stringify({ extractedFields, storageId, fileName });
        },
      );
    },
    { body: t.Object({ file: t.File(), applicantId: t.String({ maxLength: 64 }) }) },
  );
