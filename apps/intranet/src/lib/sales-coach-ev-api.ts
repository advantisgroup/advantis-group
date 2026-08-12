"use client";

import { useEffect, useState } from "react";

import { useEdenApi } from "@/lib/eden";

import {
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

export function useSalesCoachWiki(): { articles: WikiArticle[] | undefined; refresh: () => void } {
  const eden = useEdenApi();
  const [articles, setArticles] = useState<WikiArticle[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await eden["sales-coach-ev"].wiki.get();
      if (!cancelled) setArticles((data?.articles as WikiArticle[] | undefined) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, reloadKey]);

  return { articles, refresh: () => setReloadKey((k) => k + 1) };
}

export function useSalesCoachCalls(period: "7" | "30" | "all"): {
  calls: CallRecord[] | undefined;
  refresh: () => void;
} {
  const eden = useEdenApi();
  const [calls, setCalls] = useState<CallRecord[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCalls(undefined);
    void (async () => {
      const { data } = await eden["sales-coach-ev"].calls.get({ query: { period } });
      if (!cancelled) setCalls((data?.calls as CallRecord[] | undefined) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, period, reloadKey]);

  return { calls, refresh: () => setReloadKey((k) => k + 1) };
}

export function useSalesCoachSettings(): {
  kpiText: string | undefined;
  refresh: () => void;
} {
  const eden = useEdenApi();
  const [kpiText, setKpiText] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await eden["sales-coach-ev"].settings.get();
      if (!cancelled) setKpiText(data?.kpiText ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, reloadKey]);

  return { kpiText, refresh: () => setReloadKey((k) => k + 1) };
}

/** Admin-only: team overview aggregates over a trailing window. */
export function useSalesCoachRoster(
  enabled: boolean,
  days: number,
): { roster: RosterEntry[] | undefined; refresh: () => void } {
  const eden = useEdenApi();
  const [roster, setRoster] = useState<RosterEntry[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { data } = await eden["sales-coach-ev"]["admin"].roster.get({ query: { days: String(days) } });
      if (!cancelled) setRoster((data?.roster as RosterEntry[] | undefined) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, enabled, days, reloadKey]);

  return { roster, refresh: () => setReloadKey((k) => k + 1) };
}

type Eden = ReturnType<typeof useEdenApi>;

export async function saveKpiText(eden: Eden, kpiText: string): Promise<void> {
  const { error } = await eden["sales-coach-ev"].settings.patch({ kpiText });
  if (error) throw error;
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
  const { error } = await eden["sales-coach-ev"].wiki.post(input);
  if (error) throw error;
}

export async function updateWikiArticle(
  eden: Eden,
  id: string,
  input: Partial<WikiArticleInput>,
): Promise<void> {
  const { error } = await eden["sales-coach-ev"].wiki({ id }).patch(input);
  if (error) throw error;
}

export async function deleteWikiArticle(eden: Eden, id: string): Promise<void> {
  const { error } = await eden["sales-coach-ev"].wiki({ id }).delete();
  if (error) throw error;
}

export async function fetchEodSummary(
  eden: Eden,
  strengths: string[],
  improvements: string[],
): Promise<{ top3strengths: string[]; top3improvements: string[] }> {
  const { data, error } = await eden["sales-coach-ev"]["eod-summary"].post({ strengths, improvements });
  if (error) throw error;
  return data;
}
