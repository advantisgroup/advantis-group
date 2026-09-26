"use client";

import { useEffect, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { useIntranetApiClient } from "@/lib/api-client";

/** Mirrors `AiTranscriptPart` in apps/api/src/lib/ai.ts. */
export type AiTranscriptPart =
  | { type: "text"; text: string }
  | { type: "file"; name: string }
  | { type: "toolCall"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolCallId: string; text: string };

/** Mirrors `AiTranscriptTurn` in apps/api/src/lib/ai.ts. */
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

export interface AiTranscript {
  version: 2;
  turns: AiTranscriptTurn[];
  truncated: boolean;
}

/** The first format, kept for runs recorded before turns existed (they're
 * gone 30 days after 2026-09-26). */
interface AiTranscriptV1 {
  version: 1;
  calls: {
    at: number;
    system: string | null;
    messages: { role: "system" | "user" | "assistant"; text: string }[];
    reply: string | null;
    stopReason: string | null;
    tokensIn: number;
    tokensOut: number;
  }[];
  lookups: { at: number; label: string; query: string; results: string[] }[];
  truncated: boolean;
}

/** A v1 transcript laid out as turns: each call's resent messages dropped,
 * lookups slotted in where they happened. Tool calls stay the flat text v1
 * stored them as. */
function fromV1(v1: AiTranscriptV1): AiTranscript {
  const turns: AiTranscriptTurn[] = v1.lookups.map((lookup) => ({ ...lookup, type: "lookup" }));
  let system: string | null = null;
  let seen = 0;
  for (const call of v1.calls) {
    const continues = seen > 0 && call.system === system && call.messages.length > seen;
    if (!continues && call.system && call.system !== system) {
      turns.push({ at: call.at, type: "instructions", text: call.system });
    }
    for (const message of continues ? call.messages.slice(seen) : call.messages) {
      if (message.role === "system") continue;
      turns.push({
        at: call.at,
        type: "message",
        role: message.role,
        parts: [{ type: "text", text: message.text }],
      });
    }
    system = call.system;
    seen = call.messages.length + 1;
    if (call.reply !== null) {
      turns.push({
        at: call.at,
        type: "reply",
        parts: [{ type: "text", text: call.reply }],
        stopReason: call.stopReason,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
      });
    }
  }
  return {
    version: 2,
    turns: turns.sort((a, b) => a.at - b.at),
    truncated: v1.truncated,
  };
}

type Load<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

// Titles never change once a run starts, so one fetch per run per tab is enough.
const titleCache = new Map<string, string | null>();

/**
 * The readable titles of a page of runs. They're sealed in the database like
 * the answers, so apps/api decrypts them — one request for the whole page.
 */
export function useAiRunTitles(runIds: Id<"aiRuns">[]) {
  const apiClient = useIntranetApiClient();
  const [, setVersion] = useState(0);
  const missing = runIds.filter((id) => !titleCache.has(id));
  const key = missing.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(",");
    void apiClient
      .fetchJson<{ titles: Record<string, string> }>("/ai/runs/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(0, 50) }),
      })
      .then(({ titles }) => {
        for (const id of ids.slice(0, 50)) titleCache.set(id, titles[id] ?? null);
        if (!cancelled) setVersion((v) => v + 1);
      })
      .catch(() => {
        // Rows fall back to the feature name; nothing else depends on this.
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, key]);

  return (runId: Id<"aiRuns">) => titleCache.get(runId) ?? null;
}

/** One run's decrypted answer and title. */
export function useAiRunText(runId: Id<"aiRuns"> | null, status: string | undefined) {
  const apiClient = useIntranetApiClient();
  const [state, setState] = useState<Load<{ output: string | null; title: string | null }>>({
    status: "loading",
  });

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setState({ status: "loading" });
    void apiClient
      .fetchJson<{ output: string | null; title: string | null }>(`/ai/runs/${runId}`)
      .then((value) => !cancelled && setState({ status: "ready", value }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
    // Refetched when the run settles, so a finished answer replaces a partial one.
  }, [apiClient, runId, status]);

  return state;
}

/** Exactly what one run sent to the model. Fetched only when asked for. */
export function useAiTranscript(runId: Id<"aiRuns"> | null, enabled = true) {
  const apiClient = useIntranetApiClient();
  const [state, setState] = useState<Load<AiTranscript | null>>({ status: "loading" });

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    setState({ status: "loading" });
    void apiClient
      .fetchJson<{ transcript: AiTranscript | AiTranscriptV1 | null }>(
        `/ai/runs/${runId}/transcript`,
      )
      .then(({ transcript }) => {
        if (cancelled) return;
        const value = transcript?.version === 1 ? fromV1(transcript) : transcript;
        setState({ status: "ready", value });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [apiClient, runId, enabled]);

  return state;
}
