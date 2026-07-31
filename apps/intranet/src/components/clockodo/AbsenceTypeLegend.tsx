"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import type { AbsenceType } from "@/lib/absences-api";

const DOT_CLASSES: Record<AbsenceType, string> = {
  vacation: "bg-emerald-500",
  sick: "bg-sky-500",
  personal: "bg-violet-500",
  other: "bg-amber-500",
};

const TYPES: AbsenceType[] = ["vacation", "sick", "personal", "other"];

/** Explains the vacation/sick/personal/other color coding used on
 * DateBadge chips and calendar bars — unlike red = "danger", these colors
 * carry no inherent meaning on their own, so anywhere they appear without
 * an inline label (the Planner's bars, in particular) needs this nearby. */
export function AbsenceTypeLegend({ className }: { className?: string }) {
  const t = useTranslations("Absences");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {TYPES.map(type => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[type])} />
          {t(type)}
        </span>
      ))}
    </div>
  );
}
