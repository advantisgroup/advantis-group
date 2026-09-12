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
  | "ask";

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

export interface AiRunContext {
  signal: AbortSignal;
  phase(phase: AiRunPhase): void;
  /** The text so far — snapshots are throttled, so call it on every delta. */
  text(soFar: string): void;
  /** Declare what went into the prompt, so the run can say so afterwards. */
  addSources(sources: AiRunSource[]): void;
  /** Called by `runModelText` for every model turn in the run. */
  recordUsage(tokensIn: number, tokensOut: number): void;
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

/**
 * Opens a run row and does `work` after the response has gone out.
 *
 * `waitUntil` is what keeps a Vercel function alive past its response; under
 * a plain Bun server the promise just runs. Snapshots go through a single
 * promise chain so a slow write can never land after a newer one and roll the
 * visible text backwards.
 */
export async function startAiRun(
  scope: { clerkUserId: string; kind: AiRunKind; subjectKey: string; href?: string },
  work: (run: AiRunContext) => Promise<string>,
): Promise<{ runId: Id<"aiRuns"> }> {
  const convex = getConvex();
  const serverKey = getConvexServerKey();

  let runId: Id<"aiRuns">;
  try {
    runId = await convex.mutation(api.aiRuns.apiStart, {
      serverKey,
      clerkUserId: scope.clerkUserId,
      kind: scope.kind,
      subjectKey: scope.subjectKey,
      href: safeHref(scope.href),
      model: AI_MODEL,
    });
  } catch (err) {
    const code = err instanceof ConvexError ? (err.data as { code?: string })?.code : undefined;
    if (code === "conflict") {
      throw new ApiError(409, "conflict", "This is still being worked on.");
    }
    if (code === "disabled") {
      throw new ApiError(503, "feature_disabled", "AI is switched off right now.");
    }
    throw err;
  }

  const key = runEncryptionKey(scope.kind);
  const controller = new AbortController();
  let phase: AiRunPhase = "reading";
  let latest = "";
  let lastSnapshotAt = 0;
  let writes = Promise.resolve();
  let sources: AiRunSource[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

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
          tokensIn: tokensIn || undefined,
          tokensOut: tokensOut || undefined,
          sources: sources.length > 0 ? sources : undefined,
        });
      } else {
        const { code, retryable } = describeFailure(failure);
        console.error(`[ai-runs] ${scope.kind} ${runId} failed (${code})`, failure);
        await convex.mutation(api.aiRuns.apiFail, { serverKey, runId, errorCode: code, retryable });
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
 * One model turn inside a run. A reply cut off by `max_tokens` is a failure
 * for anything structured (the JSON would be incomplete); prose callers like
 * chat can accept it.
 */
export async function runModelText(
  run: AiRunContext,
  request: TextRequest,
  { acceptTruncated = false }: { acceptTruncated?: boolean } = {},
): Promise<string> {
  const { text, message } = await anthropic.streamText(
    { model: AI_MODEL, ...request },
    { signal: run.signal, onText: run.text },
  );
  run.recordUsage(message.usage?.input_tokens ?? 0, message.usage?.output_tokens ?? 0);
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
