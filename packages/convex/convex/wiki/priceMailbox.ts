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
import {
  LIST_PRICES_CATEGORY,
  LIST_PRICES_SLUG,
  LIST_PRICES_TAGS,
  LIST_PRICES_TITLE,
  type PriceTableInput,
  buildPriceListHtml,
  newestPriceDate,
} from "./lib/priceList";

/**
 * Die Preisliste automatisch: Jeden Morgen kommt die Mail „LP Network Germany
 * and Austria -- Prices exern callcenter“ im Postfach chefsache@ an. Täglich um
 * 08:30 Uhr (Berlin) liest apps/api, was neu ist, und schickt die Tabelle der neuesten
 * passenden Mail; hier wird daraus der Wiki-Eintrag „listenpreise-netto“.
 * Aufbau wie beim HR-Postfach (hr/mailbox.ts), nur für Admins.
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function current(ctx: QueryCtx | MutationCtx): Promise<Doc<"priceMailbox"> | null> {
  return await ctx.db.query("priceMailbox").first();
}

/** Für die Karte auf der Wiki-Seite (nur Admins). */
export const status = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const mailbox = await current(ctx);
    if (!mailbox) return null;
    const setBy = await ctx.db.get(mailbox.setBy);
    return {
      email: mailbox.email,
      setByName: displayName(setBy),
      updatedAt: mailbox.updatedAt,
      checkedAt: mailbox.checkedAt ?? null,
      error: mailbox.error ?? null,
      lastImportAt: mailbox.lastImportAt ?? null,
      lastStand: mailbox.lastStand ?? null,
    };
  },
});

/** apps/api fragt das, bevor es ein Passwort bei IONOS probiert. */
export const apiRequireAdmin = serverUserQuery({
  role: "admin",
  args: {},
  handler: async () => true,
});

/** apps/api ruft das auf, nachdem IONOS die Anmeldung angenommen hat. */
export const apiSet = serverUserMutation({
  role: "admin",
  args: { email: v.string(), passwordEnc: v.string() },
  handler: async (ctx, { email, passwordEnc }) => {
    const now = Date.now();
    const existing = await current(ctx);
    const fields = {
      email: email.trim().toLowerCase(),
      passwordEnc,
      setBy: ctx.caller.id,
      updatedAt: now,
      // Neuer Anfang: der erste Lauf nimmt die letzten Tage mit.
      uidValidity: undefined,
      uidNext: undefined,
      checkedAt: now,
      error: undefined,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("priceMailbox", fields);
    await recordUnifiedAudit(ctx, {
      domain: "content",
      actorUserId: ctx.caller.id,
      action: existing ? "price_mailbox_updated" : "price_mailbox_set",
      detail: fields.email,
      at: now,
    });
  },
});

export const remove = userMutation({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const existing = await current(ctx);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await recordUnifiedAudit(ctx, {
      domain: "content",
      actorUserId: ctx.caller.id,
      action: "price_mailbox_removed",
      detail: existing.email,
      at: Date.now(),
    });
  },
});

/** Das Postfach zum Abholen. Nichts, wenn der Einrichtende kein aktiver
 *  Admin mehr ist — dann wartet es, bis ein Admin es neu hinterlegt. */
export const pollTarget = internalQuery({
  args: {},
  handler: async (ctx) => {
    const mailbox = await current(ctx);
    if (!mailbox) return null;
    const owner = await ctx.db.get(mailbox.setBy);
    if (!owner || owner.status !== "active" || owner.role !== "admin") return null;
    return {
      email: mailbox.email,
      passwordEnc: mailbox.passwordEnc,
      updatedAt: mailbox.updatedAt,
      uidValidity: mailbox.uidValidity ?? null,
      uidNext: mailbox.uidNext ?? null,
    };
  },
});

const tableValidator = v.object({
  receivedAt: v.number(),
  columns: v.array(v.string()),
  rows: v.array(v.object({ date: v.string(), values: v.array(v.string()) })),
});

const pollResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    updatedAt: v.number(),
    uidValidity: v.string(),
    uidNext: v.number(),
    matched: v.number(),
    table: v.union(tableValidator, v.null()),
  }),
  v.object({
    ok: v.literal(false),
    updatedAt: v.number(),
    error: v.union(v.literal("auth"), v.literal("connect")),
  }),
);

/** Cron: apps/api hat IMAP und den Passwort-Schlüssel; hier bleiben Position
 *  und Wiki-Eintrag. */
export const runPoll = internalAction({
  args: {},
  handler: async (ctx) => {
    const target = await ctx.runQuery(internal.wiki.priceMailbox.pollTarget, {});
    if (!target) return;
    const res = await internalApiFetch("/internal/price-mailbox/poll", target);
    if (!res) {
      console.info("[wiki.priceMailbox] skipped — API_URL/CONVEX_SERVER_KEY not set");
      return;
    }
    if (!res.ok) {
      console.warn(`[wiki.priceMailbox] apps/api answered ${res.status}`);
      return;
    }
    const result = (await res.json()) as Infer<typeof pollResultValidator>;
    await ctx.runMutation(internal.wiki.priceMailbox.recordPoll, { result });
  },
});

async function writeEntry(
  ctx: MutationCtx,
  table: PriceTableInput,
  ownerId: Doc<"priceMailbox">["setBy"],
  now: number,
): Promise<void> {
  const erklaerung = buildPriceListHtml(table);
  const existing = await ctx.db
    .query("wikiEntries")
    .withIndex("by_slug", (q) => q.eq("slug", LIST_PRICES_SLUG))
    .unique();
  if (existing) {
    // Angeheftet und Kategorie bleiben, wie sie im Wiki eingestellt sind.
    await ctx.db.patch(existing._id, {
      erklaerung,
      version: existing.version + 1,
      validUntil: Math.max(existing.validUntil, now + YEAR_MS),
      updatedAt: now,
    });
    return;
  }
  const owner = await ctx.db.get(ownerId);
  if (!owner) return;
  const categories = await ctx.db.query("wikiCategories").collect();
  let categoryId = categories.find((c) => c.name === LIST_PRICES_CATEGORY.name)?._id;
  if (!categoryId) {
    categoryId = await ctx.db.insert("wikiCategories", {
      name: LIST_PRICES_CATEGORY.name,
      color: LIST_PRICES_CATEGORY.color,
      createdByUserId: owner._id,
      createdAt: now,
    });
  }
  await ctx.db.insert("wikiEntries", {
    slug: LIST_PRICES_SLUG,
    categoryId,
    thema: LIST_PRICES_TITLE,
    erklaerung,
    tags: LIST_PRICES_TAGS,
    validFrom: now,
    validUntil: now + YEAR_MS,
    version: 1,
    pinned: true,
    authorUserId: owner._id,
    authorName: displayName(owner),
    ownerUserId: owner._id,
    createdAt: now,
    updatedAt: now,
  });
}

export const recordPoll = internalMutation({
  args: { result: pollResultValidator },
  handler: async (ctx, { result }) => {
    const mailbox = await current(ctx);
    const now = Date.now();
    // Das Ergebnis gehört nur zu dem Postfach, aus dem es gelesen wurde.
    if (!mailbox || mailbox.updatedAt !== result.updatedAt) return;
    if (!result.ok) {
      if (result.error === "auth" && mailbox.error !== "auth") {
        await alertAdmins(ctx, {
          title: "Preislisten-Postfach: Anmeldung fehlgeschlagen",
          body: `${mailbox.email} – Passwort im Wiki unter „Preisliste automatisch“ neu hinterlegen.`,
          link: "/guidebooks",
        });
      }
      await ctx.db.patch(mailbox._id, { error: result.error, checkedAt: now });
      return;
    }
    const patch: Partial<Doc<"priceMailbox">> = {
      uidValidity: result.uidValidity,
      uidNext: result.uidNext,
      checkedAt: now,
      error: undefined,
    };
    const newest = result.table ? newestPriceDate(result.table.rows) : null;
    // Nie auf eine ältere Liste zurückfallen (z. B. eine spät weitergeleitete).
    if (result.table && newest && (!mailbox.lastStand || newest >= mailbox.lastStand)) {
      await writeEntry(ctx, result.table, mailbox.setBy, now);
      patch.lastImportAt = result.table.receivedAt;
      patch.lastStand = newest;
    }
    await ctx.db.patch(mailbox._id, patch);
  },
});
