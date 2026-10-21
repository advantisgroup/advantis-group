import { Elysia, t } from "elysia";

import { AI_MODEL, parseModelJson } from "../../lib/ai.js";
import { anthropic } from "../../lib/anthropic.js";
import {
  FEATURE_LABELS,
  OFFER_KINDS,
  type Offer,
  aemModelToPageText,
  htmlToPageText,
  mergeWithPrevious,
  textHash,
  verifyOffers,
} from "../../lib/competitors.js";
import { requireServerKey } from "../../lib/middleware.js";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
/** Unter so wenig Text ist die Seite nicht richtig geladen (Bot-Sperre,
 *  Fehlerseite) – dann lieber den Stand der Vorwoche behalten. */
const MIN_TEXT_CHARS = 300;

// Gewöhnlicher Browser-Kennung: Mehrere der Seiten liefern einer
// Bot-Kennung nur eine leere Hülle. Abgerufen wird einmal pro Woche und Seite.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function fetchPageText(url: string, format: "html" | "aem"): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "de-DE,de;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_PAGE_BYTES) throw new Error("page too large");
  return format === "aem" ? aemModelToPageText(JSON.parse(body)) : htmlToPageText(body);
}

/** Erhöhen, wenn sich Prompt oder Merkmale ändern: dann liest der nächste
 *  Lauf jede Seite neu, auch wenn ihr Text gleich geblieben ist. */
const EXTRACT_VERSION = "v2";

const SYSTEM = `Du liest den Text einer Webseite und listest die Tank- und Ladekarten für Geschäftskunden, die dort beschrieben sind – mit Fokus auf aktuelle Aktionen, Angebote, Rabatte und Kosten. Antworte nur mit JSON.

Format:
{"angebote":[{"anbieter":"…","produkt":"…","art":"…","merkmale":[{"label":"…","wert":"…","beleg":"…"}]}]}

Regeln:
- Nur Angaben, die wörtlich im Text stehen. Nichts ergänzen, nichts schätzen, kein Allgemeinwissen.
- "beleg": ein zusammenhängendes, wörtliches Zitat aus dem Text (12–300 Zeichen), das die Angabe trägt. Exakt so kopieren, wie es im Text steht.
- "wert": die Angabe kurz in eigenen Worten (z. B. "über 5.300", "2,00 € pro Karte und Monat"). Jede Zahl im Wert muss genau so im Beleg stehen.
- "produkt": der Produktname genau so, wie er im Text geschrieben ist (z. B. "Aral Fuel & Charge", "DKV Card +Charge").
- "art": genau einer von ${OFFER_KINDS.map((k) => `"${k}"`).join(", ")}.
- "label": genau einer von ${FEATURE_LABELS.map((l) => `"${l}"`).join(", ")}.
- "anbieter": genau einer aus der Liste, die du mit dem Text bekommst. Angebote anderer Anbieter weglassen.
- Platzhalter wie \${charge} oder {{…}} sind keine Werte – weglassen.
- "Aktion / Angebot": zeitlich begrenzte oder besondere Angebote (z. B. Neukundenaktion, Monate gebührenfrei, Bonus, Startguthaben, Gutschein), mit Laufzeit, falls genannt.
- "Rabatt / Preisvorteil": konkrete Nachlässe (z. B. Cent pro Liter, Prozent auf Wäsche, Festpreis).
- "Kosten / Gebühren": Karten- oder Grundgebühren, Mindestumsatz.
- Netzgrößen, Ladepunkte, Tankstellen-Anzahlen und allgemeine Leistungen NICHT aufnehmen.
- Werbefloskeln ohne konkrete Aussage weglassen.
- Ein Produkt nur aufnehmen, wenn mindestens eine dieser Angaben dazu im Text steht.
- Steht nichts Passendes im Text: {"angebote":[]}`;

async function extractOffers(pageText: string, providers: string[]): Promise<unknown> {
  const message = await anthropic.createMessage({
    model: AI_MODEL,
    max_tokens: 6000,
    temperature: 0,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Erlaubte Anbieter: ${providers.join(", ")}\n\nSeitentext:\n<seite>\n${pageText}\n</seite>`,
      },
    ],
  });
  if (message.stop_reason === "max_tokens") throw new Error("truncated");
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return parseModelJson(text).angebote;
}

/**
 * POST /internal/competitors/extract — server-key gated, aufgerufen vom
 * wöchentlichen Convex-Job (competitors/watch.ts), eine Quelle pro Aufruf.
 *
 * Holt die Seite, vergleicht mit dem Stand der Vorwoche und lässt nur bei
 * geändertem Text die KI die Angebote herauslesen. Kein KI-Lauf im Namen
 * einer Person (es steht niemand dahinter), daher direkt über den Client –
 * wie die Live-Hinweise im Sales Coach. Ob KI an ist, prüft Convex vorher
 * (Schalter `ai`). Antwortet nie mit einem Fehlerstatus für Seitenprobleme:
 * dann `ok: false`, und Convex behält den alten Stand.
 */
export const internalCompetitorsRoute = new Elysia().post(
  "/internal/competitors/extract",
  async ({ request, body }) => {
    requireServerKey(request);
    let pageText: string;
    try {
      pageText = await fetchPageText(body.url, body.format);
    } catch (error) {
      console.warn(`[competitors] ${body.url}: ${(error as Error).message}`);
      return { ok: false as const, error: "fetch" as const };
    }
    if (pageText.length < MIN_TEXT_CHARS) return { ok: false as const, error: "empty" as const };

    const hash = `${EXTRACT_VERSION}:${textHash(pageText)}`;
    if (hash === body.prevHash) return { ok: true as const, unchanged: true as const };

    let raw: unknown;
    try {
      raw = await extractOffers(pageText, body.providers);
    } catch (error) {
      console.warn(`[competitors] KI für ${body.url}: ${(error as Error).message}`);
      return { ok: false as const, error: "ai" as const };
    }
    const verified = verifyOffers(raw, pageText, body.providers);
    const { offers, changes } = mergeWithPrevious(
      body.prevText,
      (body.prevOffers ?? []) as Offer[],
      pageText,
      verified,
    );
    return { ok: true as const, unchanged: false as const, hash, text: pageText, offers, changes };
  },
  {
    body: t.Object({
      url: t.String(),
      format: t.Union([t.Literal("html"), t.Literal("aem")]),
      providers: t.Array(t.String()),
      prevHash: t.Union([t.String(), t.Null()]),
      prevText: t.Union([t.String(), t.Null()]),
      prevOffers: t.Array(t.Any()),
    }),
  },
);
