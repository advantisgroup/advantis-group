"use client";

import { useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

/**
 * Deep-link the id of a single item to highlight or open a detail dialog
 * for, carried in `?{key}=` (e.g. from a notification's `link`). Reads it
 * once after mount and strips it from the URL — same SSR-safe,
 * no-`useSearchParams` shape as `lib/activity/useQueryParam.ts`, but
 * one-shot rather than round-tripped: once consumed, the id lives in the
 * caller's own state (dialog-open flag, highlighted row), not the URL.
 */
export function useDeepLinkId(key: string): string | null {
  const router = useRouter();
  const pathname = usePathname();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(key);
    if (fromUrl) {
      setId(fromUrl);
      router.replace(pathname, { scroll: false });
    }
    // One-shot: only ever read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return id;
}
