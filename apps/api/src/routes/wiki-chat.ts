import { Anthropic } from "@anthropic-ai/sdk";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Elysia, t } from "elysia";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt, encrypt } from "../lib/crypto.js";
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

// Stored messages may additionally carry a client-side error flag.
const storedMessageSchema = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String(),
  error: t.Optional(t.Boolean()),
});

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatDTO {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

export const wikiChatRoute = new Elysia()
  .post(
    "/wiki-chat",
    async ({ request, body, set }) => {
      await requireAuth(request);

      const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: [{ type: "text", text: WIKI_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: body.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
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
    },
  )
  // --- Encrypted chat history (per user) ---------------------------------
  .get("/wiki-chat/chats", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const rows = await getConvex().query(api.wikiChats.list, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
    const chats: ChatDTO[] = [];
    for (const row of rows) {
      try {
        chats.push({
          id: row.id,
          title: decrypt(row.title),
          messages: JSON.parse(decrypt(row.messages)) as StoredMessage[],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      } catch {
        // Skip rows that fail to decrypt (e.g. key rotation) rather than 500.
      }
    }
    return { chats };
  })
  .post(
    "/wiki-chat/chats",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      const { id } = await getConvex().mutation(api.wikiChats.create, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        title: encrypt(body.title),
        messages: encrypt(JSON.stringify(body.messages)),
      });
      return { id };
    },
    {
      body: t.Object({
        title: t.String(),
        messages: t.Array(storedMessageSchema),
      }),
    },
  )
  .patch(
    "/wiki-chat/chats/:id",
    async ({ request, params, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await getConvex().mutation(api.wikiChats.update, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        id: params.id as Id<"wikiChats">,
        ...(body.title !== undefined ? { title: encrypt(body.title) } : {}),
        ...(body.messages !== undefined
          ? { messages: encrypt(JSON.stringify(body.messages)) }
          : {}),
      });
      return { updated: true };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        messages: t.Optional(t.Array(storedMessageSchema)),
      }),
    },
  )
  .delete("/wiki-chat/chats/:id", async ({ request, params }) => {
    const { clerkUserId } = await requireAuth(request);
    await getConvex().mutation(api.wikiChats.remove, {
      serverKey: getConvexServerKey(),
      clerkUserId,
      id: params.id as Id<"wikiChats">,
    });
    return { deleted: true };
  });
