"use client";

import { useMemo } from "react";

import { useIntranetApiClient } from "@/lib/api-client";

/**
 * The "format with AI" wiki-entry assist — unlike `useWikiImportApi`'s
 * metadata-only suggestions, this one does rewrite body HTML, so its result
 * is never applied directly: the composer diffs it (`lib/wiki-format-diff.ts`)
 * and lets the manager review/apply per hunk. Starting returns a run; the
 * result arrives through `useAiRun`.
 */
export function useWikiFormatApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      start: (input: { html: string; instructions: string; subjectKey: string; href?: string }) =>
        api.fetchJson<{ runId: string }>("/wiki/format-assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
    }),
    [api],
  );
}
