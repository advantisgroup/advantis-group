"use client";

import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatIsoDate } from "@/lib/format";

export interface Comparison {
  mode: "full" | "sameWorkday";
  workday: number;
  vmCutoff: string | null;
  vjCutoff: string | null;
}

/** What VM/VJ compare against — the same workday of the reference month
 * for a running month, full against full once it is over. */
export function ComparisonFootnote({ comparison }: { comparison: Comparison }) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  if (comparison.mode === "full") return <p>{t("compareFootnoteDone")}</p>;
  return (
    <p>
      {t("compareFootnoteRunning", {
        workday: comparison.workday,
        date: comparison.vmCutoff ? formatIsoDate(comparison.vmCutoff, locale) : "–",
      })}
    </p>
  );
}

/** Workdays without any call report — shown wherever FC1 is. */
export function MissingReportWarning({
  fc,
}: {
  fc: { incomplete: boolean; missingDays: string[] } | undefined;
}) {
  const t = useTranslations("Performance");
  if (!fc?.incomplete || fc.missingDays.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {t("dashboardMissingReport", { days: fc.missingDays.join(", ") })}
    </div>
  );
}
