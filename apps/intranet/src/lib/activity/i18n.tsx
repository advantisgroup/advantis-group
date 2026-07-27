"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { useLocale } from "next-intl";

import { setLocale } from "@/i18n/locale-action";

import { de } from "./locales/de";
import { en } from "./locales/en";

import type { Dict, Lang } from "./locales/types";

export type { Lang } from "./locales/types";

/**
 * i18n bridge for the ActivityTrack dashboard components, ported from
 * ActivityTrack web. The dashboard was written against a tiny flat-dictionary
 * `useI18n()` hook; rather than rewrite every `t("…")` call into the intranet's
 * next-intl namespaces, we keep ActivityTrack's dictionaries verbatim and back
 * the hook with next-intl's active locale. Language switching delegates to the
 * intranet's `setLocale` server action so the choice stays unified across the
 * whole app.
 *
 * Keys are flat strings; a missing key falls back to English then the key
 * itself, so a partial translation never renders blank.
 */
const DICTS: Record<Lang, Dict> = { de, en };

export function useI18n(): {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
} {
  const locale = useLocale();
  const lang: Lang = locale === "en" ? "en" : "de";
  const router = useRouter();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in vars ? String(vars[name]) : `{${name}}`,
      );
    },
    [lang],
  );

  const setLang = useCallback(
    (next: Lang) => {
      void setLocale(next).then(() => router.refresh());
    },
    [router],
  );

  return { lang, setLang, t };
}
