"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/**
 * The built-in guides and the Wallbox Academy are written in German only.
 * Readers using the English interface get one line saying so up front, and
 * how to read it anyway, instead of landing in German text unannounced.
 */
export function GermanOnlyNote() {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  if (locale === "de") return null;
  return (
    <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground print:hidden">
      <Languages className="mt-0.5 size-4 shrink-0" />
      {t("germanOnly")}
    </p>
  );
}
