"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { useNow } from "@/hooks/use-now";
import { useIntranetApiClient } from "@/lib/api-client";

export type AiRunMeta = NonNullable<FunctionReturnType<typeof api.aiRuns.get>>;
export type AiRunKind = AiRunMeta["kind"];
export type AiRunPhase = AiRunMeta["phase"];
export type AiRunState = "working" | "done" | "error" | "interrupted" | "cancelled";

/** Mirrors AI_RUN_STALE_MS in packages/convex/convex/lib/aiRuns.ts. */
const STALE_MS = 20_000;
/** How far off this device's clock may be before an old heartbeat reads as
 *  dead on its own — see `aiRunState`. */
const CLOCK_SLACK_MS = 5 * 60_000;
const TEXT_RETRY_MAX_MS = 15_000;

const heartbeatSeenAt = new Map<string, { beat: number; at: number }>();

export function aiRunState(run: AiRunMeta, now: number): AiRunState {
  if (run.status === "running") {
    // Judged by when this device last saw the heartbeat move, not by holding
    // the server's timestamp against this device's clock — a laptop running a
    // minute fast would otherwise call every live run interrupted. A heartbeat
    // that's far in the past by any clock still counts straight away.
    let seen = heartbeatSeenAt.get(run._id);
    if (!seen || seen.beat !== run.heartbeatAt) {
      seen = { beat: run.heartbeatAt, at: Date.now() };
      heartbeatSeenAt.set(run._id, seen);
    }
    const stale = now - seen.at > STALE_MS || now - run.heartbeatAt > STALE_MS + CLOCK_SLACK_MS;
    return stale ? "interrupted" : "working";
  }
  if (run.status === "error" && run.errorCode === "interrupted") return "interrupted";
  return run.status;
}

export interface AiRunView<T> {
  run: AiRunMeta | null;
  loading: boolean;
  state: AiRunState | null;
  /** The latest decrypted output — partial while working. */
  text: string | null;
  /** What the run has done along the way, for kinds that report it (the
   * wiki chat's searches) — shaped by whoever wrote it. */
  steps: unknown[] | null;
  /** The parsed final output, once the run is done. */
  result: T | null;
  /** Fetching the text keeps failing (it's still retrying in the background). */
  textFailed: boolean;
  retryText: () => void;
  elapsedSec: number;
  cancel: () => void;
  markSeen: () => void;
}

type RunSource =
  | { runId: Id<"aiRuns"> | null | undefined }
  | { subjectKey: string | null | undefined };

interface Snapshot {
  runId: string;
  chars: number;
  stepsRev: number;
  final: boolean;
  text: string | null;
  steps: unknown[] | null;
}

/**
 * Follows one run: status live from Convex, text from apps/api each time the
 * status moves. Pass a `runId` for a run you just started, or a `subjectKey`
 * to pick up whatever is newest for that thing — which is how a page finds
 * its answer again after a refresh.
 */
export function useAiRun<T = string>(
  source: RunSource,
  parse?: (output: string) => T,
): AiRunView<T> {
  const runId = "runId" in source ? source.runId : null;
  const subjectKey = "subjectKey" in source ? source.subjectKey : null;
  const byId = useQuery(api.aiRuns.get, runId ? { runId } : "skip");
  const bySubject = useQuery(api.aiRuns.latest, subjectKey ? { subjectKey } : "skip");
  const loading = (!!runId && byId === undefined) || (!!subjectKey && bySubject === undefined);
  const run = (runId ? byId : subjectKey ? bySubject : null) ?? null;

  const apiClient = useIntranetApiClient();
  const cancelRun = useMutation(api.aiRuns.cancel);
  const markRunSeen = useMutation(api.aiRuns.markSeen);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [textFailed, setTextFailed] = useState(false);
  const failures = useRef(0);

  const id = run?._id;
  const chars = run?.outputChars ?? 0;
  const stepsRev = run?.stepsRev ?? 0;
  const status = run?.status;

  useEffect(() => {
    failures.current = 0;
    setTextFailed(false);
  }, [id]);

  useEffect(() => {
    if (!id || (chars === 0 && stepsRev === 0 && status !== "done")) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Not cancelled when a newer tick comes in: snapshots arrive every few
    // hundred ms, and dropping every in-flight fetch would starve the view
    // on a slow connection. Instead a response only wins if it's newer.
    void apiClient
      .fetchJson<{
        status: string;
        outputChars: number;
        output: string | null;
        stepsRev: number;
        steps: unknown[] | null;
      }>(`/ai/runs/${id}`)
      .then(
        (res) => {
          failures.current = 0;
          setTextFailed(false);
          const final = res.status === "done";
          setSnapshot((prev) =>
            prev?.runId === id &&
            (prev.final ||
              (!final && (prev.chars > res.outputChars || prev.stepsRev > res.stepsRev)))
              ? prev
              : {
                  runId: id,
                  chars: res.outputChars,
                  stepsRev: res.stepsRev,
                  final,
                  text: res.output,
                  steps: res.steps,
                },
          );
        },
        () => {
          // A finished run never ticks again, so nothing else would ever ask
          // for the text a second time — retry here, backing off.
          if (!active) return;
          failures.current += 1;
          if (failures.current >= 3) setTextFailed(true);
          retry = setTimeout(
            () => setAttempt((n) => n + 1),
            Math.min(TEXT_RETRY_MAX_MS, 1000 * 2 ** failures.current),
          );
        },
      );
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [apiClient, id, chars, stepsRev, status, attempt]);

  const current = snapshot && snapshot.runId === id ? snapshot : null;
  const text = current?.text ?? null;
  const steps = current?.steps ?? null;
  const final = current?.final ?? false;
  const result = useMemo(() => {
    if (!final || text === null) return null;
    if (!parse) return text as T;
    try {
      return parse(text);
    } catch {
      return null;
    }
    // `parse` is usually an inline arrow; the text is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, text]);

  const now = useNow(status === "running");
  const state = run ? aiRunState(run, now) : null;
  const elapsedSec = run
    ? Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000))
    : 0;

  return {
    run,
    loading,
    state,
    text,
    steps,
    result,
    textFailed,
    retryText: () => {
      failures.current = 0;
      setTextFailed(false);
      setAttempt((n) => n + 1);
    },
    elapsedSec,
    cancel: () => {
      if (id) void cancelRun({ runId: id });
    },
    markSeen: () => {
      if (id && state !== "working" && !run?.seenAt) void markRunSeen({ runId: id });
    },
  };
}

export function parseJson<T>(output: string): T {
  return JSON.parse(output) as T;
}
