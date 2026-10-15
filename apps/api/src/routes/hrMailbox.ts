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
 * PUT /hr/mailbox — HR members set the shared application inbox (e.g.
 * bewerbung@). Same steps as a personal mailbox: the login is tried against
 * IONOS first, then only the encrypted password is stored. Imports then run
 * as the person who set it (hr/mailbox.ts, internal/hr-mailbox.ts).
 */
export const hrMailboxRoute = new Elysia().use(authed).put(
  "/hr/mailbox",
  async ({ caller, request, body }) => {
    requireFirstPartyOrigin(request);
    assertMailAvailable();
    await rateLimit("hr-mailbox-set", caller.clerkUserId, 10, "10 m");
    // Before touching IONOS, so this can't be used to test passwords.
    await caller.convex.query(api.hr.mailbox.apiRequireAccess, {});
    const email = body.email.trim().toLowerCase();
    let passwordEnc: string;
    try {
      passwordEnc = encryptMailPassword(body.password);
    } catch (error) {
      console.error("[hr-mailbox.set] MAIL_ENC_KEY", error);
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
      console.error("[hr-mailbox.set] IONOS login", reason, error);
      throw new ApiError(502, "upstream", `IONOS nicht erreichbar (${reason}).`);
    }
    await caller.convex.mutation(api.hr.mailbox.apiSet, { email, passwordEnc });
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
