/**
 * Wettbewerbs-Beobachtung Tank- und Ladekarten (Wunsch Vahan, 21.10.2026).
 *
 * Jeden Montag früh liest apps/api die Angebotsseiten von Aral, Shell,
 * TKS (heute Radius) und DKV sowie zwei Vergleichsportale. Daraus entsteht
 * ein einziger Wiki-Eintrag mit allen Anbietern auf einer Seite; gibt es
 * Neuigkeiten, kommt dazu eine kurze Ankündigung an alle.
 *
 * Richtige Daten vor vollständigen Daten: Jede Angabe trägt ein wörtliches
 * Zitat der Quelle (geprüft in apps/api/src/lib/competitors.ts). Kann eine
 * Seite nicht gelesen werden, bleibt ihr letzter Stand mit Datum stehen.
 *
 * Von Hand anstoßen (Convex-Dashboard): `internal.competitors.watch.run({})`.
 */
import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { getOrCreateIntranetBot } from "../announcements";
import { gatedInternalAction, internalMutation, internalQuery } from "../functions";
import { internalApiFetch } from "../lib/internalApi";
import { notifyUsers } from "../lib/notify";

export const WIKI_SLUG = "wettbewerb-tank-ladekarten";
const WIKI_TITLE = "Wettbewerb: Tank- & Ladekarten (Aral, Shell, TKS, DKV)";
const WIKI_TAGS = ["Wettbewerb", "Tankkarte", "Ladekarte", "Aral", "Shell", "TKS", "Radius", "DKV"];
const CATEGORY = { name: "Vertrieb", color: "#2F7FA6" };
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ANNOUNCED_LINES = 25;

export const PROVIDERS = ["Aral", "Shell", "TKS (Radius)", "DKV"] as const;

export interface Source {
  key: string;
  /** Unter welchem Anbieter die Seite steht; bei Portalen der Portalname. */
  group: string;
  label: string;
  url: string;
  format: "html" | "aem";
  providers: readonly string[];
  /** Vergleichsportal: Angaben Dritter, eigener Abschnitt. */
  portal?: true;
}

/** Die beobachteten Seiten. Neue Seite = neue Zeile hier, mehr nicht. */
export const SOURCES: readonly Source[] = [
  {
    key: "aral-tankkarten",
    group: "Aral",
    label: "Aral Fleet Solutions – Tankkarten",
    url: "https://www.aral.de/de/global/fleet-solutions/tankkarten.html",
    format: "html",
    providers: ["Aral"],
  },
  {
    key: "aral-fuel-charge",
    group: "Aral",
    label: "Aral Fuel & Charge",
    url: "https://www.aral.de/de/global/fleet-solutions/tankkarten/fuel-und-charge.html",
    format: "html",
    providers: ["Aral"],
  },
  {
    key: "aral-bp-plus",
    group: "Aral",
    label: "bp + Aral Tankkarte",
    url: "https://www.aral.de/de/global/fleet-solutions/tankkarten/bp-plus-aral.html",
    format: "html",
    providers: ["Aral"],
  },
  {
    key: "aral-komfort",
    group: "Aral",
    label: "Aral Komfort Tankkarte",
    url: "https://www.aral.de/de/global/fleet-solutions/tankkarten/komfort.html",
    format: "html",
    providers: ["Aral"],
  },
  {
    key: "shell-card",
    group: "Shell",
    label: "Shell Card",
    // Die HTML-Seite wird erst im Browser gefüllt; das Seitenmodell enthält
    // denselben Text.
    url: "https://www.shell.de/geschaeftskunden/shell-card-tankkarten.model.json",
    format: "aem",
    providers: ["Shell"],
  },
  {
    key: "radius-tankkarten",
    group: "TKS (Radius)",
    label: "Radius (ehem. TKS) – Tankkarten",
    url: "https://www.radius.com/de-de/tankkarten/",
    format: "html",
    providers: ["TKS (Radius)"],
  },
  {
    key: "radius-shell",
    group: "TKS (Radius)",
    label: "Radius – Shell Tankkarte",
    url: "https://www.radius.com/de-de/tankkarten/shell/",
    format: "html",
    providers: ["TKS (Radius)"],
  },
  {
    key: "radius-aral",
    group: "TKS (Radius)",
    label: "Radius – Aral Tankkarte",
    url: "https://www.radius.com/de-de/tankkarten/aral/",
    format: "html",
    providers: ["TKS (Radius)"],
  },
  {
    key: "radius-one",
    group: "TKS (Radius)",
    label: "Radius One",
    url: "https://www.radius.com/de-de/tankkarten/one/",
    format: "html",
    providers: ["TKS (Radius)"],
  },
  {
    key: "radius-ladekarte",
    group: "TKS (Radius)",
    label: "Radius – Ladekarte",
    url: "https://www.radius.com/de-de/elektrisch-laden/ladekarte/",
    format: "html",
    providers: ["TKS (Radius)"],
  },
  {
    key: "dkv-uebersicht",
    group: "DKV",
    label: "DKV – Tankkarten im Überblick",
    url: "https://www.dkv-mobility.com/de/de/fuelling/fuel-card/fuel-cards-overview",
    format: "html",
    providers: ["DKV"],
  },
  {
    key: "dkv-card",
    group: "DKV",
    label: "DKV Card",
    url: "https://www.dkv-mobility.com/de/de/fuelling/fuel-card/all-cards/dkv-card",
    format: "html",
    providers: ["DKV"],
  },
  {
    key: "dkv-card-charge",
    group: "DKV",
    label: "DKV Card +Charge",
    url: "https://www.dkv-mobility.com/de/de/fuelling/fuel-card/all-cards/dkv-card-charge",
    format: "html",
    providers: ["DKV"],
  },
  {
    key: "portal-drweb",
    group: "drweb.de",
    label: "drweb.de – Tankkarten-Vergleich",
    url: "https://www.drweb.de/tankkarten-vergleich/",
    format: "html",
    providers: PROVIDERS,
    portal: true,
  },
  {
    key: "portal-tradingtwins-aral",
    group: "tradingtwins.com",
    label: "tradingtwins – Aral",
    url: "https://www.tradingtwins.com/de/tankkarte/anbieter/aral",
    format: "html",
    providers: ["Aral"],
    portal: true,
  },
  {
    key: "portal-tradingtwins-tks",
    group: "tradingtwins.com",
    label: "tradingtwins – TKS/Radius",
    url: "https://www.tradingtwins.com/de/tankkarte/anbieter/tks",
    format: "html",
    providers: ["TKS (Radius)"],
    portal: true,
  },
  {
    key: "portal-tradingtwins-dkv",
    group: "tradingtwins.com",
    label: "tradingtwins – DKV",
    url: "https://www.tradingtwins.com/de/tankkarte/anbieter/dkv",
    format: "html",
    providers: ["DKV"],
    portal: true,
  },
];

const featureValidator = v.object({ label: v.string(), wert: v.string(), beleg: v.string() });
const offerValidator = v.object({
  anbieter: v.string(),
  produkt: v.string(),
  art: v.string(),
  merkmale: v.array(featureValidator),
});
const changeValidator = v.object({
  anbieter: v.string(),
  produkt: v.string(),
  label: v.string(),
  wert: v.string(),
});
const changesValidator = v.object({
  neueProdukte: v.array(v.object({ anbieter: v.string(), produkt: v.string(), art: v.string() })),
  entfalleneProdukte: v.array(v.object({ anbieter: v.string(), produkt: v.string() })),
  neu: v.array(changeValidator),
  entfallen: v.array(changeValidator),
});
export type Offer = Infer<typeof offerValidator>;
export type Changes = Infer<typeof changesValidator>;

const resultValidator = v.union(
  v.object({ ok: v.literal(true), unchanged: v.literal(true) }),
  v.object({
    ok: v.literal(true),
    unchanged: v.literal(false),
    hash: v.string(),
    text: v.string(),
    offers: v.array(offerValidator),
    changes: changesValidator,
  }),
  v.object({
    ok: v.literal(false),
    error: v.union(v.literal("fetch"), v.literal("empty"), v.literal("ai")),
  }),
);
type Result = Infer<typeof resultValidator>;

export const sourceState = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("competitorSources")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return {
      prevHash: row?.textHash ?? null,
      prevText: row?.text ?? null,
      prevOffers: row?.offers ?? [],
    };
  },
});

export const recordSource = internalMutation({
  args: { key: v.string(), result: resultValidator },
  handler: async (ctx, { key, result }) => {
    const row = await ctx.db
      .query("competitorSources")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const now = Date.now();
    let patch: Partial<Doc<"competitorSources">>;
    if (!result.ok) {
      patch = { lastError: result.error, lastErrorAt: now };
    } else if (result.unchanged) {
      patch = { checkedAt: now, lastError: undefined, lastErrorAt: undefined };
    } else {
      patch = {
        text: result.text,
        textHash: result.hash,
        offers: result.offers,
        checkedAt: now,
        changedAt: now,
        lastError: undefined,
        lastErrorAt: undefined,
      };
    }
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("competitorSources", { key, offers: [], ...patch });
  },
});

/** Wöchentlicher Lauf (crons.ts, montags früh). Eine Seite nach der anderen,
 *  damit jeder API-Aufruf kurz bleibt und eine kaputte Seite die anderen
 *  nicht aufhält. Läuft nur, solange KI im Intranet eingeschaltet ist.
 *  `test: true` legt einen neuen Eintrag nur für Admins sichtbar an. */
export const run = gatedInternalAction("ai")({
  args: { test: v.optional(v.boolean()) },
  handler: async (ctx, { test }) => {
    const collected: { source: string; changes: Changes }[] = [];
    for (const source of SOURCES) {
      const state = await ctx.runQuery(internal.competitors.watch.sourceState, { key: source.key });
      let result: Result;
      try {
        const res = await internalApiFetch("/internal/competitors/extract", {
          url: source.url,
          format: source.format,
          providers: source.providers,
          ...state,
        });
        if (!res) {
          console.info("[competitors] übersprungen – API_URL/CONVEX_SERVER_KEY fehlt");
          return;
        }
        if (!res.ok) {
          console.warn(`[competitors] ${source.key}: apps/api antwortete ${res.status}`);
          result = { ok: false, error: "fetch" };
        } else {
          result = (await res.json()) as Result;
        }
      } catch (error) {
        console.warn(`[competitors] ${source.key}: ${(error as Error).message}`);
        result = { ok: false, error: "fetch" };
      }
      await ctx.runMutation(internal.competitors.watch.recordSource, { key: source.key, result });
      if (result.ok && !result.unchanged)
        collected.push({ source: source.key, changes: result.changes });
    }
    await ctx.runMutation(internal.competitors.watch.publish, { changes: collected, test });
  },
});

/** Schreibt den Wiki-Eintrag neu und kündigt Neuigkeiten an. */
export const publish = internalMutation({
  args: {
    changes: v.array(v.object({ source: v.string(), changes: changesValidator })),
    test: v.optional(v.boolean()),
  },
  handler: async (ctx, { changes, test }) => {
    const now = Date.now();
    const rows = await ctx.db.query("competitorSources").collect();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const html = renderWiki(SOURCES, byKey, now);
    const botUserId = await getOrCreateIntranetBot(ctx);

    // Ungefiltert: auch ein in den Papierkorb gelegter Eintrag zählt.
    const existing = await ctx.unfilteredDb
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", WIKI_SLUG))
      .unique();
    let created = false;
    let hidden = false;
    if (existing) {
      if (existing.deletedAt) return; // Bewusst gelöscht: nicht wiederbeleben.
      // Noch im Testbetrieb (nur Admins sehen den Eintrag): aktualisieren,
      // aber nichts ankündigen, bis `release` ihn für alle freigibt.
      hidden = existing.minRole === "admin";
      await ctx.db.patch(existing._id, {
        erklaerung: html,
        version: existing.erklaerung === html ? existing.version : existing.version + 1,
        validUntil: Math.max(existing.validUntil, now + YEAR_MS),
        updatedAt: now,
      });
    } else {
      const categories = await ctx.db.query("wikiCategories").collect();
      let categoryId = categories.find((c) => c.name === CATEGORY.name)?._id;
      if (!categoryId) {
        categoryId = await ctx.db.insert("wikiCategories", {
          name: CATEGORY.name,
          color: CATEGORY.color,
          createdByUserId: botUserId,
          createdAt: now,
        });
      }
      await ctx.db.insert("wikiEntries", {
        slug: WIKI_SLUG,
        categoryId,
        thema: WIKI_TITLE,
        erklaerung: html,
        tags: WIKI_TAGS,
        validFrom: now,
        validUntil: now + YEAR_MS,
        version: 1,
        pinned: false,
        minRole: test ? "admin" : undefined,
        authorUserId: botUserId,
        authorName: "Intranet Bot",
        createdAt: now,
        updatedAt: now,
      });
      created = true;
      hidden = !!test;
    }
    if (hidden) return;

    const body = created
      ? renderFirstAnnouncement()
      : renderChangesAnnouncement(changes, (key) => SOURCES.find((s) => s.key === key));
    if (!body) return;
    const title = created
      ? FIRST_TITLE
      : `Wettbewerb Tank- & Ladekarten: Neuigkeiten (KW ${isoWeek(now)})`;
    await announce(ctx, botUserId, title, body, now);
  },
});

const FIRST_TITLE = "Neu im Wiki: Wettbewerbsübersicht Tank- & Ladekarten";

/** Testbetrieb beenden: Eintrag für alle sichtbar machen und ihn ankündigen.
 *  Von Hand im Convex-Dashboard: `internal.competitors.watch.release({})`. */
export const release = internalMutation({
  args: {},
  handler: async (ctx) => {
    const entry = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", WIKI_SLUG))
      .unique();
    if (!entry || entry.minRole !== "admin") return { result: "nothing_to_release" as const };
    const now = Date.now();
    await ctx.db.patch(entry._id, { minRole: undefined, updatedAt: now });
    const botUserId = await getOrCreateIntranetBot(ctx);
    await announce(ctx, botUserId, FIRST_TITLE, renderFirstAnnouncement(), now);
    return { result: "released" as const };
  },
});

async function announce(
  ctx: MutationCtx,
  botUserId: Id<"users">,
  title: string,
  body: string,
  now: number,
) {
  const id = await ctx.db.insert("announcements", {
    title,
    body,
    authorUserId: botUserId,
    pinned: false,
    audience: { kind: "all" },
    category: "Wettbewerb",
    attachmentStorageIds: [],
    publishedAt: now,
    expiresAt: now + ANNOUNCEMENT_TTL_MS,
    createdAt: now,
  });
  const recipients = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  await notifyUsers(
    ctx,
    recipients.map((u) => u._id).filter((uid) => uid !== botUserId),
    {
      type: "announcement",
      title: "Neue Ankündigung",
      body: title,
      link: `/announcements?id=${id}`,
    },
  );
}

// --- Darstellung --------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function isoWeek(ms: number): number {
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}


interface SourcedFeature {
  label: string;
  wert: string;
  beleg: string;
  source: Source;
  checkedAt?: number;
}
interface Product {
  anbieter: string;
  produkt: string;
  art: string;
  merkmale: SourcedFeature[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Angebote mehrerer Seiten eines Anbieters zu Produkten zusammenführen. */
function collectProducts(
  sources: readonly Source[],
  rows: Map<string, Doc<"competitorSources">>,
): Product[] {
  const products = new Map<string, Product>();
  for (const source of sources) {
    const row = rows.get(source.key);
    if (!row) continue;
    for (const offer of row.offers) {
      const key = `${norm(offer.anbieter)}|${norm(offer.produkt)}`;
      let product = products.get(key);
      if (!product) {
        product = {
          anbieter: offer.anbieter,
          produkt: offer.produkt,
          art: offer.art,
          merkmale: [],
        };
        products.set(key, product);
      }
      for (const f of offer.merkmale) {
        if (product.merkmale.some((m) => m.label === f.label && norm(m.wert) === norm(f.wert)))
          continue;
        product.merkmale.push({ ...f, source, checkedAt: row.checkedAt });
      }
    }
  }
  return [...products.values()];
}

/** Was im Wiki und in den Ankündigungen zählt (Wunsch Vahan, 21.10.):
 *  nur öffentliche Aktionen, Angebote, Rabatte und Kosten. */
export const RELEVANT_LABELS = ["Aktion / Angebot", "Rabatt / Preisvorteil", "Kosten / Gebühren"];

function cell(product: Product, label: string): string {
  const values = product.merkmale.filter((m) => m.label === label).map((m) => esc(m.wert));
  return values.length > 0 ? values.join("<br>") : "–";
}

const relevant = (p: Product) => p.merkmale.some((m) => RELEVANT_LABELS.includes(m.label));

/** Erste Quelle eines Produkts – dahin verlinkt der Produktname. */
const firstSource = (p: Product) =>
  p.merkmale.find((m) => RELEVANT_LABELS.includes(m.label))?.source ?? p.merkmale[0]!.source;

/** Eine einzige Tabelle: je Produkt Aktionen, Rabatte, Kosten. Angaben von
 *  Vergleichsportalen stehen mit „laut …“ am Anbieter. */
export function renderWiki(
  sources: readonly Source[],
  rows: Map<string, Doc<"competitorSources">>,
  now: number,
): string {
  const own = collectProducts(
    sources.filter((s) => !s.portal),
    rows,
  ).filter(relevant);
  const portals = collectProducts(
    sources.filter((s) => s.portal),
    rows,
  ).filter(relevant);
  const ordered = [
    ...PROVIDERS.flatMap((p) => own.filter((o) => o.anbieter === p)),
    ...PROVIDERS.flatMap((p) => portals.filter((o) => o.anbieter === p)),
  ];
  const head = ["Anbieter", "Produkt", "Art", ...RELEVANT_LABELS]
    .map((h) => `<th>${esc(h)}</th>`)
    .join("");
  const body =
    ordered.length > 0
      ? ordered
          .map((o) => {
            const src = firstSource(o);
            const anbieter = src.portal
              ? `${o.anbieter} <em>(laut ${esc(src.group)})</em>`
              : esc(o.anbieter);
            return `<tr><td>${anbieter}</td><td><a href="${esc(src.url)}"><strong>${esc(o.produkt)}</strong></a></td><td>${esc(o.art)}</td>${RELEVANT_LABELS.map((l) => `<td>${cell(o, l)}</td>`).join("")}</tr>`;
          })
          .join("")
      : `<tr><td colspan="6">Derzeit keine öffentlichen Aktionen oder Angebote gefunden.</td></tr>`;
  return `<p><strong>Stand ${day(now)}</strong> · wird jeden Montag aktualisiert · nur, was wörtlich auf den Seiten steht</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderFirstAnnouncement(): string {
  return [
    `<p>Im Wiki gibt es jetzt eine Übersicht der Tank- und Ladekarten-Angebote von Aral, Shell, TKS (Radius) und DKV – alle auf einer Seite.</p>`,
    `<p>Sie wird jeden Montag automatisch aktualisiert. Ändert sich etwas an den Angeboten, kommt montags eine kurze Ankündigung.</p>`,
    `<p><a href="/guidebooks/${WIKI_SLUG}">Zur Übersicht im Wiki</a></p>`,
  ].join("");
}

export function renderChangesAnnouncement(
  changes: { source: string; changes: Changes }[],
  sourceOf: (key: string) => Source | undefined,
): string | null {
  const lines = new Map<string, string[]>();
  const seen = new Set<string>();
  const add = (group: string, line: string) => {
    if (seen.has(`${group}|${line}`)) return;
    seen.add(`${group}|${line}`);
    if (!lines.has(group)) lines.set(group, []);
    lines.get(group)!.push(line);
  };
  for (const { source, changes: all } of changes) {
    const src = sourceOf(source);
    if (!src) continue;
    const keep = (f: { label: string }) => RELEVANT_LABELS.includes(f.label);
    const c = { ...all, neu: all.neu.filter(keep), entfallen: all.entfallen.filter(keep) };
    const group = src.portal ? `Laut ${src.group}` : src.group;
    for (const p of c.neueProdukte)
      add(group, `Neu: <strong>${esc(p.produkt)}</strong> (${esc(p.art)})`);
    for (const p of c.entfalleneProdukte) add(group, `Nicht mehr auf der Seite: ${esc(p.produkt)}`);
    const removed = [...c.entfallen];
    for (const n of c.neu) {
      const i = removed.findIndex((r) => r.produkt === n.produkt && r.label === n.label);
      if (i >= 0) {
        const [old] = removed.splice(i, 1);
        add(
          group,
          `${esc(n.produkt)} – ${esc(n.label)}: jetzt <strong>${esc(n.wert)}</strong> (vorher ${esc(old!.wert)})`,
        );
      } else {
        add(group, `${esc(n.produkt)} – ${esc(n.label)}: <strong>${esc(n.wert)}</strong> (neu)`);
      }
    }
    for (const r of removed)
      add(
        group,
        `${esc(r.produkt)} – ${esc(r.label)}: „${esc(r.wert)}“ steht nicht mehr auf der Seite`,
      );
  }
  if (lines.size === 0) return null;

  let budget = MAX_ANNOUNCED_LINES;
  let skipped = 0;
  const parts = [
    `<p>Das hat sich seit letzter Woche bei den Tank- und Ladekarten der Konkurrenz geändert:</p>`,
  ];
  const ordered = [...lines.entries()].sort(([a], [b]) => {
    const rank = (g: string) => {
      const i = (PROVIDERS as readonly string[]).indexOf(g);
      return i >= 0 ? i : PROVIDERS.length;
    };
    return rank(a) - rank(b);
  });
  for (const [group, items] of ordered) {
    const shown = items.slice(0, Math.max(0, budget));
    skipped += items.length - shown.length;
    budget -= shown.length;
    if (shown.length === 0) continue;
    parts.push(
      `<p><strong>${esc(group)}</strong></p><ul>${shown.map((l) => `<li>${l}</li>`).join("")}</ul>`,
    );
  }
  if (skipped > 0) parts.push(`<p>… und ${skipped} weitere Änderungen.</p>`);
  parts.push(`<p><a href="/guidebooks/${WIKI_SLUG}">Alle Angebote im Wiki</a></p>`);
  return parts.join("");
}
