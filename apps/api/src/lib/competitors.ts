/**
 * Wettbewerbs-Beobachtung Tank- und Ladekarten (Aral, Shell, TKS/Radius, DKV).
 *
 * Reine Funktionen, ohne Netz und ohne KI: Seitentext gewinnen, die von der
 * KI gelieferten Angaben gegen den Seitentext prüfen und mit dem Stand der
 * Vorwoche zusammenführen. Grundsatz: Es steht nur drin, was wörtlich auf der
 * Seite steht. Jede Angabe trägt einen Beleg (ein Zitat von der Seite); fehlt
 * das Zitat im Seitentext, fliegt die Angabe raus. Als „neu“ oder „entfallen“
 * gilt eine Angabe nur, wenn sich ihr Beleg im Seitentext selbst geändert
 * hat – nicht, weil die KI diesmal etwas anders formuliert oder weggelassen hat.
 */

export const OFFER_KINDS = ["Tankkarte", "Ladekarte", "Tank- und Ladekarte"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const FEATURE_LABELS = [
  "Aktion / Angebot",
  "Rabatt / Preisvorteil",
  "Kosten / Gebühren",
] as const;
export type FeatureLabel = (typeof FEATURE_LABELS)[number];

export interface Feature {
  label: FeatureLabel;
  wert: string;
  beleg: string;
}

export interface Offer {
  anbieter: string;
  produkt: string;
  art: OfferKind;
  merkmale: Feature[];
}

export interface FeatureChange {
  anbieter: string;
  produkt: string;
  label: FeatureLabel;
  wert: string;
}

export interface Changes {
  neueProdukte: { anbieter: string; produkt: string; art: OfferKind }[];
  entfalleneProdukte: { anbieter: string; produkt: string }[];
  neu: FeatureChange[];
  entfallen: FeatureChange[];
}

/** Längster Seitentext, der gespeichert und an die KI gegeben wird. */
export const MAX_TEXT_CHARS = 60_000;

const BELEG_MIN = 12;
const BELEG_MAX = 400;

/** Für den Abgleich: Groß/klein, Leerraum, Anführungszeichen, Bindestriche
 *  und geschützte Leerzeichen spielen keine Rolle. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[   ]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[“”„«»"]/g, '"')
    .replace(/[‘’‚']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  euro: "€",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  hellip: "…",
  shy: "",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

function tidyLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").trim();
    if (line && line !== out[out.length - 1]) out.push(line);
  }
  return out.join("\n").slice(0, MAX_TEXT_CHARS);
}

/** Sichtbarer Text einer HTML-Seite, eine Zeile je Block. */
export function htmlToPageText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|dt|dd|caption)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return tidyLines(decodeEntities(body));
}

const AEM_TEXT_KEYS = new Set([
  "text",
  "title",
  "description",
  "richText",
  "heading",
  "subtitle",
  "label",
  "question",
  "answer",
]);

/** Text aus einem Adobe-Experience-Manager-Modell (`*.model.json`), das
 *  Seiten wie shell.de erst im Browser zusammenbauen. */
export function aemModelToPageText(json: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && AEM_TEXT_KEYS.has(key) && value.trim().length > 3) {
          parts.push(htmlToPageText(value).replace(/\n/g, " "));
        } else {
          walk(value);
        }
      }
    }
  };
  walk(json);
  return tidyLines([...new Set(parts)].join("\n"));
}

/** Kurzer, stabiler Fingerabdruck (FNV-1a) – nur um „unverändert“ zu erkennen. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

const digitsOf = (s: string) => s.match(/\d+/g) ?? [];

const productKey = (o: { anbieter: string; produkt: string }) =>
  `${normalize(o.anbieter)}|${normalize(o.produkt)}`;
const featureKey = (f: { label: string; wert: string }) => `${f.label}|${normalize(f.wert)}`;

function contains(haystackNorm: string, needle: string): boolean {
  const n = normalize(needle);
  return n.length > 0 && haystackNorm.includes(n);
}

/**
 * Prüft die KI-Antwort gegen den Seitentext. Übrig bleibt nur, was belegt ist:
 * bekannter Anbieter, Produktname wörtlich auf der Seite, Art und Merkmal aus
 * der festen Liste, Beleg wörtlich auf der Seite, jede Zahl der Angabe auch
 * im Beleg. Angebote ohne ein einziges belegtes Merkmal fallen weg.
 */
export function verifyOffers(raw: unknown, pageText: string, allowedProviders: string[]): Offer[] {
  const text = normalize(pageText);
  const providers = new Map(allowedProviders.map((p) => [normalize(p), p]));
  const list = Array.isArray(raw) ? raw : [];
  const offers = new Map<string, Offer>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const anbieter = providers.get(normalize(String(o.anbieter ?? "")));
    const produkt = String(o.produkt ?? "").trim();
    const art = OFFER_KINDS.find((k) => k === o.art);
    if (!anbieter || !art || produkt.length < 3 || produkt.length > 80) continue;
    if (!contains(text, produkt)) continue;
    const merkmale: Feature[] = [];
    const seen = new Set<string>();
    for (const m of Array.isArray(o.merkmale) ? o.merkmale : []) {
      if (!m || typeof m !== "object") continue;
      const f = m as Record<string, unknown>;
      const label = FEATURE_LABELS.find((l) => l === f.label);
      const wert = String(f.wert ?? "").trim();
      const beleg = String(f.beleg ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!label || !wert || wert.length > 160) continue;
      if (beleg.length < BELEG_MIN || beleg.length > BELEG_MAX || !contains(text, beleg)) continue;
      const belegDigits = digitsOf(beleg).join(" ");
      if (!digitsOf(wert).every((d) => belegDigits.split(" ").includes(d))) continue;
      const key = featureKey({ label, wert });
      if (seen.has(key)) continue;
      seen.add(key);
      merkmale.push({ label, wert, beleg });
    }
    if (merkmale.length === 0) continue;
    const key = productKey({ anbieter, produkt });
    const existing = offers.get(key);
    if (existing) {
      for (const f of merkmale) {
        if (!existing.merkmale.some((e) => featureKey(e) === featureKey(f)))
          existing.merkmale.push(f);
      }
    } else {
      offers.set(key, { anbieter, produkt, art, merkmale });
    }
  }
  return [...offers.values()];
}

/**
 * Führt den neuen Stand mit dem der Vorwoche zusammen und stellt fest, was
 * sich wirklich geändert hat.
 *
 * - Was die KI diesmal ausgelassen hat, dessen Beleg aber noch auf der Seite
 *   steht, bleibt erhalten (kein „entfallen“ durch eine andere Formulierung).
 * - „Neu“ ist eine Angabe nur, wenn ihr Beleg in der Vorwoche nicht auf der
 *   Seite stand; „entfallen“ nur, wenn ihr Beleg jetzt fehlt.
 * - Ohne Vorwochen-Text (erster Lauf) gibt es keine Änderungen.
 */
export function mergeWithPrevious(
  prevText: string | null,
  prevOffers: Offer[],
  newText: string,
  newOffers: Offer[],
): { offers: Offer[]; changes: Changes } {
  const prevNorm = prevText === null ? null : normalize(prevText);
  const newNorm = normalize(newText);
  const merged = new Map<string, Offer>(
    newOffers.map((o) => [productKey(o), { ...o, merkmale: [...o.merkmale] }]),
  );

  const sameSource = (a: Feature, b: Feature) =>
    a.label === b.label && normalize(a.beleg) === normalize(b.beleg);

  for (const prev of prevOffers) {
    const kept = prev.merkmale.filter((f) => contains(newNorm, f.beleg));
    const key = productKey(prev);
    const current = merged.get(key);
    if (current) {
      // Gleicher Beleg, andere Formulierung: die Formulierung der Vorwoche
      // behalten, damit die Seite nicht jede Woche anders aussieht.
      current.merkmale = current.merkmale.map((m) => kept.find((f) => sameSource(f, m)) ?? m);
      for (const f of kept) {
        const present = current.merkmale.some(
          (m) => featureKey(m) === featureKey(f) || sameSource(m, f),
        );
        if (!present) current.merkmale.push(f);
      }
    } else if (kept.length > 0 && contains(newNorm, prev.produkt)) {
      merged.set(key, { ...prev, merkmale: kept });
    }
  }

  const changes: Changes = { neueProdukte: [], entfalleneProdukte: [], neu: [], entfallen: [] };
  if (prevNorm !== null) {
    const prevByKey = new Map(prevOffers.map((o) => [productKey(o), o]));
    for (const [key, offer] of merged) {
      const before = prevByKey.get(key);
      if (!before) {
        if (!contains(prevNorm, offer.produkt)) {
          changes.neueProdukte.push({
            anbieter: offer.anbieter,
            produkt: offer.produkt,
            art: offer.art,
          });
        }
        continue;
      }
      for (const f of offer.merkmale) {
        const known = before.merkmale.some((m) => featureKey(m) === featureKey(f));
        if (!known && !contains(prevNorm, f.beleg)) {
          changes.neu.push({
            anbieter: offer.anbieter,
            produkt: offer.produkt,
            label: f.label,
            wert: f.wert,
          });
        }
      }
      for (const f of before.merkmale) {
        if (!offer.merkmale.some((m) => featureKey(m) === featureKey(f))) {
          changes.entfallen.push({
            anbieter: offer.anbieter,
            produkt: offer.produkt,
            label: f.label,
            wert: f.wert,
          });
        }
      }
    }
    for (const [key, before] of prevByKey) {
      if (!merged.has(key)) {
        changes.entfalleneProdukte.push({ anbieter: before.anbieter, produkt: before.produkt });
      }
    }
  }

  const order = (label: FeatureLabel) => FEATURE_LABELS.indexOf(label);
  const offers = [...merged.values()].map((o) => ({
    ...o,
    merkmale: o.merkmale
      .filter((f, i, all) => all.findIndex((g) => featureKey(g) === featureKey(f)) === i)
      .sort((a, b) => order(a.label) - order(b.label)),
  }));
  return { offers, changes };
}

export function hasChanges(c: Changes): boolean {
  return (
    c.neueProdukte.length + c.entfalleneProdukte.length + c.neu.length + c.entfallen.length > 0
  );
}
