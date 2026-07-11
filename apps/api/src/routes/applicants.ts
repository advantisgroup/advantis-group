import { Anthropic } from "@anthropic-ai/sdk";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { autoProfil } from "@advantis/types";
import { Elysia, t } from "elysia";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { requireEnv } from "../lib/env.js";
import { Errors } from "../lib/errors.js";
import { requireAuth } from "../lib/middleware.js";

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

function parseExtraction(text: string): ExtractedApplicant {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw Errors.upstream("Keine auswertbaren Daten im PDF gefunden");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw Errors.upstream("Antwort des Modells konnte nicht gelesen werden");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw Errors.upstream("Antwort des Modells hatte ein unerwartetes Format");
  }
  const data = parsed as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    name: str(data.name),
    email: str(data.email),
    telefon: str(data.telefon),
    adresse: str(data.adresse),
    geburtsdatum: str(data.geburtsdatum),
    position: str(data.position),
    skills: Array.isArray(data.skills)
      ? data.skills.filter(s => typeof s === "string")
      : [],
    ausbildung: str(data.ausbildung),
    berufserfahrung: str(data.berufserfahrung),
    zusammenfassung: str(data.zusammenfassung),
  };
}

export const applicantsRoute = new Elysia().post(
  "/applicants/extract",
  async ({ request, body }) => {
    const { clerkUserId } = await requireAuth(request);

    const access = await getConvex().query(api.applicants.apiCheckAccess, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
    if (!access?.hasAccess) throw Errors.forbidden();

    const { file } = body;
    if (file.type !== "application/pdf") {
      throw Errors.badRequest("Bitte eine PDF-Datei hochladen");
    }
    if (file.size > MAX_CV_BYTES) {
      throw Errors.badRequest("Datei größer als 3,5 MB");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");

    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
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
                data: base64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    const text = response.content
      .map(block => ("text" in block ? block.text : ""))
      .join("\n");
    const extracted = parseExtraction(text);
    if (!extracted.name) {
      throw Errors.upstream("Im PDF konnte kein Name gefunden werden");
    }

    const profiles = await getConvex().query(api.applicants.apiListProfiles, {
      serverKey: getConvexServerKey(),
    });
    const profilId = autoProfil(
      profiles.map(p => ({ id: p._id, name: p.name, skills: p.skills })),
      extracted.position
    );

    const uploadUrl = await getConvex().mutation(
      api.applicants.apiGenerateStagingUrl,
      {
        serverKey: getConvexServerKey(),
      }
    );
    const staged = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: bytes,
    });
    if (!staged.ok) {
      console.error("[applicants] staging upload failed:", staged.status);
      throw Errors.internal("Die Datei konnte nicht gespeichert werden");
    }
    const { storageId } = (await staged.json()) as {
      storageId: Id<"_storage">;
    };

    const { applicantId } = await getConvex().mutation(
      api.applicants.apiCreateFromExtraction,
      {
        serverKey: getConvexServerKey(),
        createdByUserId: access.userId,
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
        profilId: profilId
          ? (profilId as Id<"applicantSkillProfiles">)
          : undefined,
        storageId,
        fileName: file.name,
      }
    );

    return { applicantId };
  },
  {
    body: t.Object({
      file: t.File(),
    }),
  }
);
