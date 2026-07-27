"use client";

import { useEffect, useState } from "react";

/**
 * Read-only, non-stripping sibling of `useDeepLinkId`: for a query param
 * that should stay in a *real, persistent* URL (e.g. `/admin/fragen?q=...`
 * highlighting one question) rather than being consumed once and removed.
 * Avoids `useSearchParams()` on purpose — same reasoning as
 * `lib/activity/useQueryParam.ts` and `hooks/use-deep-link-id.ts`: no
 * forced Suspense boundary.
 */
export function useReadQueryParam(key: string): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(new URLSearchParams(window.location.search).get(key));
  }, [key]);

  return value;
}
