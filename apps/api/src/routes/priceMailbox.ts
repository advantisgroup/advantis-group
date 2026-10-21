import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";

import { ApiError, Errors } from "../lib/errors.js";
import {
  MailAuthError,
  assertMailAvailable,
  checkLogin,
  encryptMailPassword,
} from "../lib/mail.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

/**
 * PUT /price-mailbox — Admins hinterlegen das Postfach, in dem jeden Morgen
 * die Preisliste ankommt (chefsache@). Wie beim HR-Postfach: erst wird die
 * Anmeldung bei IONOS geprüft, gespeichert wird nur das verschlüsselte
 * Passwort (wiki/priceMailbox.ts, internal/price-mailbox.ts).
 */
export const priceMailboxRoute = new Elysia().use(authed).put(
  "/price-mailbox",
  async ({ caller, request, body }) => {
    requireFirstPartyOrigin(request);
    assertMailAvailable();
    await rateLimit("price-mailbox-set", caller.clerkUserId, 10, "10 m");
    // Vor IONOS, damit die Route nicht zum Passwort-Testen taugt.
    await caller.convex.query(api.wiki.priceMailbox.apiRequireAdmin, {});
    const email = body.email.trim().toLowerCase();
    let passwordEnc: string;
    try {
      passwordEnc = encryptMailPassword(body.password);
    } catch (error) {
      console.error("[price-mailbox.set] MAIL_ENC_KEY", error);
      throw new ApiError(500, "internal", "MAIL_ENC_KEY fehlt oder ist ungültig.");
    }
    try {
      await checkLogin({ email, password: body.password });
    } catch (error) {
      if (error instanceof MailAuthError) {
        throw Errors.badRequest("IONOS hat Adresse oder Passwort abgelehnt.");
      }
      const reason =
        (error as { code?: string }).code ??
        (error instanceof Error ? error.message : String(error));
      console.error("[price-mailbox.set] IONOS login", reason, error);
      throw new ApiError(502, "upstream", `IONOS nicht erreichbar (${reason}).`);
    }
    await caller.convex.mutation(api.wiki.priceMailbox.apiSet, { email, passwordEnc });
    return { ok: true };
  },
  {
    signedIn: true,
    body: t.Object({
      email: t.String({ format: "email", maxLength: 200 }),
      password: t.String({ minLength: 1, maxLength: 200 }),
    }),
  },
);
