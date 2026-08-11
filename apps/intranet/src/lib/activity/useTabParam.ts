"use client";

import { useCallback, useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

/**
 * Keep a Tabs component's active tab in the URL `?tab=` query param so a refresh
 * or shared link lands on the same tab. Deliberately avoids `useSearchParams`
 * (which forces a Suspense boundary during static prerender) by reading the
 * param from `window.location` after mount and writing it back with the router.
 *
 * On a deep-link to a non-default tab the first paint shows `defaultTab` and
 * snaps to the URL tab on mount — fine here since the dashboard already renders
 * behind an auth/skeleton gate.
 */
export function useTabParam(defaultTab: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    // Deferred, SSR-safe URL read: render `defaultTab` first, then snap to the
    // `?tab=` value after mount (avoids a hydration mismatch). The setState here
    // is intentional and one-shot.
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl) setTab(fromUrl);
  }, []);

  const update = useCallback(
    (next: string) => {
      setTab(next);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  return [tab, update] as const;
}
