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

/**
 * Multi-key sibling of `useDeepLinkId`, for links that carry more than one
 * id together (e.g. a notification pointing at "chapter 5, question xyz").
 * Reading each key with a separate `useDeepLinkId` call would race — the
 * first hook's `router.replace(pathname)` strips the *whole* query string,
 * which can wipe a sibling key before its own effect gets to read it. This
 * reads every requested key in one effect, then strips the URL once.
 */
export function useDeepLinkIds<K extends string>(
  keys: readonly K[]
): Partial<Record<K, string>> {
  const router = useRouter();
  const pathname = usePathname();
  const [ids, setIds] = useState<Partial<Record<K, string>>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const found: Partial<Record<K, string>> = {};
    let any = false;
    for (const key of keys) {
      const value = params.get(key);
      if (value) {
        found[key] = value;
        any = true;
      }
    }
    if (any) {
      setIds(found);
      router.replace(pathname, { scroll: false });
    }
    // One-shot: only ever read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ids;
}
