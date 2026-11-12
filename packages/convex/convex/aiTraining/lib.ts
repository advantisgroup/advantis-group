import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { canReadWikiEntry } from "../wiki/entries";
import { type Caller } from "../lib/caller";
import { ConvexError } from "convex/values";

/** The briefing that used to be hardcoded in apps/api's wiki chat. It stays
 *  the assistant's background until a trainer saves their own version of it
 *  (an `aiTrainingRules` row with `builtin: true`). */
export const DEFAULT_BRIEFING_TITLE = "Grundwissen UTA & Durchwahlen";
export const DEFAULT_BRIEFING = `Produkte & Dienstleistungen:
- Tankkarte Basic: 0,95 €/Karte/Monat – Kraftstoff & AdBlue an UTA-Stationen
- Tankkarte Standard: 2,45 €/Karte/Monat – erweiterte Akzeptanz inkl. Autobahntankstellen
- CRT-Pakete: Combined Road Transport – kombinierte Maut- & Kraftstofflösung
- IONITY Abo: Flatrate-Laden an IONITY-Schnellladestationen
- EV / Wallbox: Ladelösungen für Elektrofahrzeuge, inkl. Wallbox-Installation für Firmenkunden
- Mautboxen: OBU für verschiedene Länder (D, A, CH, F, B, P, E, I …) – Ausgabe & Verwaltung über myUTA
- myUTA-Portal: Self-Service-Portal für Kartenmanagement, Rechnungen, Limits, Fahrerzuordnung
- SmartConnect: API-Schnittstelle für Flottenmanagement-Systeme

Durchwahlen (intern):
- Cards: -660
- Finance: -125
- Maut extern: -617
- Digital Plus: -668`;

export const forbidden = () =>
  new ConvexError({ code: "forbidden", message: "Only AI trainers can do that" });

export function requireTrainer(caller: Caller) {
  if (!caller.isAiTrainer) throw forbidden();
}

export function plainText(html: string) {
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function log(
  ctx: MutationCtx,
  actorId: Id<"users">,
  action: Doc<"aiTrainingLog">["action"],
  target: string,
  extra: { detail?: string; href?: string } = {},
) {
  await ctx.db.insert("aiTrainingLog", {
    actorId,
    action,
    target: target.slice(0, 200),
    detail: extra.detail?.slice(0, 2000),
    href: extra.href,
    at: Date.now(),
  });
}

/** Everything the assistant knows: every current wiki entry in full, and
 *  the active rules (the built-in briefing until a trainer replaces it). */
export async function loadKnowledge(ctx: QueryCtx, caller: Caller) {
  const now = Date.now();
  const categories = new Map(
    (await ctx.db.query("wikiCategories").collect()).map((c) => [c._id, c.name]),
  );
  const entries = (await ctx.db.query("wikiEntries").collect())
    .filter((e) => e.validFrom <= now && e.validUntil > now && canReadWikiEntry(caller, e))
    .map((e) => ({
      id: e._id,
      slug: e.slug,
      title: e.thema,
      category: (e.categoryId ? categories.get(e.categoryId) : e.categoryName) ?? null,
      tags: e.tags,
      updatedAt: e.updatedAt,
      validUntil: e.validUntil,
      version: e.version,
      text: plainText(e.erklaerung),
    }))
    .sort(
      (a, b) =>
        (a.category ?? "~").localeCompare(b.category ?? "~") || a.title.localeCompare(b.title),
    );
  const rows = await ctx.db.query("aiTrainingRules").collect();
  const rules: { id: Id<"aiTrainingRules"> | null; title: string; text: string }[] = rows
    .filter((r) => r.active)
    .map((r) => ({ id: r._id, title: r.title, text: r.text }));
  if (!rows.some((r) => r.builtin)) {
    rules.unshift({ id: null, title: DEFAULT_BRIEFING_TITLE, text: DEFAULT_BRIEFING });
  }
  return { entries, rules };
}
