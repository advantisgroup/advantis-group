import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { ConvexError } from "convex/values";
import { Elysia, t } from "elysia";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { anthropic } from "../lib/anthropic.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";
import { requireAuth } from "../lib/middleware.js";
import { rateLimit } from "../lib/rate-limit.js";

/** Sales Coach EV transcripts/feedback get their own rotatable key, separate from Wiki Chat. */
const ENC_KEY = "SALES_COACH_EV_ENC_KEY";

const outcomeSchema = t.Union([
  t.Literal("termin"),
  t.Literal("wiedervorlage"),
  t.Literal("kein_ergebnis"),
]);

/** Maps a ConvexError thrown by an admin-gated salesCoachEv function (forbidden/not_found) to the matching ApiError. */
function mapConvexError(err: unknown) {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: string; message?: string } | undefined;
    if (data?.code === "not_found") return Errors.notFound(data.message);
    return Errors.forbidden(data?.message);
  }
  return Errors.forbidden();
}

interface Feedback {
  comments: Record<string, string>;
  missingInfos: string[];
  weakFormulations: string[];
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}

interface Scores {
  zufriedenheit: number;
  ev_schwenk: number;
  informationen: number;
  offene_fragen: number;
  sprache: number;
  quittung: number;
  abschluss: number;
  skript: number;
}

async function callClaudeJson(system: string, userMsg: string, maxTokens = 1024): Promise<unknown> {
  const message = await anthropic.createMessage({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  // Strip markdown fences and any stray prose the model adds around the JSON
  // object despite being told to answer with JSON only.
  const stripped = text.replace(/```json|```/g, "").trim();
  const jsonSlice = stripped.slice(stripped.indexOf("{"), stripped.lastIndexOf("}") + 1);
  try {
    return JSON.parse(jsonSlice || stripped);
  } catch {
    // A truncated response (hit max_tokens mid-object) is the most likely
    // cause, so retain its stop reason without writing call content to logs.
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
  // --- Calls ---------------------------------------------------------------
  .get(
    "/calls",
    async ({ request, query }) => {
      const { clerkUserId } = await requireAuth(request);
      const days = query.period === "7" ? 7 : query.period === "30" ? 30 : null;
      const sinceMs = days ? Date.now() - days * 86_400_000 : undefined;
      const calls = await getConvex().query(api.salesCoachEv.calls.list, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        sinceMs,
      });
      return { calls: calls.map(decryptCall) };
    },
    {
      query: t.Object({
        period: t.Optional(t.Union([t.Literal("7"), t.Literal("30"), t.Literal("all")])),
      }),
    },
  )
  .get("/calls/:id", async ({ request, params }) => {
    const { clerkUserId } = await requireAuth(request);
    const call = await getConvex().query(api.salesCoachEv.calls.get, {
      serverKey: getConvexServerKey(),
      clerkUserId,
      id: params.id as Id<"salesCoachEvCalls">,
    });
    if (!call) throw Errors.notFound("Call not found");
    return { call: decryptCall(call) };
  })
  .post(
    "/calls",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("salesCoachEv.saveCall", clerkUserId, 30, "1 m");
      const { id } = await getConvex().mutation(api.salesCoachEv.calls.create, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        startedAt: Date.now() - body.durationSec * 1000,
        durationSec: body.durationSec,
        callerSpeakPct: body.callerSpeakPct,
        outcome: body.outcome,
        transcriptEnc: encrypt(body.transcript, ENC_KEY),
      });
      return { id };
    },
    {
      body: t.Object({
        transcript: t.String(),
        durationSec: t.Number(),
        callerSpeakPct: t.Number(),
        outcome: outcomeSchema,
      }),
    },
  )
  .post(
    "/report",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("salesCoachEv.report", clerkUserId, 10, "1 m");
      const kpiText = await getKpiText(clerkUserId);
      const userMsg = `Dauer: ${fmt(body.durationSec)}, Anrufer: ${body.callerSpeakPct}%, Ergebnis: ${body.outcome}\n\nTranskript:\n${body.transcript}`;
      // Larger budget than the default: 8 scores + 8 written comments + several
      // arrays comfortably exceeds 1024 tokens and was getting truncated
      // mid-JSON, which surfaced as a generic "unparsable response" 502.
      const raw = (await callClaudeJson(reportSystemPrompt(kpiText), userMsg, 2048)) as {
        scores: Scores;
        comments: Record<string, string>;
        missingInfos?: string[];
        weakFormulations?: string[];
        strengths?: string[];
        improvements?: string[];
        nextSteps?: string[];
      };
      const skillLevel = Math.round(
        Object.values(raw.scores).reduce((sum, v) => sum + v, 0) / Object.keys(raw.scores).length,
      );
      const feedback: Feedback = {
        comments: raw.comments ?? {},
        missingInfos: raw.missingInfos ?? [],
        weakFormulations: raw.weakFormulations ?? [],
        strengths: raw.strengths ?? [],
        improvements: raw.improvements ?? [],
        nextSteps: raw.nextSteps ?? [],
      };
      await getConvex().mutation(api.salesCoachEv.calls.attachReport, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        id: body.callId as Id<"salesCoachEvCalls">,
        scores: raw.scores,
        skillLevel,
        feedbackEnc: encrypt(JSON.stringify(feedback), ENC_KEY),
      });
      return { scores: raw.scores, skillLevel, feedback };
    },
    {
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
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("salesCoachEv.liveHint", clerkUserId, 6, "1 m");
      const kpiText = await getKpiText(clerkUserId);
      const userMsg = `Gespraechszeit: ${fmt(body.elapsedSec)}\n\n${body.transcriptTail}`;
      const raw = (await callClaudeJson(liveSystemPrompt(kpiText), userMsg)) as {
        hints?: { type: string; tag: string; text: string }[];
        evChecks?: boolean[];
        detectedPath?: number;
      };
      return {
        hints: raw.hints ?? [],
        evChecks: raw.evChecks ?? [false, false, false, false, false],
        detectedPath: raw.detectedPath ?? 0,
      };
    },
    { body: t.Object({ transcriptTail: t.String(), elapsedSec: t.Number() }) },
  )
  .post(
    "/eod-summary",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("salesCoachEv.eodSummary", clerkUserId, 5, "1 m");
      const userMsg = `Staerken:\n${body.strengths.slice(0, 15).join("\n")}\n\nVerbesserungen:\n${body.improvements.slice(0, 15).join("\n")}`;
      const raw = (await callClaudeJson(EOD_SYSTEM, userMsg)) as {
        top3strengths?: string[];
        top3improvements?: string[];
      };
      return {
        top3strengths: raw.top3strengths ?? [],
        top3improvements: raw.top3improvements ?? [],
      };
    },
    { body: t.Object({ strengths: t.Array(t.String()), improvements: t.Array(t.String()) }) },
  )
  // --- Wiki ------------------------------------------------------------------
  .get("/wiki", async ({ request }) => {
    await requireAuth(request);
    const articles = await getConvex().query(api.salesCoachEv.wiki.list, {
      serverKey: getConvexServerKey(),
    });
    return { articles };
  })
  .post(
    "/wiki",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      try {
        const { id } = await getConvex().mutation(api.salesCoachEv.wiki.create, {
          serverKey: getConvexServerKey(),
          clerkUserId,
          ...body,
        });
        return { id };
      } catch (err) {
        throw mapConvexError(err);
      }
    },
    {
      body: t.Object({
        title: t.String(),
        cat: t.Union([
          t.Literal("Produktdaten"),
          t.Literal("Preisliste"),
          t.Literal("Technik"),
          t.Literal("Argumente"),
          t.Literal("Rechtliches"),
          t.Literal("Intern"),
          t.Literal("Links"),
        ]),
        tags: t.String(),
        body: t.String(),
        url: t.Optional(t.String()),
        isLink: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/wiki/:id",
    async ({ request, params, body }) => {
      const { clerkUserId } = await requireAuth(request);
      try {
        await getConvex().mutation(api.salesCoachEv.wiki.update, {
          serverKey: getConvexServerKey(),
          clerkUserId,
          id: params.id as Id<"salesCoachEvWiki">,
          ...body,
        });
        return { updated: true };
      } catch (err) {
        throw mapConvexError(err);
      }
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        cat: t.Optional(
          t.Union([
            t.Literal("Produktdaten"),
            t.Literal("Preisliste"),
            t.Literal("Technik"),
            t.Literal("Argumente"),
            t.Literal("Rechtliches"),
            t.Literal("Intern"),
            t.Literal("Links"),
          ]),
        ),
        tags: t.Optional(t.String()),
        body: t.Optional(t.String()),
        url: t.Optional(t.String()),
      }),
    },
  )
  .delete("/wiki/:id", async ({ request, params }) => {
    const { clerkUserId } = await requireAuth(request);
    try {
      await getConvex().mutation(api.salesCoachEv.wiki.remove, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        id: params.id as Id<"salesCoachEvWiki">,
      });
      return { deleted: true };
    } catch (err) {
      throw mapConvexError(err);
    }
  })
  // --- Settings ----------------------------------------------------------
  .get("/settings", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const settings = await getConvex().query(api.salesCoachEv.settings.get, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
    return settings;
  })
  .patch(
    "/settings",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await getConvex().mutation(api.salesCoachEv.settings.upsert, {
        serverKey: getConvexServerKey(),
        clerkUserId,
        kpiText: body.kpiText,
      });
      return { updated: true };
    },
    { body: t.Object({ kpiText: t.String() }) },
  )
  // --- Admin roster --------------------------------------------------------
  .get(
    "/admin/roster",
    async ({ request, query }) => {
      const { clerkUserId } = await requireAuth(request);
      const days = query.days ? Number(query.days) : 30;
      try {
        const roster = await getConvex().query(api.salesCoachEv.calls.adminRoster, {
          serverKey: getConvexServerKey(),
          clerkUserId,
          sinceMs: Date.now() - days * 86_400_000,
        });
        return { roster };
      } catch (err) {
        throw mapConvexError(err);
      }
    },
    { query: t.Object({ days: t.Optional(t.String()) }) },
  )
  // Team tab's detail view: one rep's own call history/score breakdown over
  // the same trailing window as the roster, never the transcript/feedback
  // ciphertext (see adminUserDetail's own comment).
  .get(
    "/admin/user/:clerkUserId",
    async ({ request, params, query }) => {
      const { clerkUserId } = await requireAuth(request);
      const days = query.days ? Number(query.days) : 30;
      try {
        const detail = await getConvex().query(api.salesCoachEv.calls.adminUserDetail, {
          serverKey: getConvexServerKey(),
          clerkUserId,
          targetClerkUserId: params.clerkUserId,
          sinceMs: Date.now() - days * 86_400_000,
        });
        return { detail };
      } catch (err) {
        throw mapConvexError(err);
      }
    },
    { query: t.Object({ days: t.Optional(t.String()) }) },
  );
