"use client";

import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";

const TEXT = {
  en: "Genesys® and Clockodo® are trademarks of their respective owners, used here for identification only. Advantis is not affiliated with, sponsored by, or endorsed by either company.",
  de: "Genesys® und Clockodo® sind Marken ihrer jeweiligen Inhaber und dienen hier ausschließlich der Kennzeichnung. Advantis steht in keiner Verbindung zu diesen Unternehmen und wird von ihnen weder gesponsert noch unterstützt.",
} as const;

/** One-time trademark disclaimer for the ActivityTrack section. */
export function TrademarkNotice({ className }: { className?: string }) {
  const locale = useLocale();
  const text = locale === "de" ? TEXT.de : TEXT.en;
  return (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground/70", className)}>{text}</p>
  );
}
