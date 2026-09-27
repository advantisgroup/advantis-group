import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { waitUntil } from "@vercel/functions";
import { ConvexError } from "convex/values";

import { anthropic } from "./anthropic.js";
import { getConvex, getConvexServerKey } from "./convex.js";
import { encrypt } from "./crypto.js";
import { ApiError, ProviderError } from "./errors.js";

/** Every AI call in the API goes through this one model id. */
export const AI_MODEL = "claude-sonnet-4-6";

export type AiRunKind =
  | "wikiChat"
  | "wikiFormat"
  | "wikiMeta"
  | "coachReport"
  | "coachEod"
  | "coachWikiExtract"
  | "cvExtract"
  | "cvRescan"
  | "ask"
  | "dailyBrief"
  | "navigate";

export type AiRunPhase = "reading" | "writing" | "finishing";

/** The codes the browser translates. Anything else it shows as generic. */
export type AiRunErrorCode =
  | "rate_limited"
  | "upstream"
  | "unparsable"
  | "no_content"
  | "truncated"
  | "internal";

export class AiRunError extends Error {
  constructor(
    readonly code: AiRunErrorCode,
    readonly retryable = true,
  ) {
    super(code);
    this.name = "AiRunError";
  }
}

/** Sales Coach content keeps its own rotatable key (see sales-coach-ev.ts);
 * everything else shares the wiki chat key, as chat history always has. */
export function runEncryptionKey(kind: AiRunKind): string {
  return kind.startsWith("coach") ? "SALES_COACH_EV_ENC_KEY" : "WIKI_CHAT_ENC_KEY";
}

/** Only in-app paths — a run's `href` becomes a link in the dock. */
export function safeHref(href: string | undefined): string | undefined {
  return href && href.startsWith("/") && !href.startsWith("//") ? href.slice(0, 300) : undefined;
}

/** One thing the model was given, shown in the run's details. Keep labels
 * plain enough to mean something to whoever reads them later. */
export interface AiRunSource {
  label: string;
  /** In-app link to the thing itself, where one exists. */
  href?: string;
}

/** One block of a message, as the model got or wrote it. */
export type AiTranscriptPart =
  | { type: "text"; text: string }
  | { type: "file"; name: string }
  | { type: "toolCall"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolCallId: string; text: string };

/** One step of a run, in the order it happened. `message` is something sent
 * to the model (including earlier answers sent back as context), `reply` is
 * what the model wrote during this run, `lookup` a search the intranet did
 * on its own before asking. */
export type AiTranscriptTurn =
  | { at: number; type: "instructions"; text: string }
  | { at: number; type: "message"; role: "user" | "assistant"; parts: AiTranscriptPart[] }
  | {
      at: number;
      type: "reply";
      parts: AiTranscriptPart[];
      stopReason: string | null;
      tokensIn: number;
      tokensOut: number;
    }
  | { at: number; type: "lookup"; label: string; query: string; results: string[] };

/** What a run sent to the model and got back, turn by turn — stored sealed
 * next to the run so it can be read back later. The intranet reads the same
 * shape (components/ai/transcript.ts). */
export interface AiTranscript {
  version: 2;
  turns: AiTranscriptTurn[];
  /** Some text was shortened to stay under the size cap. */
  truncated: boolean;
}

/** A transcript larger than this is shortened, longest texts first. */
const TRANSCRIPT_CAP_CHARS = 200_000;

type ContentLike = string | readonly { type: string; [key: string]: unknown }[] | null | undefined;

/** Blocks as the model saw them. Files show up as a placeholder naming them,
 * never their bytes — a transcript is for reading, not for re-sending. */
export function toParts(content: ContentLike): AiTranscriptPart[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((block): AiTranscriptPart => {
    switch (block.type) {
      case "text":
        return { type: "text", text: String(block.text ?? "") };
      case "image":
        return { type: "file", name: "Bild" };
      case "document": {
        const title = typeof block.title === "string" ? block.title : null;
        const source = block.source as { media_type?: string } | undefined;
        return { type: "file", name: title ?? source?.media_type ?? "Dokument" };
      }
      case "tool_use":
        return {
          type: "toolCall",
          id: String(block.id),
          name: String(block.name),
          input: block.input,
        };
      case "tool_result":
        return {
          type: "toolResult",
          toolCallId: String(block.tool_use_id),
          text: toParts(block.content as ContentLike)
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("\n\n"),
        };
      default:
        return { type: "text", text: `[${block.type}]` };
    }
  });
}

function partsText(content: ContentLike): string {
  return toParts(content)
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n\n");
}

/** Shrinks the longest texts until the whole thing fits under the cap. */
export function capTranscript(transcript: AiTranscript, cap = TRANSCRIPT_CAP_CHARS): AiTranscript {
  let json = JSON.stringify(transcript);
  if (json.length <= cap) return transcript;
  const copy: AiTranscript = structuredClone(transcript);
  copy.truncated = true;
  const cut = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max)}\n[… ${text.length - max} Zeichen gekürzt]` : text;
  for (let max = 20_000; max >= 200 && json.length > cap; max = Math.floor(max / 2)) {
    for (const turn of copy.turns) {
      if (turn.type === "instructions") turn.text = cut(turn.text, max);
      else if (turn.type === "lookup") turn.results = turn.results.map((r) => cut(r, max));
      else {
        for (const part of turn.parts) {
          if (part.type === "text" || part.type === "toolResult") part.text = cut(part.text, max);
        }
      }
    }
    json = JSON.stringify(copy);
  }
  return copy;
}

type TranscriptRequest = {
  system?: unknown;
  messages: readonly { role: string; content: unknown }[];
};

/**
 * Adds one model call's request to the transcript. A tool loop resends the
 * whole conversation every time, so when the instructions match and the
 * messages only grew, only what's new is added — skipping the previous reply,
 * which is already there as a `reply` turn.
 */
export function recordRequest(
  transcript: AiTranscript,
  cursor: { system: string | null; messages: number },
  request: TranscriptRequest,
) {
  const at = Date.now();
  const system = request.system === undefined ? null : partsText(request.system as ContentLike);
  const continues =
    cursor.messages > 0 && system === cursor.system && request.messages.length > cursor.messages;
  if (!continues && system && system !== cursor.system) {
    transcript.turns.push({ at, type: "instructions", text: system });
  }
  const fresh = continues ? request.messages.slice(cursor.messages) : request.messages;
  for (const message of fresh) {
    transcript.turns.push({
      at,
      type: "message",
      role: message.role === "assistant" ? "assistant" : "user",
      parts: toParts(message.content as ContentLike),
    });
  }
  cursor.system = system;
  // The reply about to come back is the next message a continuation resends.
  cursor.messages = request.messages.length + 1;
}

export interface AiRunContext {
  signal: AbortSignal;
  phase(phase: AiRunPhase): void;
  /** The text so far — snapshots are throttled, so call it on every delta. */
  text(soFar: string): void;
  /** Declare what went into the prompt, so the run can say so afterwards. */
  addSources(sources: AiRunSource[]): void;
  /** Called by `runModelText` for every model turn in the run. */
  recordUsage(tokensIn: number, tokensOut: number): void;
  /** The run's transcript — `runModelTurn` adds every call to it. */
  transcript: AiTranscript;
  /** How much of the conversation the transcript already holds. */
  transcriptCursor: { system: string | null; messages: number };
  /** A search the intranet did on its own before asking the model (a tool
   * call the model makes is recorded with the call instead). */
  recordLookup(label: string, query: string, results: string[]): void;
  /** Where the result lives, when that's only known at the end (the
   * wayfinder's destination) — the dock links there instead. */
  setHref(href: string): void;
}

const HEARTBEAT_MS = 5_000;
const SNAPSHOT_MS = 350;

function describeFailure(err: unknown): { code: string; retryable: boolean } {
  if (err instanceof AiRunError) return { code: err.code, retryable: err.retryable };
  if (err instanceof ProviderError) {
    return {
      code: err.code === "rate_limited" ? "rate_limited" : "upstream",
      retryable: err.retryable,
    };
  }
  if (err instanceof ApiError) return { code: err.code, retryable: false };
  return { code: "internal", retryable: true };
}

/** Why Convex wouldn't let an AI call through, as an answer for the browser. */
function refusal(err: unknown): unknown {
  const code = err instanceof ConvexError ? (err.data as { code?: string })?.code : undefined;
  switch (code) {
    case "conflict":
      return new ApiError(409, "conflict", "This is still being worked on.");
    case "disabled":
      return new ApiError(503, "feature_disabled", "AI is switched off right now.");
    case "no_capability":
      return new ApiError(403, "forbidden", "AI is not enabled for your account.");
    case "no_area_access":
      return new ApiError(403, "forbidden", "You don't have access to this area.");
    case "ai_limit":
      return new ApiError(429, "ai_limit", "Today's AI allowance is used up.");
    default:
      return err;
  }
}

/** For AI calls that aren't runs (Sales Coach's live hints): the same
 * switch-and-permission gate `startAiRun` passes through. */
export async function requireAi(clerkUserId: string) {
  try {
    await getConvex().query(api.aiRuns.apiCheck, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
  } catch (err) {
    throw refusal(err);
  }
}

/**
 * Opens a run row and does `work` after the response has gone out.
 *
 * `waitUntil` is what keeps a Vercel function alive past its response; under
 * a plain Bun server the promise just runs. Snapshots go through a single
 * promise chain so a slow write can never land after a newer one and roll the
 * visible text backwards.
 */
export async function startAiRun(
  scope: {
    clerkUserId: string;
    kind: AiRunKind;
    subjectKey: string;
    href?: string;
    /** What it's about in a few words — the question, the file name. */
    title?: string;
  },
  work: (run: AiRunContext) => Promise<string>,
): Promise<{ runId: Id<"aiRuns"> }> {
  const convex = getConvex();
  const serverKey = getConvexServerKey();

  const key = runEncryptionKey(scope.kind);
  const title = scope.title?.replace(/\s+/g, " ").trim().slice(0, 140);

  let runId: Id<"aiRuns">;
  try {
    runId = await convex.mutation(api.aiRuns.apiStart, {
      serverKey,
      clerkUserId: scope.clerkUserId,
      kind: scope.kind,
      subjectKey: scope.subjectKey,
      href: safeHref(scope.href),
      model: AI_MODEL,
      title: title ? encrypt(title, key) : undefined,
    });
  } catch (err) {
    throw refusal(err);
  }

  const controller = new AbortController();
  let phase: AiRunPhase = "reading";
  let latest = "";
  let lastSnapshotAt = 0;
  let writes = Promise.resolve();
  let sources: AiRunSource[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let resultHref: string | undefined;
  const transcript: AiTranscript = { version: 2, turns: [], truncated: false };

  const push = () => {
    const snapshot = {
      phase,
      output: latest ? encrypt(latest, key) : undefined,
      outputChars: latest.length,
    };
    writes = writes
      .then(async () => {
        const { cancelled } = await convex.mutation(api.aiRuns.apiProgress, {
          serverKey,
          runId,
          ...snapshot,
        });
        if (cancelled) controller.abort();
      })
      .catch((err) => console.error(`[ai-runs] progress write failed (${runId})`, err));
  };

  const context: AiRunContext = {
    signal: controller.signal,
    phase(next) {
      if (next === phase) return;
      phase = next;
      push();
    },
    text(soFar) {
      latest = soFar;
      phase = "writing";
      const now = Date.now();
      if (now - lastSnapshotAt >= SNAPSHOT_MS) {
        lastSnapshotAt = now;
        push();
      }
    },
    addSources(next) {
      // Capped: this is a summary for a person to read, not an audit trail.
      sources = [...sources, ...next].slice(0, 12);
    },
    recordUsage(inTokens, outTokens) {
      tokensIn += inTokens;
      tokensOut += outTokens;
    },
    transcript,
    transcriptCursor: { system: null, messages: 0 },
    recordLookup(label, query, results) {
      transcript.turns.push({ at: Date.now(), type: "lookup", label, query, results });
    },
    setHref(href) {
      resultHref = safeHref(href);
    },
  };

  const sealedTranscript = () => {
    if (transcript.turns.length === 0) return undefined;
    const capped = capTranscript(transcript);
    const json = JSON.stringify(capped);
    return {
      data: encrypt(json, key),
      chars: json.length,
      truncated: capped.truncated,
    };
  };

  const job = (async () => {
    const heartbeat = setInterval(push, HEARTBEAT_MS);
    let output: string | undefined;
    let failure: unknown;
    try {
      output = await work(context);
    } catch (err) {
      failure = err;
    }
    clearInterval(heartbeat);
    await writes;
    if (controller.signal.aborted) return;

    try {
      if (output !== undefined) {
        await convex.mutation(api.aiRuns.apiFinish, {
          serverKey,
          runId,
          output: encrypt(output, key),
          outputChars: output.length,
          transcript: sealedTranscript(),
          href: resultHref,
          tokensIn: tokensIn || undefined,
          tokensOut: tokensOut || undefined,
          sources: sources.length > 0 ? sources : undefined,
        });
      } else {
        const { code, retryable } = describeFailure(failure);
        console.error(`[ai-runs] ${scope.kind} ${runId} failed (${code})`, failure);
        await convex.mutation(api.aiRuns.apiFail, {
          serverKey,
          runId,
          errorCode: code,
          retryable,
          transcript: sealedTranscript(),
          tokensIn: tokensIn || undefined,
          tokensOut: tokensOut || undefined,
          sources: sources.length > 0 ? sources : undefined,
        });
      }
    } catch (err) {
      console.error(`[ai-runs] could not settle ${runId}`, err);
    }
  })();

  waitUntil(job);
  return { runId };
}

type TextRequest = Omit<Parameters<typeof anthropic.streamText>[0], "model">;

/**
 * One model call inside a run, recorded in the run's transcript before it
 * goes out (so a call that fails still shows what it was sent) and after
 * (the reply, including any tool calls). Returns the whole message for
 * callers that use tools; most want `runModelText`.
 */
export async function runModelTurn(run: AiRunContext, request: TextRequest) {
  recordRequest(run.transcript, run.transcriptCursor, request);
  const { text, message } = await anthropic.streamText(
    { model: AI_MODEL, ...request },
    { signal: run.signal, onText: run.text },
  );
  const parts = toParts(message.content as unknown as ContentLike);
  const tokensIn = message.usage?.input_tokens ?? 0;
  const tokensOut = message.usage?.output_tokens ?? 0;
  run.transcript.turns.push({
    at: Date.now(),
    type: "reply",
    parts: parts.length > 0 ? parts : [{ type: "text", text }],
    stopReason: message.stop_reason ?? null,
    tokensIn,
    tokensOut,
  });
  run.recordUsage(tokensIn, tokensOut);
  return { text, message };
}

/**
 * One model turn inside a run. A reply cut off by `max_tokens` is a failure
 * for anything structured (the JSON would be incomplete); prose callers like
 * chat can accept it.
 */
export async function runModelText(
  run: AiRunContext,
  request: TextRequest,
  { acceptTruncated = false }: { acceptTruncated?: boolean } = {},
): Promise<string> {
  const { text, message } = await runModelTurn(run, request);
  if (!text.trim()) throw new AiRunError("no_content");
  if (message.stop_reason === "max_tokens" && !acceptTruncated) {
    throw new AiRunError("truncated");
  }
  return text;
}

/** The one place a model's "JSON only, please" reply gets read. Tolerates
 * fences and stray prose around the object; anything else is unparsable. */
export function parseModelJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(clean.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Falls through to the unparsable error below.
    }
  }
  throw new AiRunError("unparsable");
}

export const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const strList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
