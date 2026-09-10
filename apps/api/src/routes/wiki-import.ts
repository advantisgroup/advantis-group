import { Elysia, t } from "elysia";

import { parseModelJson, runModelText, startAiRun, str, strList } from "../lib/ai.js";
import { Errors } from "../lib/errors.js";
import { resolveOneDriveUser } from "../lib/onedrive/context.js";
import { rateLimit } from "../lib/rate-limit.js";

const MAX_TEXT_CHARS = 20_000;

/**
 * Deliberately metadata-only — thema/tags/category, never body content.
 * The extracted text this runs on is a wiki entry's actual (often
 * safety/compliance) content; letting a model rewrite or "clean up" that
 * content is a real risk (a silently reordered incident-response step, a
 * softened warning), not just a quality nitpick. Suggesting a title/tags is
 * low-stakes and easy for a human to eyeball-verify; rewriting procedural
 * text is not. The body HTML this endpoint is fed is never echoed back or
 * altered — only three short fields come out.
 */
const ASSIST_PROMPT = `Du bekommst den reinen Text eines internen Wiki-Eintrags (bereits aus einem hochgeladenen Dokument extrahiert). Schlage NUR Metadaten vor - schreibe den Inhalt nicht um, kürze ihn nicht und erfinde keine neuen Fakten.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown, ohne Erklärung:
{
  "thema": "Kurzer, prägnanter Titel (max. 8 Wörter)",
  "tags": ["Stichwort1", "Stichwort2"],
  "categoryHint": "Ein kurzer Begriff, der die Kategorie des Dokuments beschreibt (z. B. \\"IT-Sicherheit\\", \\"Onboarding\\")"
}
Maximal 6 Stichwörter. Wenn du dir bei einem Feld nicht sicher bist, lass es leer (Titel: leerer String, Stichwörter: leeres Array, categoryHint: leerer String).`;

<<<<<<< Updated upstream
interface AssistResult {
  thema: string;
  tags: string[];
  categoryHint: string;
}

function parseAssist(text: string): AssistResult {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw Errors.upstream("No parseable response from the model");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw Errors.upstream("Could not read the model's response");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw Errors.upstream("The model's response had an unexpected shape");
  }
  const data = parsed as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    thema: str(data.thema).slice(0, 200),
    tags: Array.isArray(data.tags)
      ? data.tags
          .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
          .map((tag) => tag.trim())
          .slice(0, 6)
      : [],
    categoryHint: str(data.categoryHint).slice(0, 100),
  };
}

/** Same authorization shape as OneDrive's wiki-attach endpoint: manager rank
 *  or the standalone `manage_guidebooks` capability (`canWriteWiki`). */
function requireWikiManageAccess(user: { role: string; canWriteWiki?: boolean }): void {
  if (user.role !== "admin" && user.role !== "manager" && !user.canWriteWiki) {
    throw Errors.forbidden("Wiki management access required");
  }
}

=======
>>>>>>> Stashed changes
export const wikiImportRoute = new Elysia().post(
  "/wiki/import-assist",
  async ({ request, body }) => {
    const user = await resolveOneDriveUser(request);
    requireWikiManageAccess(user);
    await rateLimit("wiki.importAssist", user.clerkUserId, 10, "1 h");

    const text = body.text.trim();
    if (!text) throw Errors.badRequest("No text to analyze");

    return await startAiRun(
      {
        clerkUserId: user.clerkUserId,
        kind: "wikiMeta",
        subjectKey: `wikiMeta:${body.subjectKey}`,
        href: body.href,
      },
      async (run) => {
        const data = parseModelJson(
          await runModelText(run, {
            max_tokens: 400,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `${ASSIST_PROMPT}\n\n---\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
                  },
                ],
              },
            ],
          }),
        );
        return JSON.stringify({
          thema: str(data.thema).slice(0, 200),
          tags: strList(data.tags).slice(0, 6),
          categoryHint: str(data.categoryHint).slice(0, 100),
        });
      },
    );
  },
  {
    body: t.Object({
      text: t.String({ maxLength: MAX_TEXT_CHARS + 1000 }),
      subjectKey: t.String({ minLength: 1, maxLength: 200 }),
      href: t.Optional(t.String({ maxLength: 300 })),
    }),
  },
);
