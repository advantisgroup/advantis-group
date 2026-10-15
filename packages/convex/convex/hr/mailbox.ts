import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
  serverUserMutation,
  serverUserQuery,
  userMutation,
  userQuery,
} from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { internalApiFetch } from "../lib/internalApi";
import { alertAdmins } from "../lib/notify";
import { displayName } from "../lib/users";
import { hasApplicantAccess } from "./lib/access";

/**
 * The HR application inbox (e.g. bewerbung@advantisgroup.de). Indeed sends
 * every application there as its own mail; every few minutes apps/api reads
 * what is new and starts a CV import for each PDF, exactly as if the person
 * who set up the mailbox had uploaded it by hand. Mails without a PDF are
 * only logged, for someone to handle in webmail.
 */

const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const LOG_LIMIT = 30;

async function current(ctx: QueryCtx | MutationCtx): Promise<Doc<"hrMailbox"> | null> {
  return await ctx.db.query("hrMailbox").first();
}

/** For the HR access screen: the mailbox and what it imported lately. */
export const status = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const mailbox = await current(ctx);
    const imports = await ctx.db
      .query("hrMailboxImports")
      .withIndex("by_at")
      .order("desc")
      .take(LOG_LIMIT);
    if (!mailbox) return { mailbox: null, imports };
    const setBy = await ctx.db.get(mailbox.setBy);
    return {
      mailbox: {
        email: mailbox.email,
        setByName: displayName(setBy),
        updatedAt: mailbox.updatedAt,
        checkedAt: mailbox.checkedAt ?? null,
        error: mailbox.error ?? null,
      },
      imports: imports.map((row) => ({
        _id: row._id,
        from: row.from,
        subject: row.subject,
        receivedAt: row.receivedAt ?? null,
        status: row.status,
        fileName: row.fileName ?? null,
        error: row.error ?? null,
        at: row.at,
      })),
    };
  },
});

/** apps/api asks this before it tries a password against IONOS, so only HR
 *  can use the route to test logins. */
export const apiRequireAccess = serverUserQuery({
  applicant: "access",
  args: {},
  handler: async () => true,
});

/** apps/api calls this after IONOS accepted the login and it encrypted the
 *  password. */
export const apiSet = serverUserMutation({
  applicant: "access",
  args: { email: v.string(), passwordEnc: v.string() },
  handler: async (ctx, { email, passwordEnc }) => {
    const now = Date.now();
    const existing = await current(ctx);
    const fields = {
      email: email.trim().toLowerCase(),
      passwordEnc,
      setBy: ctx.caller.id,
      updatedAt: now,
      // A fresh start: the first run takes the last few days and goes on
      // from there instead of trusting a position from another mailbox.
      uidValidity: undefined,
      uidNext: undefined,
      checkedAt: now,
      error: undefined,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("hrMailbox", fields);
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: ctx.caller.id,
      action: existing ? "hr_mailbox_updated" : "hr_mailbox_set",
      detail: fields.email,
      at: now,
    });
  },
});

export const remove = userMutation({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const existing = await current(ctx);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: ctx.caller.id,
      action: "hr_mailbox_removed",
      detail: existing.email,
      at: Date.now(),
    });
  },
});

/** The mailbox to check, with the Clerk id the imports run as. Nothing when
 *  that person has left HR: the imports would land in a tray nobody with
 *  access looks at, so it waits for someone to set the mailbox again. */
export const pollTarget = internalQuery({
  args: {},
  handler: async (ctx) => {
    const mailbox = await current(ctx);
    if (!mailbox) return null;
    const owner = await ctx.db.get(mailbox.setBy);
    if (!owner || owner.status !== "active" || !hasApplicantAccess(owner)) return null;
    return {
      email: mailbox.email,
      passwordEnc: mailbox.passwordEnc,
      updatedAt: mailbox.updatedAt,
      uidValidity: mailbox.uidValidity ?? null,
      uidNext: mailbox.uidNext ?? null,
      clerkUserId: owner.clerkUserId,
      userId: owner._id,
    };
  },
});

const importValidator = v.object({
  uid: v.number(),
  from: v.string(),
  subject: v.string(),
  receivedAt: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("started"),
    v.literal("no_pdf"),
    v.literal("too_large"),
    v.literal("failed"),
    v.literal("from_applicant"),
  ),
  fileName: v.union(v.string(), v.null()),
  runId: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
});

const pollResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    updatedAt: v.number(),
    uidValidity: v.string(),
    uidNext: v.number(),
    imports: v.array(importValidator),
  }),
  v.object({
    ok: v.literal(false),
    updatedAt: v.number(),
    error: v.union(v.literal("auth"), v.literal("connect")),
  }),
);

/** Cron: apps/api owns IMAP, the AI key and the password key, so it does the
 *  work; this side keeps the position and the log. */
export const runPoll = internalAction({
  args: {},
  handler: async (ctx) => {
    const target = await ctx.runQuery(internal.hr.mailbox.pollTarget, {});
    if (!target) return;
    const res = await internalApiFetch("/internal/hr-mailbox/poll", target);
    if (!res) {
      console.info("[hr.mailbox] skipped — API_URL/CONVEX_SERVER_KEY not set");
      return;
    }
    if (!res.ok) {
      console.warn(`[hr.mailbox] apps/api answered ${res.status}`);
      return;
    }
    const result = (await res.json()) as Infer<typeof pollResultValidator>;
    await ctx.runMutation(internal.hr.mailbox.recordPoll, { result });
  },
});

export const recordPoll = internalMutation({
  args: { result: pollResultValidator },
  handler: async (ctx, { result }) => {
    const mailbox = await current(ctx);
    const now = Date.now();
    // Imports already started are logged even if the mailbox changed
    // meanwhile; the position only belongs to the mailbox it was read from.
    if (result.ok) {
      for (const row of result.imports) {
        const runId = row.runId ? ctx.db.normalizeId("aiRuns", row.runId) : null;
        await ctx.db.insert("hrMailboxImports", {
          uid: row.uid,
          from: row.from.slice(0, 200),
          subject: row.subject.slice(0, 300),
          receivedAt: row.receivedAt ?? undefined,
          status: row.status,
          fileName: row.fileName ?? undefined,
          runId: runId ?? undefined,
          error: row.error ?? undefined,
          at: now,
        });
      }
    }
    if (mailbox && mailbox.updatedAt === result.updatedAt) {
      if (result.ok) {
        await ctx.db.patch(mailbox._id, {
          uidValidity: result.uidValidity,
          uidNext: result.uidNext,
          checkedAt: now,
          error: undefined,
        });
      } else {
        if (result.error === "auth" && mailbox.error !== "auth") {
          await alertAdmins(ctx, {
            title: "Bewerbungs-Postfach: Anmeldung fehlgeschlagen",
            body: `${mailbox.email} – Passwort im HR-Bereich unter „Zugriff“ neu hinterlegen.`,
            link: "/hr/access",
          });
        }
        await ctx.db.patch(mailbox._id, { error: result.error, checkedAt: now });
      }
    }
    const stale = await ctx.db
      .query("hrMailboxImports")
      .withIndex("by_at", (q) => q.lt("at", now - LOG_RETENTION_MS))
      .take(100);
    for (const row of stale) await ctx.db.delete(row._id);
  },
});
