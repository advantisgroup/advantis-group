import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../functions";
import { internalApiFetch } from "../lib/internalApi";
import { alertAdmins, createNotification } from "../lib/notify";
import { displayName } from "../lib/users";
import { userCanUseMail } from "./lib/access";

/** More new mail than this in one poll becomes a single summary notification. */
const MAX_SINGLE_NOTIFICATIONS = 3;

export const targets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("mailAccounts").collect();
    const out = [];
    for (const account of accounts) {
      // Everyone with a stored mailbox, not only those who can open the panel
      // yet: admins need to see a password stop working before rollout.
      const user = await ctx.db.get(account.userId);
      if (!user || user.status !== "active") continue;
      out.push({
        id: account._id,
        email: account.email,
        passwordEnc: account.passwordEnc,
        updatedAt: account.updatedAt,
        uidValidity: account.uidValidity ?? null,
        uidNext: account.uidNext ?? null,
      });
    }
    return out;
  },
});

const resultValidator = v.union(
  v.object({
    id: v.id("mailAccounts"),
    updatedAt: v.number(),
    ok: v.literal(true),
    uidValidity: v.string(),
    uidNext: v.number(),
    unseen: v.number(),
    newMessages: v.array(v.object({ uid: v.number(), from: v.string(), subject: v.string() })),
    newCount: v.number(),
  }),
  v.object({
    id: v.id("mailAccounts"),
    updatedAt: v.number(),
    ok: v.literal(false),
    error: v.union(v.literal("auth"), v.literal("connect")),
  }),
);

/** Cron: apps/api owns IMAP (and the key that decrypts the passwords), so it
 *  does the checking; this side keeps the state and notifies. */
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.runQuery(internal.mail.poll.targets, {});
    if (accounts.length === 0) return;
    const res = await internalApiFetch("/internal/mail/poll", { accounts });
    if (!res) {
      console.info("[mail.poll] skipped — API_URL/CONVEX_SERVER_KEY not set");
      return;
    }
    if (!res.ok) {
      console.warn(`[mail.poll] apps/api answered ${res.status}`);
      return;
    }
    const { results } = (await res.json()) as { results: Infer<typeof resultValidator>[] };
    await ctx.runMutation(internal.mail.poll.record, { results });
  },
});

export const record = internalMutation({
  args: { results: v.array(resultValidator) },
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const result of results) {
      const account = await ctx.db.get(result.id);
      // Re-set or removed while the poll was running: its baseline is stale.
      if (!account || account.updatedAt !== result.updatedAt) continue;

      if (!result.ok) {
        if (result.error === "auth" && account.error !== "auth") {
          const user = await ctx.db.get(account.userId);
          await alertAdmins(ctx, {
            title: `IONOS-Postfach: Anmeldung fehlgeschlagen (${displayName(user)})`,
            body: `${account.email} – Passwort im Postfach-Bereich neu hinterlegen.`,
            link: "/?postfach=verwalten",
          });
        }
        await ctx.db.patch(account._id, { error: result.error, checkedAt: now });
        continue;
      }

      const sameMailbox =
        account.uidValidity === result.uidValidity && account.uidNext !== undefined;
      await ctx.db.patch(account._id, {
        uidValidity: result.uidValidity,
        uidNext: result.uidNext,
        unseen: result.unseen,
        checkedAt: now,
        error: undefined,
      });
      if (!sameMailbox || result.newCount === 0) continue;
      const owner = await ctx.db.get(account.userId);
      if (!owner || !userCanUseMail(owner)) continue;

      if (result.newCount > MAX_SINGLE_NOTIFICATIONS) {
        await createNotification(ctx, {
          userId: account.userId,
          type: "mail_received",
          title: `${result.newCount} neue E-Mails`,
          body: account.email,
          link: "/?postfach=posteingang",
        });
        continue;
      }
      for (const message of result.newMessages) {
        await createNotification(ctx, {
          userId: account.userId,
          type: "mail_received",
          title: `Neue E-Mail von ${message.from}`,
          body: message.subject || "(ohne Betreff)",
          link: `/?postfach=${message.uid}`,
        });
      }
    }
  },
});
