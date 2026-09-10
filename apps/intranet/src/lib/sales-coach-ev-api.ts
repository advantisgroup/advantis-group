"use client";

import { useCallback } from "react";

import { type IntranetApiClient, unwrapApiResult, useIntranetApiClient } from "@/lib/api-client";
import { type EdenApiClient } from "@/lib/eden";
import { type ApiQuery, useApiQuery } from "@/hooks/use-api-query";

import {
  type AdminUserDetail,
  type CallRecord,
  type Outcome,
  type RosterEntry,
  type WikiArticle,
  type WikiCategory,
} from "@/components/sales-coach-ev/types";

/**
 * Reads for Sales Coach EV via apps/api — no Convex mirror on the client
 * (all Convex access goes through the server-key-gated functions in
 * packages/convex/convex/salesCoachEv/), so every read here hits apps/api
 * fresh on mount, same shape as absences-api.ts's hooks. The AI calls
 * (report, daily summary, document import) start runs and return a runId;
 * their results arrive through `useAiRun`.
 */

export function useSalesCoachWiki(): ApiQuery<WikiArticle[]> & {
  articles: WikiArticle[] | undefined;
} {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden["sales-coach-ev"].wiki.get());
      return data.articles as WikiArticle[];
    }, [api]),
    { source: "sales-coach.wiki" },
  );
  return { ...query, articles: query.data };
}

export function useSalesCoachCalls(
  period: "7" | "30" | "all",
): ApiQuery<CallRecord[]> & { calls: CallRecord[] | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden["sales-coach-ev"].calls.get({ query: { period } }));
      return data.calls as CallRecord[];
    }, [api, period]),
    { source: "sales-coach.calls" },
  );
  return { ...query, calls: query.data };
}

export function useSalesCoachCallRecord(id: string): ApiQuery<CallRecord> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden["sales-coach-ev"].calls({ id }).get());
      return data.call as CallRecord;
    }, [api, id]),
    { source: "sales-coach.call" },
  );
}

export function useSalesCoachSettings(): ApiQuery<string> & { kpiText: string | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden["sales-coach-ev"].settings.get());
      return data.kpiText;
    }, [api]),
    { source: "sales-coach.settings" },
  );
  return { ...query, kpiText: query.data };
}

/** Admin-only: team overview aggregates over a trailing window. */
export function useSalesCoachRoster(
  enabled: boolean,
  days: number,
): ApiQuery<RosterEntry[]> & { roster: RosterEntry[] | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(
        api.eden["sales-coach-ev"]["admin"].roster.get({ query: { days: String(days) } }),
      );
      return data.roster as RosterEntry[];
    }, [api, days]),
    { enabled, source: "sales-coach.roster" },
  );
  return { ...query, roster: query.data };
}

/** Admin-only: one rep's own call history/score breakdown for the Team tab's
 * detail view. `clerkUserId` is the roster entry clicked, `null` while no
 * entry is selected (the dialog is closed). */
export function useSalesCoachAdminUserDetail(
  clerkUserId: string | null,
  days: number,
): ApiQuery<AdminUserDetail> & { detail: AdminUserDetail | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(
        api.eden["sales-coach-ev"]["admin"]
          .user({ clerkUserId: clerkUserId as string })
          .get({ query: { days: String(days) } }),
      );
      return data.detail as AdminUserDetail;
    }, [api, clerkUserId, days]),
    { enabled: clerkUserId !== null, source: "sales-coach.adminUserDetail" },
  );
  return { ...query, detail: query.data };
}

type Eden = EdenApiClient;

export async function saveKpiText(eden: Eden, kpiText: string): Promise<void> {
  await unwrapApiResult(eden["sales-coach-ev"].settings.patch({ kpiText }));
}

export interface WikiArticleInput {
  title: string;
  cat: WikiCategory;
  tags: string;
  body: string;
  url?: string;
  isLink?: boolean;
  storageId?: string;
  fileName?: string;
  fileContentType?: string;
  fileSize?: number;
  removeFile?: boolean;
}

export async function createWikiArticle(eden: Eden, input: WikiArticleInput): Promise<void> {
  await unwrapApiResult(eden["sales-coach-ev"].wiki.post(input));
}

export async function updateWikiArticle(
  eden: Eden,
  id: string,
  input: Partial<WikiArticleInput>,
): Promise<void> {
  await unwrapApiResult(eden["sales-coach-ev"].wiki({ id }).patch(input));
}

export async function deleteWikiArticle(eden: Eden, id: string): Promise<void> {
  await unwrapApiResult(eden["sales-coach-ev"].wiki({ id }).delete());
}

export interface WikiDocumentExtraction {
  title: string;
  cat: WikiCategory;
  tags: string;
  body: string;
  fileName: string;
}

/** Starts reading a wiki source document. A PDF is sent as the raw file
 * (Claude reads it natively); a .docx/.txt/.md is sent as `text` since the
 * client already extracts that locally. `subjectKey` is the article id, or
 * "new" — one import at a time per article. */
export function startWikiExtraction(
  api: IntranetApiClient,
  input: { file: File } | { text: string; fileName: string },
  subjectKey: string,
): Promise<{ runId: string }> {
  const form = new FormData();
  if ("file" in input) form.append("file", input.file);
  else {
    form.append("text", input.text);
    form.append("fileName", input.fileName);
  }
  form.append("subjectKey", subjectKey);
  return api.uploadForm<{ runId: string }>("/sales-coach-ev/wiki/extract", form);
}

export function startCallReport(
  api: IntranetApiClient,
  input: {
    callId: string;
    transcript: string;
    durationSec: number;
    callerSpeakPct: number;
    outcome: Outcome;
  },
): Promise<{ runId: string }> {
  return api.fetchJson<{ runId: string }>("/sales-coach-ev/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface EodSummary {
  top3strengths: string[];
  top3improvements: string[];
}

/** `key` names the set of calls summarised — the same key reopens the same
 * summary instead of paying for a new one. */
export function startEodSummary(
  api: IntranetApiClient,
  input: { strengths: string[]; improvements: string[]; key: string },
): Promise<{ runId: string }> {
  return api.fetchJson<{ runId: string }>("/sales-coach-ev/eod-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
