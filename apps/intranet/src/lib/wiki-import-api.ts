"use client";

import { useMemo } from "react";

import { useIntranetApiClient } from "@/lib/api-client";

export interface WikiImportAssist {
  thema: string;
  tags: string[];
  categoryHint: string;
}

/**
 * The opt-in "improve with AI" pass for an imported wiki entry — suggests
 * thema/tags/category from the already-extracted plain text. Deliberately
 * the only thing this hits the network for: the deterministic docx/pdf/txt
 * extraction itself runs entirely client-side (see `lib/wiki-import.ts`).
 */
export function useWikiImportApi() {
  const api = useIntranetApiClient();

  return useMemo(
    () => ({
      assist: (text: string): Promise<WikiImportAssist> =>
        api.fetchJson<WikiImportAssist>("/wiki/import-assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }),
    }),
    [api],
  );
}
