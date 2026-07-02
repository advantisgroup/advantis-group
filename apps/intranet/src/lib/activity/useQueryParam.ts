"use client";

import { useCallback, useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

/**
 * Keep a piece of page state in a URL query param (`?{key}=`) so a refresh,
 * back-navigation or shared link restores it. Generic sibling of `useTabParam`
 * / `useDayParam` with the same SSR-safe pattern: render `defaultValue` first,
 * snap to the URL value after mount (no `useSearchParams`, so no forced
 * Suspense boundary), and write back with `router.replace`. A value failing
 * `isValid` resolves to `defaultValue`; setting the default clears the param
 * so the canonical view keeps a clean URL.
 *
 * `isValid` must be referentially stable (define it at module level).
 */
export function useQueryParam<T extends string>(
  key: string,
  defaultValue: T,
  isValid: (value: string) => value is T
) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValueState] = useState<T>(defaultValue);

  useEffect(() => {
    // Deferred, SSR-safe URL read: render the default first, then snap to the
    // URL value after mount. The setState here is intentional and one-shot.
    const fromUrl = new URLSearchParams(window.location.search).get(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl && isValid(fromUrl)) setValueState(fromUrl);
  }, [key, isValid]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, key, defaultValue]
  );

  return [value, setValue] as const;
}
