import { Anthropic } from "@anthropic-ai/sdk";
import { Elysia, t } from "elysia";

import { requireEnv } from "../lib/env.js";
import { requireAuth } from "../lib/middleware.js";

const WIKI_SYSTEM = `Du bist ein interner Wissensassistent für UTA Edenred Kundenberater. Antworte präzise, freundlich und auf Deutsch. Nutze Aufzählungen, wenn es die Übersicht verbessert.

Produkte & Dienstleistungen:
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
- Digital Plus: -668

Antwortregeln:
- Keine Spekulationen – wenn eine Information nicht bekannt ist, das klar sagen
- Bei Kundenproblemen immer auf konkrete nächste Schritte hinweisen
- Interne Durchwahlen nur nennen, wenn sie zur Frage passen`;

const messageSchema = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String(),
});

export const wikiChatRoute = new Elysia().post(
  "/wiki-chat",
  async ({ request, body, set }) => {
    await requireAuth(request);

    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: WIKI_SYSTEM,
      messages: body.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    set.headers["Content-Type"] = "text/plain; charset=utf-8";
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["Cache-Control"] = "no-cache";
    return readable;
  },
  {
    body: t.Object({
      messages: t.Array(messageSchema, { minItems: 1 }),
    }),
  }
);
