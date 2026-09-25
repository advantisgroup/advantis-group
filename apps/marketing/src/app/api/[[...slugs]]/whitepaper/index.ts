import { createHash, randomBytes } from "node:crypto";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Elysia, t } from "elysia";
import { Resend } from "resend";

import {
  WhitepaperConfirmEmail,
  WhitepaperDeliveryEmail,
} from "@/components/email/whitepaper-emails";
import { defaultLocale, locales, type Locale } from "@/i18n/request";
import { currentAccount } from "@/lib/account";
import {
  CONFIRM_TOKEN_TTL_MS,
  readWhitepaper,
  WHITEPAPER_CONSENT_VERSION,
  WHITEPAPER_FILENAME,
  whitepaperExists,
} from "@/lib/whitepaper";
import { convex, serverKey } from "@/lib/convex-server";
import { clientIp } from "@/lib/rate-limit";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `ADVANTIS GROUP <${process.env.NEXT_PUBLIC_EMAIL_ADRESS}>`;

const errorSchema = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
  detail: t.Optional(t.String()),
});

const SUBJECTS: Record<Locale, { confirm: string; delivery: string }> = {
  de: {
    confirm: "Bitte bestätige deine E-Mail-Adresse",
    delivery: "Dein Whitepaper: KI-Tools im Vertrieb",
  },
  en: {
    confirm: "Please confirm your email address",
    delivery: "Your whitepaper: AI tools in sales",
  },
  fr: {
    confirm: "Merci de confirmer votre adresse e-mail",
    delivery: "Votre livre blanc : les outils IA dans la vente",
  },
  zh: {
    confirm: "请确认您的电子邮件地址",
    delivery: "您的白皮书：销售中的 AI 工具",
  },
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const asLocale = (value: string): Locale =>
  locales.includes(value as Locale) ? (value as Locale) : defaultLocale;

const siteOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_DOMAIN?.trim().replace(/\/+$/, "");
  if (!configured) return "http://localhost:3000";
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
};

type Lead = {
  leadId: Id<"whitepaperLeads">;
  email: string;
  company: string;
  firstName: string;
  lastName: string;
  phone: string;
  locale: string;
};

/** Mails the document, records it, and tells the team about the lead. */
async function deliver(lead: Lead) {
  const locale = asLocale(lead.locale);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [lead.email],
    subject: SUBJECTS[locale].delivery,
    react: WhitepaperDeliveryEmail({
      firstName: lead.firstName,
      lastName: lead.lastName,
      locale,
    }),
    attachments: [
      {
        filename: WHITEPAPER_FILENAME,
        content: (await readWhitepaper()).toString("base64"),
      },
    ],
  });

  await convex!.mutation(api.marketing.leads.markDelivered, {
    serverKey: serverKey(),
    leadId: lead.leadId,
    emailId: data?.id,
    error: error?.message,
  });
  if (error) return { error: error.message };

  // The team has no lead inbox of its own — this mail is how a confirmed
  // lead actually reaches someone, the same way contact submissions do.
  await resend.emails.send({
    from: FROM,
    to: [process.env.NEXT_PUBLIC_EMAIL_ADRESS!],
    replyTo: lead.email,
    subject: `Whitepaper-Lead: ${lead.firstName} ${lead.lastName} (${lead.company})`,
    text: [
      "Ein Whitepaper-Download wurde bestätigt.",
      "",
      `Firma:    ${lead.company}`,
      `Name:     ${lead.firstName} ${lead.lastName}`,
      `E-Mail:   ${lead.email}`,
      `Telefon:  ${lead.phone}`,
      `Sprache:  ${locale}`,
      `Einwilligung: ${WHITEPAPER_CONSENT_VERSION}`,
    ].join("\n"),
  });
  return { error: null };
}

export const whitepaper = new Elysia({ prefix: "/whitepaper" })
  .post(
    "/request",
    async ({ body, headers, set }) => {
      if (!body.consent) {
        set.status = 400;
        return { error: "Consent is required.", code: "consent_missing" };
      }

      if (!whitepaperExists()) {
        set.status = 503;
        return {
          error: "The whitepaper is not available yet.",
          code: "whitepaper_unavailable",
        };
      }

      if (!convex) {
        set.status = 500;
        return {
          error: "Server configuration error.",
          code: "convex_not_configured",
          detail: "NEXT_PUBLIC_CONVEX_URL is missing, so whitepaper leads cannot be saved.",
        };
      }

      const locale = asLocale(body.locale ?? defaultLocale);
      const email = body.email.trim().toLowerCase();
      const token = randomBytes(32).toString("hex");

      try {
        // Signed in with this address, verified by Clerk: owning it is already
        // proven, so the document goes out now instead of after a mailed link.
        const account = await currentAccount();
        if (account?.emails.includes(email)) {
          const fields = {
            email,
            company: body.company.trim(),
            firstName: body.firstName.trim(),
            lastName: body.lastName.trim(),
            phone: body.phone.trim(),
            locale,
          };
          const { leadId } = await convex.mutation(api.marketing.leads.saveAccountRequest, {
            serverKey: serverKey(),
            ...fields,
            consentVersion: WHITEPAPER_CONSENT_VERSION,
            requestIp: clientIp(headers),
            clerkUserId: account.clerkUserId,
          });
          const { error } = await deliver({ leadId, ...fields });
          if (error) {
            set.status = 500;
            return { error: "The whitepaper could not be sent.", code: "delivery_send_failed" };
          }
          return { ok: true, delivered: true };
        }

        const { leadId, throttled } = await convex.mutation(api.marketing.leads.saveRequest, {
          serverKey: serverKey(),
          email,
          company: body.company.trim(),
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          phone: body.phone.trim(),
          locale,
          consentVersion: WHITEPAPER_CONSENT_VERSION,
          confirmTokenHash: sha256(token),
          confirmTokenExpiresAt: Date.now() + CONFIRM_TOKEN_TTL_MS,
          requestIp: clientIp(headers),
        });

        // A second submission inside the cooldown keeps the token already in
        // the recipient's inbox alive instead of mailing a fresh one, so the
        // form can't be pointed at someone else's address as a mail cannon.
        if (throttled) {
          return { ok: true };
        }

        const { data, error } = await resend.emails.send({
          from: FROM,
          to: [email],
          subject: SUBJECTS[locale].confirm,
          react: WhitepaperConfirmEmail({
            firstName: body.firstName.trim(),
            lastName: body.lastName.trim(),
            confirmUrl: `${siteOrigin()}/${locale}/whitepaper/confirm?token=${token}`,
            locale,
          }),
        });

        if (error) {
          set.status = 500;
          return {
            error: "Failed to send the confirmation email.",
            code: "confirmation_send_failed",
            detail: error.message,
          };
        }

        await convex.mutation(api.marketing.leads.markConfirmationSent, {
          serverKey: serverKey(),
          leadId,
          emailId: data?.id,
        });

        return { ok: true };
      } catch (err) {
        console.error("[whitepaper] request failed:", err);
        set.status = 500;
        return {
          error: "Failed to process the request. Please try again.",
          code: "whitepaper_request_failed",
          detail: err instanceof Error ? err.message : "Unknown error.",
        };
      }
    },
    {
      body: t.Object({
        company: t.String({ minLength: 1 }),
        firstName: t.String({ minLength: 1 }),
        lastName: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
        phone: t.String({ minLength: 1 }),
        consent: t.Boolean(),
        locale: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), delivered: t.Optional(t.Boolean()) }),
        400: errorSchema,
        500: errorSchema,
        503: errorSchema,
      },
    },
  )
  .post(
    "/confirm",
    async ({ body, headers, set }) => {
      if (!convex) {
        set.status = 500;
        return {
          error: "Server configuration error.",
          code: "convex_not_configured",
          detail: "NEXT_PUBLIC_CONVEX_URL is missing, so the confirmation cannot be recorded.",
        };
      }

      try {
        const result = await convex.mutation(api.marketing.leads.confirmRequest, {
          serverKey: serverKey(),
          confirmTokenHash: sha256(body.token),
          confirmIp: clientIp(headers),
        });

        if (result.status === "invalid") {
          set.status = 404;
          return { error: "This confirmation link is not valid.", code: "token_invalid" };
        }

        if (result.status === "expired") {
          set.status = 410;
          return { error: "This confirmation link has expired.", code: "token_expired" };
        }

        if (result.status === "alreadyDelivered") {
          return { ok: true, email: result.email, alreadyDelivered: true };
        }

        const { error } = await deliver({ ...result, leadId: result.leadId });
        if (error) {
          set.status = 500;
          return {
            error: "Confirmed, but the whitepaper could not be sent.",
            code: "delivery_send_failed",
            detail: error,
          };
        }
        return { ok: true, email: result.email, alreadyDelivered: false };
      } catch (err) {
        console.error("[whitepaper] confirm failed:", err);
        set.status = 500;
        return {
          error: "Failed to confirm. Please try again.",
          code: "whitepaper_confirm_failed",
          detail: err instanceof Error ? err.message : "Unknown error.",
        };
      }
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
      }),
      response: {
        200: t.Object({
          ok: t.Boolean(),
          email: t.String(),
          alreadyDelivered: t.Boolean(),
        }),
        404: errorSchema,
        410: errorSchema,
        500: errorSchema,
      },
    },
  );
