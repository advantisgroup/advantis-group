import { Elysia, t } from "elysia";

import { BLACKLIST_FORM_URL, buildBlacklistPayload, looksLikeUrl } from "../lib/blacklist-form.js";
import { getClerkClient } from "../lib/clerk.js";
import { ApiError, Errors } from "../lib/errors.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

/** Name (sonst E-Mail) des Aufrufers für die Fußzeile in „Sonstige Info“. */
async function callerDisplayName(clerkUserId: string): Promise<string> {
  try {
    const user = await getClerkClient().users.getUser(clerkUserId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return name || user.primaryEmailAddress?.emailAddress || clerkUserId;
  } catch (error) {
    console.error("[blacklist] Clerk-Nutzer", error);
    return clerkUserId;
  }
}

/**
 * POST /blacklist — trägt einen Kunden/Interessenten in das Black-List-
 * Google-Formular von UTA ein (Schnellleiste im Wiki). Das Formular braucht
 * keine Anmeldung; wir senden serverseitig, damit der Mitarbeiter-Name
 * verlässlich angehängt wird.
 */
export const blacklistRoute = new Elysia().use(authed).post(
  "/blacklist",
  async ({ caller, request, body }) => {
    requireFirstPartyOrigin(request);
    await rateLimit("blacklist-submit", caller.clerkUserId, 20, "10 m");
    if (!looksLikeUrl(body.salesforceUrl)) {
      throw Errors.badRequest("Bitte den Salesforce-Link vollständig (mit https://) einfügen.");
    }
    if (!body.contactName.trim()) throw Errors.badRequest("Bitte den Ansprechpartner angeben.");
    const submittedBy = await callerDisplayName(caller.clerkUserId);
    let response: Response;
    try {
      response = await fetch(BLACKLIST_FORM_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: buildBlacklistPayload(body, submittedBy).toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error("[blacklist] Google Forms", error);
      throw new ApiError(502, "upstream", "Das UTA-Formular ist gerade nicht erreichbar.");
    }
    if (response.status !== 200) {
      console.error("[blacklist] Google Forms status", response.status);
      throw new ApiError(
        502,
        "upstream",
        `Das UTA-Formular hat den Eintrag abgelehnt (HTTP ${response.status}).`,
      );
    }
    return { ok: true };
  },
  {
    signedIn: true,
    body: t.Object({
      salesforceUrl: t.String({ minLength: 1, maxLength: 1000 }),
      accountId: t.Optional(t.String({ maxLength: 50 })),
      contactName: t.String({ minLength: 1, maxLength: 200 }),
      choice: t.Union([t.Literal("delete_all"), t.Literal("keep_name")]),
      note: t.Optional(t.String({ maxLength: 2000 })),
    }),
  },
);
