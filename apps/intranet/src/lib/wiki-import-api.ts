"use client";

import { useMemo } from "react";

import { useIntranetApiClient } from "@/lib/api-client";

export interface WikiImportAssist {
  thema: string;
  tags: string[];
  categoryHint: string;
}

/**
 * The opt-in "suggest topic & tags" pass for a wiki entry — reads the plain
 * text and suggests thema/tags/category, never body changes. Starting
 * returns a run; the suggestions arrive through `useAiRun`.
 */
export function useWikiImportApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      start: (input: { text: string; subjectKey: string; href?: string }) =>
        api.fetchJson<{ runId: string }>("/wiki/import-assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
    }),
    [api],
  );
}
