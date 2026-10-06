"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDay } from "@/lib/zeiterfassung";

/**
 * Shown on every Zeiterfassung page during the preview (`TIME_MODE=preview`):
 * everyone can look around, nobody clocks yet, Clockodo stays the record
 * until the announced start date.
 */
export function PreviewBanner({
  liveFrom,
  isAdmin,
}: {
  liveFrom: string | null;
  isAdmin: boolean;
}) {
  const t = useTranslations("Zeiterfassung.preview");
  const locale = useLocale();
  const date = liveFrom ? formatDay(liveFrom, locale, { day: "2-digit", month: "2-digit" }) : null;

  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Sparkles className="size-4 text-primary" />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>{date ? t("description", { date }) : t("descriptionNoDate")}</p>
        {isAdmin && <p className="text-xs">{t("adminNote")}</p>}
      </AlertDescription>
    </Alert>
  );
}
