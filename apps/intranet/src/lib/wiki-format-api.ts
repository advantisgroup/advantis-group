"use client";

import { useMemo } from "react";

import { useIntranetApiClient } from "@/lib/api-client";

export interface WikiFormatAssist {
  formattedHtml: string;
}

/**
 * The "format with AI" wiki-entry assist — unlike `useWikiImportApi`'s
 * metadata-only `assist`, this one does rewrite body HTML, so its result is
 * never applied directly: the caller runs it through `diffWikiFormat`
 * (`lib/wiki-format-diff.ts`) and lets the manager review/apply per hunk.
 */
export function useWikiFormatApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      format: (html: string, instructions: string): Promise<WikiFormatAssist> =>
        api.fetchJson<WikiFormatAssist>("/wiki/format-assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ html, instructions }),
        }),
    }),
    [api],
  );
}
