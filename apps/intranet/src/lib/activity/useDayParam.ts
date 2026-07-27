"use client";

import { useCallback, useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keep the timeline's selected day in the URL `?day=` query param so a refresh
 * or shared link lands on the same day, and so every tab (charts + day detail)
 * reads one source of truth. Defaults to `today`; an absent/invalid/future param
 * resolves to `today`. Mirrors `useTabParam` — reads from `window.location`
 * after mount (no `useSearchParams`, so no forced Suspense boundary) and writes
 * back with `router.replace`.
 *
 * `setDay(today)` clears the param entirely so "today" stays a clean URL.
 */
export function useDayParam(today: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [day, setDayState] = useState(today);

  const clamp = useCallback(
    (value: string | null): string => {
      if (!value || !DAY_RE.test(value) || value > today) return today;
      return value;
    },
    [today],
  );

  useEffect(() => {
    // Deferred, SSR-safe URL read: render `today` first, then snap to the
    // `?day=` value after mount. Intentional one-shot setState.
    const fromUrl = new URLSearchParams(window.location.search).get("day");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayState(clamp(fromUrl));
  }, [clamp]);

  const setDay = useCallback(
    (next: string) => {
      const value = clamp(next);
      setDayState(value);
      const params = new URLSearchParams(window.location.search);
      if (value === today) params.delete("day");
      else params.set("day", value);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, clamp, today],
  );

  return [day, setDay] as const;
}
