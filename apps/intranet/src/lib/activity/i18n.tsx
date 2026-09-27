"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { useLocale, useTranslations } from "next-intl";

import { setLocale } from "@/i18n/locale-action";

import type { Lang } from "./locales/types";

export type { Lang } from "./locales/types";

/**
 * i18n bridge for the ActivityTrack dashboard components, ported from
 * ActivityTrack web. The dashboard was written against a tiny `useI18n()`
 * hook with dotted keys (`t("people.add")`); its strings now live in the
 * intranet's own `ActivityTrack` next-intl namespace, so this hook only keeps
 * that call shape. Language switching delegates to the intranet's
 * `setLocale` server action so the choice stays unified across the app.
 *
 * A missing key renders the key itself, as it always did, rather than
 * next-intl's namespaced fallback.
 */
export function useI18n(): {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
} {
  const locale = useLocale();
  const lang: Lang = locale === "en" ? "en" : "de";
  const router = useRouter();
  const messages = useTranslations("ActivityTrack");

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      messages.has(key) ? messages(key, vars) : key,
    [messages],
  );

  const setLang = useCallback(
    (next: Lang) => {
      void setLocale(next).then(() => router.refresh());
    },
    [router],
  );

  return { lang, setLang, t };
}
