"use client";

import { useCallback } from "react";

import { unwrapApiResult, useIntranetApiClient } from "@/lib/api-client";
import { type EdenApiClient } from "@/lib/eden";
import { type ApiQuery, useApiQuery } from "@/hooks/use-api-query";

import {
  type AdminUserDetail,
  type CallRecord,
  type RosterEntry,
  type WikiArticle,
  type WikiCategory,
} from "@/components/sales-coach-ev/types";

/**
 * Reads for Sales Coach EV via apps/api — no Convex mirror on the client
 * (all Convex access goes through the server-key-gated functions in
 * packages/convex/convex/salesCoachEv/), so every read here hits apps/api
 * fresh on mount, same shape as absences-api.ts's hooks.
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

export async function fetchEodSummary(
  eden: Eden,
  strengths: string[],
  improvements: string[],
): Promise<{ top3strengths: string[]; top3improvements: string[] }> {
  return unwrapApiResult(eden["sales-coach-ev"]["eod-summary"].post({ strengths, improvements }));
}
