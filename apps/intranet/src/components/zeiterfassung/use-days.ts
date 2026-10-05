"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { berlinDate, type DaySummary, summarizeDays } from "@advantis/convex/time";
import { useQuery } from "convex/react";

import { useNow } from "@/lib/zeiterfassung";

export type TimeEntry = Doc<"timeEntries">;

export interface DayView extends DaySummary {
  /** Active entries of the day, plus pending/rejected corrections. */
  entries: TimeEntry[];
  autoClosed: boolean;
  pending: number;
  locked: boolean;
}

/**
 * Days of a range with the server's own rules (`@advantis/convex/time`),
 * computed in the browser so a running entry keeps counting up.
 */
export function useDays(userId: Id<"users"> | undefined, from: string, to: string) {
  const data = useQuery(api.time.entries.range, { userId, from, to });
  const now = useNow(30_000);
  const days = useMemo<DayView[] | undefined>(() => {
    if (!data) return undefined;
    const lockedMonths = new Set(data.months.filter((m) => m.locked).map((m) => m.month));
    const summaries = summarizeDays({
      from,
      to,
      segments: data.entries.filter((row) => row.status === "active"),
      schedules: data.schedules,
      holidays: data.holidays,
      absences: data.absences,
      now,
    });
    return summaries.map((day) => {
      const entries = data.entries.filter((row) => berlinDate(row.start) === day.date);
      return {
        ...day,
        entries,
        autoClosed: entries.some((row) => row.autoClosed && row.status === "active"),
        pending: entries.filter((row) => row.status === "pending").length,
        locked: lockedMonths.has(day.date.slice(0, 7)),
      };
    });
  }, [data, from, to, now]);
  return { days, data };
}
