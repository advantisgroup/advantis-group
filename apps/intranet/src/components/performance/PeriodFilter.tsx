"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatIsoDate } from "@/lib/format";

import { computePeriodRange, type PeriodGranularity } from "./lib";
import { fmtYm } from "./PerformanceFormat";

/** Day/Week/Month granularity toggle + prev/next navigation for the
 * Interaktionen tab — the only place in Performance that needs finer than
 * whole-month filtering, so this is a standalone control rather than a
 * variant of the dashboard-wide month `Select` (`usePerformanceYm`). */
export function PeriodFilter({
  granularity,
  anchor,
  onGranularityChange,
  onShift,
}: {
  granularity: PeriodGranularity;
  anchor: string;
  onGranularityChange: (g: PeriodGranularity) => void;
  onShift: (direction: 1 | -1) => void;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const { start, end } = computePeriodRange(anchor, granularity);

  const label =
    granularity === "month"
      ? fmtYm(anchor.slice(0, 7), locale)
      : granularity === "day"
        ? formatIsoDate(start, locale)
        : `${formatIsoDate(start, locale)} – ${formatIsoDate(end, locale)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={granularity}
        onValueChange={(v) => onGranularityChange(v as PeriodGranularity)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">{t("periodFilterDay")}</SelectItem>
          <SelectItem value="week">{t("periodFilterWeek")}</SelectItem>
          <SelectItem value="month">{t("periodFilterMonth")}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t("paginationPrev")}
          onClick={() => onShift(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-32 text-center text-sm font-medium tabular-nums">{label}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t("paginationNext")}
          onClick={() => onShift(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
