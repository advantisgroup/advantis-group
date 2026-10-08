"use client";

import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { CalendarCheck, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AbsenceTypeLabel } from "@/components/zeiterfassung/parts";
import { formatDay } from "@/lib/zeiterfassung";
import { cn } from "@/lib/utils";

export type OverlapRow = FunctionReturnType<typeof api.time.absences.overlaps>[number];

/**
 * Who else is away while someone wants to be: shown in the vacation dialog
 * (so people can pick other dates) and next to each request an admin decides.
 * Same team and team leads come first and are marked.
 */
export function AbsenceOverlaps({
  rows,
  compact = false,
}: {
  rows: OverlapRow[] | undefined;
  compact?: boolean;
}) {
  const t = useTranslations("Zeiterfassung.overlaps");
  const locale = useLocale();
  if (rows === undefined) return null;

  const day = (date: string) => formatDay(date, locale, { day: "2-digit", month: "2-digit" });

  if (rows.length === 0) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-emerald-700 dark:text-emerald-300",
          compact ? "text-xs" : "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm",
        )}
      >
        <CalendarCheck className="size-4 shrink-0" />
        {t("none")}
      </p>
    );
  }

  const conflicts = rows.filter((row) => row.sameTeam).length;

  return (
    <div
      className={cn(
        "space-y-1.5",
        !compact && "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200",
          compact ? "text-xs" : "text-sm",
        )}
      >
        <Users className="size-4 shrink-0" />
        {t("title", { count: rows.length })}
        {conflicts > 0 && (
          <span className="font-normal">· {t("sameTeamCount", { count: conflicts })}</span>
        )}
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={row.absenceId}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-foreground">{row.name}</span>
            {row.lead && (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">
                {t("lead")}
              </span>
            )}
            {row.sameTeam && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {t("sameTeam")}
              </span>
            )}
            <span className="tabular-nums">
              {row.startDate === row.endDate
                ? day(row.startDate)
                : `${day(row.startDate)} – ${day(row.endDate)}`}
            </span>
            {row.type !== "vacation" && <AbsenceTypeLabel type={row.type} />}
            {row.status === "pending" && <span className="italic">{t("pending")}</span>}
            {!compact && row.teams.length > 0 && (
              <span className="truncate">· {row.teams.join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
