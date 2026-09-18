"use client";

import { useLocale, useTranslations } from "next-intl";

import { useNow } from "@/hooks/use-now";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
];

/** "12 seconds ago" / "vor 12 Sekunden", kept fresh while on screen. */
export function useRelativeTime(ms: number | null): string | null {
  const t = useTranslations("Compose");
  const locale = useLocale();
  const now = useNow(ms !== null, 15_000);
  if (ms === null) return null;
  const diff = Math.max(0, now - ms);
  if (diff < 10_000) return t("justNow");
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (diff >= size) return format.format(-Math.floor(diff / size), unit);
  }
  return t("justNow");
}
