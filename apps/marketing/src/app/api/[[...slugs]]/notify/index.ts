import { createHash, randomInt } from "node:crypto";

import { api } from "@advantis/convex/api";
import { currentUser } from "@clerk/nextjs/server";
import { Elysia, t } from "elysia";
import { Resend } from "resend";

import { NotifyCodeEmail, notifyCodeCopy } from "@/components/email/notify-code-email";
import { convex, serverKey } from "@/lib/convex-server";
import { allow, clientIp, limits } from "@/lib/rate-limit";
import { submissionsOpen } from "@/lib/submissions";

const resend = new Resend(process.env.RESEND_API_KEY);

const CODE_TTL_MS = 10 * 60 * 1000;

type Action = "subscribe" | "unsubscribe";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const errorSchema = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
  detail: t.Optional(t.String()),
});

const statusSchema = t.Union([
  t.Literal("subscribed"),
  t.Literal("duplicate"),
  t.Literal("unsubscribed"),
  t.Literal("codeSent"),
]);

const notConfigured = {
  error: "Server configuration error.",
  code: "convex_not_configured",
  detail: "NEXT_PUBLIC_CONVEX_URL is missing.",
};

/**
 * Signed in with this exact address, verified by Clerk? Then the person has
 * already proven they own it and doesn't need a code.
 */
async function ownsAddress(email: string) {
  const user = await currentUser();
  return (
    user?.emailAddresses.some(
      (address) =>
        address.emailAddress.toLowerCase() === email && address.verification?.status === "verified",
    ) ?? false
  );
}

/** Mails a fresh code, unless one just went out — then the one in the inbox still works. */
async function sendCode(email: string, action: Action, locale: string) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { throttled } = await convex!.mutation(api.marketing.emails.startNotifyCode, {
    serverKey: serverKey(),
    email,
    action,
    codeHash: sha256(code),
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  if (throttled) return;

  const { error } = await resend.emails.send({
    from: `ADVANTIS GROUP <${process.env.NEXT_PUBLIC_EMAIL_ADRESS}>`,
    to: [email],
    subject: notifyCodeCopy(locale).subject.replace("{code}", code),
    react: NotifyCodeEmail({ code, action, locale }),
  });
  if (error) throw new Error(error.message);
}

const failed = (err: unknown) => {
  console.error("[notify]", err);
  return {
    error: "Something went wrong. Please try again.",
    code: "notify_failed",
    detail: err instanceof Error ? err.message : undefined,
  };
};

export const notify = new Elysia()
  .post(
    "/notify",
    async ({ body, headers, set }) => {
      if (await submissionsOpen()) {
        set.status = 400;
        return { error: "Submissions are currently open — use the contact form directly." };
      }
      if (!convex) {
        set.status = 500;
        return notConfigured;
      }

      const email = body.email.trim().toLowerCase();

      try {
        if (await ownsAddress(email)) {
          const { duplicate } = await convex.mutation(api.marketing.emails.saveNotifyEmail, {
            serverKey: serverKey(),
            email,
          });
          return { ok: true, duplicate, status: duplicate ? "duplicate" : "subscribed" } as const;
        }

        if (!(await allow(limits.notifyCode, clientIp(headers)))) {
          set.status = 429;
          return { error: "Too many requests. Please try again later.", code: "rate_limited" };
        }

        await sendCode(email, "subscribe", body.locale ?? "de");
        return { ok: true, duplicate: false, status: "codeSent" } as const;
      } catch (err) {
        set.status = 500;
        return failed(err);
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        locale: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), duplicate: t.Boolean(), status: statusSchema }),
        400: errorSchema,
        429: errorSchema,
        500: errorSchema,
      },
    },
  )
  .post(
    "/notify/verify",
    async ({ body, headers, set }) => {
      if (!convex) {
        set.status = 500;
        return notConfigured;
      }
      if (!(await allow(limits.notifyVerify, clientIp(headers)))) {
        set.status = 429;
        return { error: "Too many attempts. Please try again later.", code: "rate_limited" };
      }

      try {
        const result = await convex.mutation(api.marketing.emails.redeemNotifyCode, {
          serverKey: serverKey(),
          email: body.email.trim().toLowerCase(),
          action: body.action,
          codeHash: sha256(body.code.trim()),
        });

        switch (result.status) {
          case "invalid":
            set.status = 400;
            return { error: "That code doesn't match.", code: "code_invalid" };
          case "expired":
            set.status = 410;
            return { error: "That code has expired.", code: "code_expired" };
          case "locked":
            set.status = 429;
            return { error: "Too many wrong codes.", code: "code_locked" };
          default:
            return { ok: true, status: result.status };
        }
      } catch (err) {
        set.status = 500;
        return failed(err);
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        code: t.String({ minLength: 6, maxLength: 6 }),
        action: t.Union([t.Literal("subscribe"), t.Literal("unsubscribe")]),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), status: statusSchema }),
        400: errorSchema,
        410: errorSchema,
        429: errorSchema,
        500: errorSchema,
      },
    },
  )
  /**
   * Leaving the list. Always answers the same way whether or not the address
   * was on it, so this can't be used to check who's subscribed.
   */
  .delete(
    "/notify/:email",
    async ({ params, query, headers, set }) => {
      if (!convex) {
        set.status = 500;
        return notConfigured;
      }

      const email = decodeURIComponent(params.email).trim().toLowerCase();
      if (!email) {
        set.status = 400;
        return { error: "Email parameter is required." };
      }

      try {
        if (await ownsAddress(email)) {
          await convex.mutation(api.marketing.emails.deleteNotifyEmail, {
            serverKey: serverKey(),
            email,
          });
          return { ok: true, email, status: "unsubscribed" } as const;
        }

        if (!(await allow(limits.notifyCode, clientIp(headers)))) {
          set.status = 429;
          return { error: "Too many requests. Please try again later.", code: "rate_limited" };
        }

        await sendCode(email, "unsubscribe", query.locale ?? "de");
        return { ok: true, email: null, status: "codeSent" } as const;
      } catch (err) {
        set.status = 500;
        return failed(err);
      }
    },
    {
      params: t.Object({ email: t.String() }),
      query: t.Object({ locale: t.Optional(t.String()) }),
      response: {
        200: t.Object({ ok: t.Boolean(), email: t.Nullable(t.String()), status: statusSchema }),
        400: t.Object({ error: t.String() }),
        429: errorSchema,
        500: errorSchema,
      },
    },
  );
