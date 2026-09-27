"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale } from "next-intl";

import { addDaysIso } from "@/lib/absences";
import { holidaysBetween, type HolidayRegion } from "@/lib/holidays";

export interface DayOff {
  kind: "holiday" | "closure";
  key: string;
  label: string;
}

/**
 * Public holidays (for the office's state, set by admins) and office
 * closures between two ISO dates, keyed by day. `undefined` while loading.
 */
export function useDaysOff(start: string, end: string) {
  const locale = useLocale();
  const data = useQuery(api.org.daysOff.inRange, { start, end });
  return useMemo(() => {
    if (!data) return undefined;
    const region = data.region as HolidayRegion | null;
    const byDay = new Map<string, DayOff[]>();
    const add = (day: string, entry: DayOff) => {
      const list = byDay.get(day) ?? [];
      list.push(entry);
      byDay.set(day, list);
    };
    for (const h of holidaysBetween(start, end, region)) {
      add(h.date, {
        kind: "holiday",
        key: `holiday:${h.date}`,
        label: locale === "de" ? h.name.de : h.name.en,
      });
    }
    for (const c of data.closures) {
      for (
        let day = c.startDate < start ? start : c.startDate;
        day <= c.endDate && day <= end;
        day = addDaysIso(day, 1)
      ) {
        add(day, { kind: "closure", key: `closure:${c._id}`, label: c.title });
      }
    }
    return { byDay, region, closures: data.closures };
  }, [data, start, end, locale]);
}
