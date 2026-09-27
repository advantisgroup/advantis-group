import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Elysia, t } from "elysia";

import {
  AI_MODEL,
  AiRunError,
  parseModelJson,
  requireAi,
  runModelText,
  startAiRun,
  str,
  strList,
  type AiRunContext,
} from "../lib/ai.js";
import { anthropic } from "../lib/anthropic.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { authed } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

/** Sales Coach EV transcripts/feedback get their own rotatable key, separate from Wiki Chat. */
const ENC_KEY = "SALES_COACH_EV_ENC_KEY";

const outcomeSchema = t.Union([
  t.Literal("termin"),
  t.Literal("wiedervorlage"),
  t.Literal("kein_ergebnis"),
]);
const WIKI_CAT_VALUES = [
  "Produktdaten",
  "Preisliste",
  "Technik",
  "Argumente",
  "Rechtliches",
  "Intern",
  "Links",
] as const;
type WikiCat = (typeof WIKI_CAT_VALUES)[number];

// Spelled out literal-by-literal (rather than mapped from WIKI_CAT_VALUES)
// so Elysia/Eden can infer the precise union — a `.map()`-built t.Union
// loses the literal types and infers `never` on the client side.
const wikiCatSchema = t.Union([
  t.Literal("Produktdaten"),
  t.Literal("Preisliste"),
  t.Literal("Technik"),
  t.Literal("Argumente"),
  t.Literal("Rechtliches"),
  t.Literal("Intern"),
  t.Literal("Links"),
]);

interface ExtractedWikiFields {
  title: string;
  cat: WikiCat;
  tags: string;
  body: string;
}

const MAX_WIKI_DOC_BYTES = 8 * 1024 * 1024;
const MAX_WIKI_EXTRACT_TEXT_CHARS = 60_000;

const WIKI_EXTRACTION_PROMPT = `Du befuellst die Wissensdatenbank (Wiki) fuer Sales Coach EV - Vertrieb von Wallboxen/Ladeloesungen und Elektromobilitaet fuer Firmenkunden.
Lies das folgende Dokument und fasse es zu einem Wiki-Artikel zusammen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown, ohne Erklaerung:
{"title":"Kurzer, praegnanter Titel (max. 80 Zeichen)","cat":"Produktdaten|Preisliste|Technik|Argumente|Rechtliches|Intern|Links","tags":"3-6 kommagetrennte Schlagwoerter","body":"Gut strukturierte, praegnante Zusammenfassung des Dokumentinhalts fuer Vertriebsmitarbeiter, auf Deutsch"}
Waehle "cat" so passend wie moeglich zum Inhalt.`;

/** Reads a wiki source document (PDF bytes, or already-extracted plain text
 * from a .docx/.txt/.md) and returns autofill suggestions — no persistence,
 * the editor shows them for review and saves through the normal wiki
 * create/update endpoints. */
async function runWikiExtraction(
  run: AiRunContext,
  input: { kind: "pdf"; base64: string } | { kind: "text"; text: string },
): Promise<ExtractedWikiFields> {
  const content =
    input.kind === "pdf"
      ? [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: input.base64,
            },
          },
          { type: "text" as const, text: WIKI_EXTRACTION_PROMPT },
        ]
      : [{ type: "text" as const, text: `${WIKI_EXTRACTION_PROMPT}\n\nDOKUMENT:\n${input.text}` }];

  const data = parseModelJson(
    await runModelText(run, { max_tokens: 1200, messages: [{ role: "user", content }] }),
  );
  const cat = WIKI_CAT_VALUES.includes(data.cat as WikiCat) ? (data.cat as WikiCat) : "Intern";
  return { title: str(data.title).slice(0, 200), cat, tags: str(data.tags), body: str(data.body) };
}

interface Feedback {
  comments: Record<string, string>;
  missingInfos: string[];
  weakFormulations: string[];
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}

const SCORE_KEYS = [
  "zufriedenheit",
  "ev_schwenk",
  "informationen",
  "offene_fragen",
  "sprache",
  "quittung",
  "abschluss",
  "skript",
] as const;

type Scores = Record<(typeof SCORE_KEYS)[number], number>;

/** A report missing any score can't be charted or averaged, so it counts as
 * unreadable rather than being saved with holes. */
function readScores(value: unknown): Scores {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const scores = {} as Scores;
  for (const key of SCORE_KEYS) {
    const n = Number(source[key]);
    if (!Number.isFinite(n)) throw new AiRunError("unparsable");
    scores[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return scores;
}

function readFeedback(raw: Record<string, unknown>): Feedback {
  const comments: Record<string, string> = {};
  if (raw.comments && typeof raw.comments === "object") {
    for (const [key, value] of Object.entries(raw.comments)) {
      if (typeof value === "string") comments[key] = value;
    }
  }
  return {
    comments,
    missingInfos: strList(raw.missingInfos),
    weakFormulations: strList(raw.weakFormulations),
    strengths: strList(raw.strengths),
    improvements: strList(raw.improvements),
    nextSteps: strList(raw.nextSteps),
  };
}

/** Live hints stay a plain request: they fire every 35s mid-call, go stale
 * almost immediately, and missing one costs nothing — nothing to keep. */
async function callClaudeJson(system: string, userMsg: string): Promise<Record<string, unknown>> {
  const message = await anthropic.createMessage({
    model: AI_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return parseModelJson(text);
  } catch {
    console.error(`[sales-coach-ev] unparsable AI response (stop_reason=${message.stop_reason})`);
    throw Errors.upstream("Coach AI returned an unparsable response");
  }
}

async function getKpiText(clerkUserId: string): Promise<string> {
  const { kpiText } = await getConvex().query(api.salesCoachEv.settings.get, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  return kpiText;
}

function liveSystemPrompt(kpiText: string): string {
  return `Du bist Sales-Coach fuer Projekt EV (Wallbox-Neukunden, Bestandskunden mit Ladekarten).
Analysiere das Transkript und gib 1-3 Coaching-Hinweise auf Deutsch.

GESPRAECHSZIEL: Zufriedenheit -> EV-Schwenk -> Wallbox-Info -> Zukunftsplanung -> Termin/WV

WEG: 1=Reine EV-Flotte, 2=Mischflotte EV+Verbrenner, 3=Wallbox-Management

OFFENE FRAGEN: W-Fragen statt Ja/Nein. FALSCH: Laden Ihre Fahrer zuhause? RICHTIG: Wie laden Ihre Fahrer heute?

SCHWACHE FORMULIERUNGEN: wuerde/koennte -> werde/kann

EINWAND-QUITTIERUNG: annehmen, bestaetigen, offene Frage
${kpiText ? `KPI:\n${kpiText.slice(0, 1000)}` : ""}

Antworte NUR als JSON:
{"hints":[{"type":"tip|warn|good|miss|weak","tag":"Max 2 Woerter","text":"Konkreter Hinweis"}],"evChecks":[false,false,false,false,false],"detectedPath":0}`;
}

function reportSystemPrompt(kpiText: string): string {
  return `Du bist Sales-Coach fuer Projekt EV. Erstelle eine Gespraechsauswertung auf Deutsch.

ZIEL: Zufriedenheit -> EV-Schwenk -> Wallbox-Info -> Planung -> Termin/WV

PFLICHT-INFORMATIONEN:
- Flottenstruktur (Fahrzeuge gesamt, EV-Anteil)
- Lade-Ist-Zustand
- Wallbox Work/Home: vorhanden, Anzahl, Anbieter
- Transformationsplan
- Entscheidungstraeger
- Ergebnis A/B/C + Datum

SCHWACHE FORMULIERUNGEN: wuerde/koennte/eigentlich (aus Transkript zitieren)
${kpiText ? `KPI:\n${kpiText.slice(0, 1200)}` : ""}

BEWERTE 0-100:
1. zufriedenheit: Service-Einstieg professionell
2. ev_schwenk: Ueberleitung natuerlich
3. informationen: Pflicht-Infos erhoben
4. offene_fragen: W-Fragen statt Ja/Nein
5. sprache: Keine Weichmacher
6. quittung: Einwaende Annehmen-Bestaetigen-Frage
7. abschluss: Klares Ergebnis A/B/C
8. skript: Gesamteinhaltung

Antworte NUR als JSON:
{"scores":{"zufriedenheit":75,"ev_schwenk":60,"informationen":80,"offene_fragen":55,"sprache":70,"quittung":65,"abschluss":50,"skript":70},"comments":{"zufriedenheit":"...","ev_schwenk":"...","informationen":"...","offene_fragen":"...","sprache":"...","quittung":"...","abschluss":"...","skript":"..."},"missingInfos":["fehlende Info"],"weakFormulations":["Zitat"],"strengths":["Staerke 1","Staerke 2","Staerke 3"],"improvements":["Verbesserung 1","Verbesserung 2","Verbesserung 3"],"nextSteps":["Empfehlung 1","Empfehlung 2","Empfehlung 3"]}`;
}

const EOD_SYSTEM = `Du bist Sales-Coach. Fasse Staerken und Verbesserungsfelder zusammen. Antworte NUR als JSON: {"top3strengths":["...","...","..."],"top3improvements":["...","...","..."]}`;

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function decryptCall(call: {
  _id: Id<"salesCoachEvCalls">;
  startedAt: number;
  durationSec: number;
  callerSpeakPct: number;
  outcome: "termin" | "wiedervorlage" | "kein_ergebnis";
  transcriptEnc: string;
  scored: boolean;
  skillLevel?: number;
  scores?: Scores;
  feedbackEnc?: string;
}) {
  return {
    id: call._id,
    startedAt: call.startedAt,
    durationSec: call.durationSec,
    callerSpeakPct: call.callerSpeakPct,
    outcome: call.outcome,
    transcript: decrypt(call.transcriptEnc, ENC_KEY),
    scored: call.scored,
    skillLevel: call.skillLevel ?? null,
    scores: call.scores ?? null,
    feedback: call.feedbackEnc
      ? (JSON.parse(decrypt(call.feedbackEnc, ENC_KEY)) as Feedback)
      : null,
  };
}

export const salesCoachEvRoute = new Elysia({ prefix: "/sales-coach-ev" })
  .use(authed)
  // --- Calls ---------------------------------------------------------------
  .get(
    "/calls",
    async ({ caller, query }) => {
      const days = query.period === "7" ? 7 : query.period === "30" ? 30 : null;
      const sinceMs = days ? Date.now() - days * 86_400_000 : undefined;
      const calls = await caller.convex.query(api.salesCoachEv.calls.list, {
        sinceMs,
      });
      return { calls: calls.map(decryptCall) };
    },
    {
      signedIn: true,
      query: t.Object({
        period: t.Optional(t.Union([t.Literal("7"), t.Literal("30"), t.Literal("all")])),
      }),
    },
  )
  .get(
    "/calls/:id",
    async ({ caller, params }) => {
      const call = await caller.convex.query(api.salesCoachEv.calls.get, {
        id: params.id as Id<"salesCoachEvCalls">,
      });
      if (!call) throw Errors.notFound("Call not found");
      return { call: decryptCall(call) };
    },
    { signedIn: true },
  )
  .post(
    "/calls",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      await rateLimit("salesCoachEv.saveCall", clerkUserId, 30, "1 m");
      const { id } = await caller.convex.mutation(api.salesCoachEv.calls.create, {
        startedAt: Date.now() - body.durationSec * 1000,
        durationSec: body.durationSec,
        callerSpeakPct: body.callerSpeakPct,
        outcome: body.outcome,
        transcriptEnc: encrypt(body.transcript, ENC_KEY),
      });
      return { id };
    },
    {
      signedIn: true,
      body: t.Object({
        transcript: t.String(),
        durationSec: t.Number(),
        callerSpeakPct: t.Number(),
        outcome: outcomeSchema,
      }),
    },
  )
  /** Scores a saved call. The call itself is already stored, so the report
   * attaches to it when the run finishes whether or not anyone is watching. */
  .post(
    "/report",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      await rateLimit("salesCoachEv.report", clerkUserId, 10, "1 m");
      const kpiText = await getKpiText(clerkUserId);
      const userMsg = `Dauer: ${fmt(body.durationSec)}, Anrufer: ${body.callerSpeakPct}%, Ergebnis: ${body.outcome}\n\nTranskript:\n${body.transcript}`;

      return await startAiRun(
        {
          clerkUserId,
          kind: "coachReport",
          subjectKey: `coachReport:${body.callId}`,
          href: `/sales-coach-ev/progress/${body.callId}`,
        },
        async (run) => {
          // Larger budget than the default: 8 scores + 8 written comments +
          // several arrays comfortably exceeds 1024 tokens and was getting
          // truncated mid-JSON.
          const raw = parseModelJson(
            await runModelText(run, {
              max_tokens: 2048,
              system: reportSystemPrompt(kpiText),
              messages: [{ role: "user", content: userMsg }],
            }),
          );
          const scores = readScores(raw.scores);
          const skillLevel = Math.round(
            SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0) / SCORE_KEYS.length,
          );
          const feedback = readFeedback(raw);
          run.phase("finishing");
          await caller.convex.mutation(api.salesCoachEv.calls.attachReport, {
            id: body.callId as Id<"salesCoachEvCalls">,
            scores,
            skillLevel,
            feedbackEnc: encrypt(JSON.stringify(feedback), ENC_KEY),
          });
          return JSON.stringify({ scores, skillLevel, feedback });
        },
      );
    },
    {
      signedIn: true,
      body: t.Object({
        callId: t.String(),
        transcript: t.String(),
        durationSec: t.Number(),
        callerSpeakPct: t.Number(),
        outcome: outcomeSchema,
      }),
    },
  )
  .post(
    "/live-hint",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      await rateLimit("salesCoachEv.liveHint", clerkUserId, 6, "1 m");
      await requireAi(clerkUserId);
      const kpiText = await getKpiText(clerkUserId);
      const userMsg = `Gespraechszeit: ${fmt(body.elapsedSec)}\n\n${body.transcriptTail}`;
      const raw = await callClaudeJson(liveSystemPrompt(kpiText), userMsg);
      const hints = Array.isArray(raw.hints)
        ? raw.hints
            .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
            .map((h) => ({ type: str(h.type), tag: str(h.tag), text: str(h.text) }))
            .filter((h) => h.text)
        : [];
      const evChecks =
        Array.isArray(raw.evChecks) && raw.evChecks.length === 5
          ? raw.evChecks.map((c) => c === true)
          : [false, false, false, false, false];
      return { hints, evChecks, detectedPath: Number(raw.detectedPath) || 0 };
    },
    {
      signedIn: true,
      body: t.Object({ transcriptTail: t.String(), elapsedSec: t.Number() }),
    },
  )
  /** `key` names the set of calls being summarised, so reopening the dialog
   * on the same day and call count shows the summary already written. */
  .post(
    "/eod-summary",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      await rateLimit("salesCoachEv.eodSummary", clerkUserId, 5, "1 m");
      const userMsg = `Staerken:\n${body.strengths.slice(0, 15).join("\n")}\n\nVerbesserungen:\n${body.improvements.slice(0, 15).join("\n")}`;

      return await startAiRun(
        {
          clerkUserId,
          kind: "coachEod",
          subjectKey: `coachEod:${body.key}`,
          href: "/sales-coach-ev/progress/summary",
        },
        async (run) => {
          const raw = parseModelJson(
            await runModelText(run, {
              max_tokens: 1024,
              system: EOD_SYSTEM,
              messages: [{ role: "user", content: userMsg }],
            }),
          );
          return JSON.stringify({
            top3strengths: strList(raw.top3strengths).slice(0, 3),
            top3improvements: strList(raw.top3improvements).slice(0, 3),
          });
        },
      );
    },
    {
      signedIn: true,
      body: t.Object({
        strengths: t.Array(t.String()),
        improvements: t.Array(t.String()),
        key: t.String({ minLength: 1, maxLength: 64 }),
      }),
    },
  )
  // --- Wiki ------------------------------------------------------------------
  .get(
    "/wiki",
    async () => {
      const articles = await getConvex().query(api.salesCoachEv.wiki.list, {
        serverKey: getConvexServerKey(),
      });
      return { articles };
    },
    { signedIn: true },
  )
  .post(
    "/wiki",
    async ({ caller, body }) => {
      const { id } = await caller.convex.mutation(api.salesCoachEv.wiki.create, {
        ...body,
        storageId: body.storageId as Id<"_storage"> | undefined,
      });
      return { id };
    },
    {
      signedIn: true,
      body: t.Object({
        title: t.String(),
        cat: wikiCatSchema,
        tags: t.String(),
        body: t.String(),
        url: t.Optional(t.String()),
        isLink: t.Optional(t.Boolean()),
        storageId: t.Optional(t.String()),
        fileName: t.Optional(t.String()),
        fileContentType: t.Optional(t.String()),
        fileSize: t.Optional(t.Number()),
      }),
    },
  )
  .patch(
    "/wiki/:id",
    async ({ caller, params, body }) => {
      await caller.convex.mutation(api.salesCoachEv.wiki.update, {
        id: params.id as Id<"salesCoachEvWiki">,
        ...body,
        storageId: body.storageId as Id<"_storage"> | undefined,
      });
      return { updated: true };
    },
    {
      signedIn: true,
      body: t.Object({
        title: t.Optional(t.String()),
        cat: t.Optional(wikiCatSchema),
        tags: t.Optional(t.String()),
        body: t.Optional(t.String()),
        url: t.Optional(t.String()),
        storageId: t.Optional(t.String()),
        fileName: t.Optional(t.String()),
        fileContentType: t.Optional(t.String()),
        fileSize: t.Optional(t.Number()),
        removeFile: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/wiki/:id",
    async ({ caller, params }) => {
      await caller.convex.mutation(api.salesCoachEv.wiki.remove, {
        id: params.id as Id<"salesCoachEvWiki">,
      });
      return { deleted: true };
    },
    { signedIn: true },
  )
  // Reads a source document (PDF sent as a file; .docx/.txt/.md sent as
  // already-extracted plain text, since the client already has mammoth for
  // that) and returns wiki-field suggestions — admin-gated same as every
  // other wiki write, since only admins can save the result anyway.
  .post(
    "/wiki/extract",
    async ({ caller, body }) => {
      const { clerkUserId } = caller;
      await rateLimit("salesCoachEv.wikiExtract", clerkUserId, 15, "1 m");
      const isAdmin = await caller.convex.query(api.salesCoachEv.wiki.isAdmin, {});
      if (!isAdmin) throw Errors.forbidden();

      const { file, text } = body;
      let input: { kind: "pdf"; base64: string } | { kind: "text"; text: string };
      if (file) {
        if (file.type !== "application/pdf") {
          throw Errors.badRequest(
            "Bitte eine PDF-Datei hochladen (Word/Text werden bereits als Text gesendet)",
          );
        }
        if (file.size > MAX_WIKI_DOC_BYTES) {
          throw Errors.badRequest(`Datei groesser als ${MAX_WIKI_DOC_BYTES / (1024 * 1024)} MB`);
        }
        input = { kind: "pdf", base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
      } else if (text?.trim()) {
        input = { kind: "text", text: text.slice(0, MAX_WIKI_EXTRACT_TEXT_CHARS) };
      } else {
        throw Errors.badRequest("Keine Datei oder Text uebergeben");
      }
      const fileName = file?.name ?? body.fileName ?? "";

      return await startAiRun(
        {
          clerkUserId,
          kind: "coachWikiExtract",
          subjectKey: `coachWikiExtract:${body.subjectKey ?? "new"}`,
          title: fileName || undefined,
          href: body.href ?? `/sales-coach-ev/wiki/${body.subjectKey ?? "new"}`,
        },
        async (run) => JSON.stringify({ ...(await runWikiExtraction(run, input)), fileName }),
      );
    },
    {
      signedIn: true,
      body: t.Object({
        file: t.Optional(t.File()),
        text: t.Optional(t.String()),
        fileName: t.Optional(t.String({ maxLength: 260 })),
        subjectKey: t.Optional(t.String({ maxLength: 64 })),
        href: t.Optional(t.String({ maxLength: 300, pattern: "^/[^/\\\\]" })),
      }),
    },
  )
  // --- Settings ----------------------------------------------------------
  .get(
    "/settings",
    async ({ caller }) => {
      const settings = await caller.convex.query(api.salesCoachEv.settings.get, {});
      return settings;
    },
    { signedIn: true },
  )
  .patch(
    "/settings",
    async ({ caller, body }) => {
      await caller.convex.mutation(api.salesCoachEv.settings.upsert, {
        kpiText: body.kpiText,
      });
      return { updated: true };
    },
    {
      signedIn: true,
      body: t.Object({ kpiText: t.String() }),
    },
  )
  // --- Admin roster --------------------------------------------------------
  .get(
    "/admin/roster",
    async ({ caller, query }) => {
      const days = query.days ? Number(query.days) : 30;
      const roster = await caller.convex.query(api.salesCoachEv.calls.adminRoster, {
        sinceMs: Date.now() - days * 86_400_000,
      });
      return { roster };
    },
    {
      signedIn: true,
      query: t.Object({ days: t.Optional(t.String()) }),
    },
  )
  // Team tab's detail view: one rep's own call history/score breakdown over
  // the same trailing window as the roster, never the transcript/feedback
  // ciphertext (see adminUserDetail's own comment).
  .get(
    "/admin/user/:clerkUserId",
    async ({ caller, params, query }) => {
      const days = query.days ? Number(query.days) : 30;
      const detail = await caller.convex.query(api.salesCoachEv.calls.adminUserDetail, {
        targetClerkUserId: params.clerkUserId,
        sinceMs: Date.now() - days * 86_400_000,
      });
      return { detail };
    },
    {
      signedIn: true,
      query: t.Object({ days: t.Optional(t.String()) }),
    },
  );
