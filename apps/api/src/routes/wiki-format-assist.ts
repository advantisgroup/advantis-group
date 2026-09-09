import { Elysia, t } from "elysia";

import { anthropic } from "../lib/anthropic.js";
import { Errors } from "../lib/errors.js";
import { resolveOneDriveUser } from "../lib/onedrive/context.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireWikiManageAccess } from "../lib/wiki-access.js";

const MAX_HTML_CHARS = 40_000;
const MAX_INSTRUCTIONS_CHARS = 2_000;

/**
 * Unlike /wiki/import-assist (metadata-only by design), this endpoint is a
 * deliberate, explicit exception: a manager asks for the body to be
 * reformatted and reviews every changed section before anything is applied
 * (the diff/apply step lives client-side, see wiki-format-diff.ts). The
 * model must not touch meaning — only markup/structure.
 */
function buildPrompt(instructions: string): string {
  return `Du bekommst den HTML-Inhalt eines internen Wiki-Eintrags und Formatierungsanweisungen. Wende NUR diese Anweisungen an - ändere keine Fakten, keine Reihenfolge von Schritten und erfinde nichts hinzu. Wenn Text nicht erwähnt wird, lass ihn inhaltlich unverändert (nur ggf. neu formatiert gemäß den Anweisungen).

Formatierungsanweisungen:
${instructions}

Antworte AUSSCHLIESSLICH mit dem resultierenden HTML-Fragment - kein Markdown-Codeblock, keine Erklärung, kein umschließendes <html>/<body>.`;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}

export const wikiFormatAssistRoute = new Elysia().post(
  "/wiki/format-assist",
  async ({ request, body }) => {
    const user = await resolveOneDriveUser(request);
    requireWikiManageAccess(user);
    await rateLimit("wiki.formatAssist", user.clerkUserId, 10, "1 h");

    const html = body.html.trim();
    const instructions = body.instructions.trim();
    if (!html) throw Errors.badRequest("No content to format");
    if (!instructions) throw Errors.badRequest("No formatting instructions given");

    const response = await anthropic.createMessage({
      model: "claude-sonnet-4-6",
      max_tokens: 8_000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${buildPrompt(instructions.slice(0, MAX_INSTRUCTIONS_CHARS))}\n\n---\n\n${html.slice(0, MAX_HTML_CHARS)}`,
            },
          ],
        },
      ],
    });
    const responseText = response.content
      .map((block) => ("text" in block ? block.text : ""))
      .join("\n");
    const formattedHtml = stripFences(responseText);
    if (!formattedHtml) throw Errors.upstream("No parseable response from the model");
    return { formattedHtml };
  },
  {
    body: t.Object({
      html: t.String({ maxLength: MAX_HTML_CHARS + 1000 }),
      instructions: t.String({ maxLength: MAX_INSTRUCTIONS_CHARS + 500 }),
    }),
  },
);
