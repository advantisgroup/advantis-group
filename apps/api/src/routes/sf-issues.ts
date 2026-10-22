import { Elysia, t } from "elysia";

import { getClerkClient } from "../lib/clerk.js";
import { Errors } from "../lib/errors.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  SF_TOPICS,
  buildSfIssueRow,
  callSheet,
  isHttpUrl,
  parseSfIssueList,
} from "../lib/sf-issues.js";

/** Name (sonst E-Mail) des Aufrufers – landet in Spalte B „Consultant“. */
async function callerDisplayName(clerkUserId: string): Promise<string> {
  try {
    const user = await getClerkClient().users.getUser(clerkUserId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return name || user.primaryEmailAddress?.emailAddress || clerkUserId;
  } catch (error) {
    console.error("[sf-issues] Clerk-Nutzer", error);
    return clerkUserId;
  }
}

/**
 * POST /sf-issues – neues Salesforce-Problem in die Meldungs-Tabelle schreiben.
 * GET /sf-issues/mine – die eigenen Meldungen (neueste 50) mit Status.
 */
export const sfIssuesRoute = new Elysia()
  .use(authed)
  .post(
    "/sf-issues",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      await rateLimit("sf-issues-submit", caller.clerkUserId, 20, "10 m");
      if (!body.firma.trim()) throw Errors.badRequest("Bitte Firma/Kunde angeben.");
      if (!body.beschreibung.trim()) throw Errors.badRequest("Bitte das Problem beschreiben.");
      if (body.sfLink?.trim() && !isHttpUrl(body.sfLink)) {
        throw Errors.badRequest("Bitte den Salesforce-Link vollständig (mit https://) einfügen.");
      }
      const consultant = await callerDisplayName(caller.clerkUserId);
      const data = await callSheet("append", { row: buildSfIssueRow(body, consultant) });
      return { ok: true, row: Number(data.row) || null };
    },
    {
      signedIn: true,
      body: t.Object({
        project: t.String({ minLength: 1, maxLength: 50 }),
        camId: t.Optional(t.String({ maxLength: 60 })),
        firma: t.String({ minLength: 1, maxLength: 200 }),
        topic: t.Union(SF_TOPICS.map((topic) => t.Literal(topic))),
        beschreibung: t.String({ minLength: 1, maxLength: 2000 }),
        dringend: t.Boolean(),
        sfLink: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  )
  .get(
    "/sf-issues/mine",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      await rateLimit("sf-issues-list", caller.clerkUserId, 60, "10 m");
      const consultant = await callerDisplayName(caller.clerkUserId);
      const data = await callSheet("list", { consultant });
      return { items: parseSfIssueList(data) };
    },
    { signedIn: true },
  );
