"use client";

import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";

const TEXT = {
  en: "Clockodo® is a trademark of its respective owner, used here for identification only. Advantis is not affiliated with, sponsored by, or endorsed by Clockodo.",
  de: "Clockodo® ist eine Marke ihres jeweiligen Inhabers und dient hier ausschließlich der Kennzeichnung. Advantis steht in keiner Verbindung zu Clockodo und wird von Clockodo weder gesponsert noch unterstützt.",
} as const;

/** One-time trademark disclaimer for pages that name Clockodo. */
export function TrademarkNotice({ className }: { className?: string }) {
  const locale = useLocale();
  const text = locale === "de" ? TEXT.de : TEXT.en;
  return (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground/70", className)}>{text}</p>
  );
}
