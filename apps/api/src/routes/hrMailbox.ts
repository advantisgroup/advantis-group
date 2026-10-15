import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";

import { ApiError, Errors } from "../lib/errors.js";
import { type Id } from "@advantis/convex/dataModel";

import {
  MailAuthError,
  assertMailAvailable,
  checkLogin,
  decryptMailPassword,
  encryptMailPassword,
  sendFromMailbox,
} from "../lib/mail.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

/**
 * PUT /hr/mailbox — HR members set the shared application inbox (e.g.
 * bewerbung@). Same steps as a personal mailbox: the login is tried against
 * IONOS first, then only the encrypted password is stored. Imports then run
 * as the person who set it (hr/mailbox.ts, internal/hr-mailbox.ts).
 */
export const hrMailboxRoute = new Elysia()
  .use(authed)
  .put(
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
  )
  /**
   * POST /hr/applicants/:applicantId/email — sends a mail to the applicant
   * from the HR mailbox, exactly as written in the send dialog (templates are
   * filled in there, not here), then logs it in the applicant's history.
   */
  .post(
    "/hr/applicants/:applicantId/email",
    async ({ caller, request, params, body }) => {
      requireFirstPartyOrigin(request);
      assertMailAvailable();
      await rateLimit("hr-applicant-email", caller.clerkUserId, 30, "10 m");
      const applicantId = params.applicantId as Id<"applicants">;
      const context = await caller.convex.query(api.hr.emails.apiSendContext, { applicantId });
      if (!context.mailbox) {
        throw Errors.badRequest("Kein Bewerbungs-Postfach eingerichtet (HR → Zugriff).");
      }
      if (!context.to)
        throw Errors.badRequest("Für diesen Bewerber ist keine E-Mail-Adresse hinterlegt.");
      const subject = body.subject.trim();
      const text = body.text.trim();
      if (!subject || !text) throw Errors.badRequest("Betreff und Text dürfen nicht leer sein.");
      try {
        await sendFromMailbox(
          {
            email: context.mailbox.email,
            password: decryptMailPassword(context.mailbox.passwordEnc),
          },
          { fromName: "advantis GmbH", to: context.to, toName: context.name, subject, text },
        );
      } catch (error) {
        if (error instanceof MailAuthError) {
          throw Errors.badRequest(
            "IONOS hat die Anmeldung des Bewerbungs-Postfachs abgelehnt – Passwort unter HR → Zugriff neu hinterlegen.",
          );
        }
        const reason =
          (error as { code?: string }).code ??
          (error instanceof Error ? error.message : String(error));
        console.error("[hr-mailbox.send]", reason, error);
        throw new ApiError(502, "upstream", `Versand über IONOS fehlgeschlagen (${reason}).`);
      }
      await caller.convex.mutation(api.hr.emails.apiRecordSent, {
        applicantId,
        kategorie: body.kategorie,
        subject,
        body: text,
        sentFrom: context.mailbox.email,
        to: context.to,
      });
      return { ok: true };
    },
    {
      signedIn: true,
      params: t.Object({ applicantId: t.String({ maxLength: 64 }) }),
      body: t.Object({
        kategorie: t.Union([
          t.Literal("telefonisch_nicht_erreicht"),
          t.Literal("einladung"),
          t.Literal("absage"),
          t.Literal("sonstiges"),
        ]),
        subject: t.String({ minLength: 1, maxLength: 300 }),
        text: t.String({ minLength: 1, maxLength: 20000 }),
      }),
    },
  );
