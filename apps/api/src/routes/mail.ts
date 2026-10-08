import { Elysia, t } from "elysia";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import { type convexAs } from "../lib/convex.js";
import { ApiError, Errors, ProviderError } from "../lib/errors.js";
import {
  MailAuthError,
  type MailCredentials,
  assertMailAvailable,
  checkLogin,
  decryptMailPassword,
  downloadAttachment,
  encryptMailPassword,
  listInbox,
  readMessage,
} from "../lib/mail.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

type CallerConvex = ReturnType<typeof convexAs>;

async function ownCredentials(convex: CallerConvex): Promise<MailCredentials> {
  const account = await convex.query(api.mail.accounts.apiMyAccount, {});
  if (!account) throw Errors.notFound("Kein Postfach verbunden.");
  return { email: account.email, password: decryptMailPassword(account.passwordEnc) };
}

/** IMAP failures as answers the panel can act on; anything else bubbles up. */
async function imap<T>(convex: CallerConvex, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MailAuthError) {
      await convex.mutation(api.mail.accounts.apiMarkAuthFailed, {});
      throw new ProviderError({
        provider: "ionos-imap",
        operation: "login",
        status: 409,
        code: "conflict",
        detail: "IONOS login rejected",
        retryable: false,
      });
    }
    if (error instanceof ApiError) throw error;
    throw new ProviderError({
      provider: "ionos-imap",
      operation: "read",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The caller's own IONOS inbox, read-only. Every route reads only the
 * signed-in person's mailbox — there's no way to name someone else's — and
 * setting a password (admins) never opens that inbox to the admin.
 */
export const mailRoute = new Elysia()
  .use(authed)
  .get(
    "/mail/inbox",
    async ({ caller, request, query }) => {
      requireFirstPartyOrigin(request);
      assertMailAvailable();
      await rateLimit("mail-read", caller.clerkUserId, 120, "10 m");
      const creds = await ownCredentials(caller.convex);
      return imap(caller.convex, () =>
        listInbox(creds, {
          limit: Math.min(Number(query.limit ?? 40) || 40, 100),
          before: query.before ? Number(query.before) : undefined,
        }),
      );
    },
    {
      signedIn: true,
      query: t.Object({ limit: t.Optional(t.String()), before: t.Optional(t.String()) }),
    },
  )
  .get(
    "/mail/messages/:uid",
    async ({ caller, request, params }) => {
      requireFirstPartyOrigin(request);
      assertMailAvailable();
      await rateLimit("mail-read", caller.clerkUserId, 120, "10 m");
      const creds = await ownCredentials(caller.convex);
      return imap(caller.convex, () => readMessage(creds, params.uid));
    },
    { signedIn: true, params: t.Object({ uid: t.Numeric() }) },
  )
  .get(
    "/mail/messages/:uid/attachments/:part",
    async ({ caller, request, params }) => {
      requireFirstPartyOrigin(request);
      assertMailAvailable();
      await rateLimit("mail-read", caller.clerkUserId, 120, "10 m");
      const creds = await ownCredentials(caller.convex);
      const file = await imap(caller.convex, () =>
        downloadAttachment(creds, params.uid, params.part),
      );
      return new Response(new Uint8Array(file.content), {
        headers: {
          "content-type": file.contentType,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          "cache-control": "no-store",
        },
      });
    },
    { signedIn: true, params: t.Object({ uid: t.Numeric(), part: t.String() }) },
  )
  .put(
    "/mail/accounts/:userId",
    async ({ caller, request, params, body }) => {
      requireFirstPartyOrigin(request);
      assertMailAvailable();
      await rateLimit("mail-set", caller.clerkUserId, 20, "10 m");
      // Before touching IONOS, so this can't be used to test passwords.
      await caller.convex.query(api.mail.accounts.apiRequireAdmin, {});
      const email = body.email.trim().toLowerCase();
      // Admin-only screen: name the actual reason, the generic copy hid it.
      let passwordEnc: string;
      try {
        passwordEnc = encryptMailPassword(body.password);
      } catch (error) {
        console.error("[mail.set] MAIL_ENC_KEY", error);
        throw new ApiError(
          500,
          "internal",
          "MAIL_ENC_KEY fehlt oder ist ungültig (32 Byte, base64, nur Production).",
        );
      }
      // Checked against IONOS first, so a typo shows up here and not as a
      // silent failure in the next poll.
      try {
        await checkLogin({ email, password: body.password });
      } catch (error) {
        if (error instanceof MailAuthError) {
          throw Errors.badRequest("IONOS hat Adresse oder Passwort abgelehnt.");
        }
        const reason =
          (error as { code?: string }).code ??
          (error instanceof Error ? error.message : String(error));
        console.error("[mail.set] IONOS login", reason, error);
        throw new ApiError(502, "upstream", `IONOS nicht erreichbar (${reason}).`);
      }
      await caller.convex.mutation(api.mail.accounts.apiSetAccount, {
        userId: params.userId as Id<"users">,
        email,
        passwordEnc,
      });
      return { ok: true };
    },
    {
      signedIn: true,
      params: t.Object({ userId: t.String() }),
      body: t.Object({
        email: t.String({ format: "email", maxLength: 200 }),
        password: t.String({ minLength: 1, maxLength: 200 }),
      }),
    },
  );
