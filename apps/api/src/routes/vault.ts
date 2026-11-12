import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Elysia, t } from "elysia";

import { decrypt, encrypt } from "../lib/crypto.js";
import { ApiError, Errors } from "../lib/errors.js";
import { authed, requireFirstPartyOrigin } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";
import { destructiveStepUpHint } from "../lib/stepUp.js";

/**
 * Zugänge (Organisation → Zugänge): shared company logins, admins only.
 * Passwords and notes are encrypted here with `VAULT_ENC_KEY` (32 bytes,
 * base64, Production only) before Convex stores them, and decrypted here on
 * reveal. Revealing needs a fresh verification (Windows PIN/passkey or code)
 * within the destructive-action window, like removing a credential.
 */

const ENC_KEY = "VAULT_ENC_KEY";

/** Preview URLs are public and run unreviewed branches: no secrets there. */
function assertVaultAvailable(): void {
  if (process.env.VERCEL_ENV === "preview") {
    throw Errors.forbidden("Zugänge sind in Vorschau-Umgebungen gesperrt.");
  }
}

function seal(plaintext: string): string {
  try {
    return encrypt(plaintext, ENC_KEY);
  } catch (error) {
    console.error("[vault] VAULT_ENC_KEY", error);
    throw new ApiError(500, "internal", "VAULT_ENC_KEY fehlt oder ist ungültig.");
  }
}

function open(ciphertext: string): string {
  try {
    return decrypt(ciphertext, ENC_KEY);
  } catch (error) {
    console.error("[vault] decrypt", error);
    throw new ApiError(500, "internal", "Zugang konnte nicht entschlüsselt werden.");
  }
}

const category = t.Union([
  t.Literal("microsoft"),
  t.Literal("google"),
  t.Literal("ionos"),
  t.Literal("salesforce"),
  t.Literal("hosting"),
  t.Literal("devices"),
  t.Literal("other"),
]);

const fields = {
  title: t.String({ minLength: 1, maxLength: 120 }),
  category,
  username: t.Optional(t.String({ maxLength: 200 })),
  url: t.Optional(t.String({ maxLength: 500 })),
  notes: t.Optional(t.String({ maxLength: 4000 })),
};

export const vaultRoute = new Elysia()
  .use(authed)
  .post(
    "/vault/entries",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      assertVaultAvailable();
      await rateLimit("vault-write", caller.clerkUserId, 60, "10 m");
      const notes = body.notes?.trim();
      const id = await caller.convex.mutation(api.vault.entries.apiCreate, {
        title: body.title,
        category: body.category,
        username: body.username,
        url: body.url,
        passwordEnc: seal(body.password),
        notesEnc: notes ? seal(notes) : undefined,
      });
      return { id };
    },
    {
      signedIn: true,
      body: t.Object({ ...fields, password: t.String({ minLength: 1, maxLength: 500 }) }),
    },
  )
  .put(
    "/vault/entries/:id",
    async ({ caller, request, params, body }) => {
      requireFirstPartyOrigin(request);
      assertVaultAvailable();
      await rateLimit("vault-write", caller.clerkUserId, 60, "10 m");
      const notes = body.notes?.trim();
      await caller.convex.mutation(api.vault.entries.apiUpdate, {
        entryId: params.id as Id<"vaultEntries">,
        title: body.title,
        category: body.category,
        username: body.username,
        url: body.url,
        passwordEnc: body.password ? seal(body.password) : undefined,
        // undefined keeps the stored notes, "" clears them
        notesEnc: body.notes === undefined ? undefined : notes ? seal(notes) : "",
      });
      return { ok: true };
    },
    {
      signedIn: true,
      params: t.Object({ id: t.String() }),
      body: t.Object({ ...fields, password: t.Optional(t.String({ maxLength: 500 })) }),
    },
  )
  .post(
    "/vault/entries/:id/reveal",
    async ({ caller, request, params }) => {
      requireFirstPartyOrigin(request);
      assertVaultAvailable();
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("vault-reveal", clerkUserId, 60, "10 m");
      const hint = await destructiveStepUpHint(clerkUserId, sessionId);
      if (hint) return hint;
      const sealed = await caller.convex.mutation(api.vault.entries.apiReveal, {
        entryId: params.id as Id<"vaultEntries">,
      });
      return {
        password: open(sealed.passwordEnc),
        notes: sealed.notesEnc ? open(sealed.notesEnc) : null,
      };
    },
    { signedIn: true, params: t.Object({ id: t.String() }) },
  );
