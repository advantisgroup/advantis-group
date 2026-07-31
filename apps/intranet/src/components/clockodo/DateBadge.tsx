"use client";

import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Small rounded date chip (month abbreviation over a bold day number),
 * color-coded by absence type — the leading visual element Clockodo itself
 * uses for every absence list row, instead of a generic icon square.
 */
export function DateBadge({ date, className }: { date: string; className?: string }) {
  const locale = useLocale();
  const parsed = new Date(`${date}T00:00:00`);
  const month = parsed
    .toLocaleDateString(locale, { month: "short" })
    .toUpperCase()
    .replace(".", "");

  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-md leading-none",
        className,
      )}
    >
      <span className="flex flex-col items-center gap-0.5">
        <span className="text-[9px] font-semibold tracking-wide opacity-80">{month}</span>
        <span className="text-base font-bold tabular-nums">{parsed.getDate()}</span>
      </span>
    </span>
  );
}
