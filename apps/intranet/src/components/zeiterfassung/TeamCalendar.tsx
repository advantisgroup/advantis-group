"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import {
  addMonths,
  datesBetween,
  monthEnd,
  monthOf,
  monthStart,
  weekdayOf,
} from "@advantis/convex/time";
import { useQuery } from "convex/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ABSENCE_STYLE, AbsenceTypeLegend } from "@/components/zeiterfassung/parts";
import { cn } from "@/lib/utils";
import { formatDay, formatMonth, useBerlinToday } from "@/lib/zeiterfassung";

/**
 * Who's away when, a month at a time. Others appear with approved vacation
 * only — the server never sends anyone else's sick days or other absences.
 */
export function TeamCalendar() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const [month, setMonth] = useState(monthOf(today));
  const from = monthStart(month);
  const to = monthEnd(month);
  const data = useQuery(api.time.absences.calendar, { from, to });
  const days = useMemo(() => datesBetween(from, to), [from, to]);
  const holidayByDate = useMemo(
    () => new Map((data?.holidays ?? []).map((holiday) => [holiday.date, holiday])),
    [data],
  );
  const people = useMemo(() => {
    const grouped = new Map<
      string,
      { userId: string; name: string; mine: boolean; rows: NonNullable<typeof data>["absences"] }
    >();
    for (const absence of data?.absences ?? []) {
      const entry = grouped.get(absence.userId) ?? {
        userId: absence.userId,
        name: absence.userName,
        mine: absence.mine,
        rows: [],
      };
      entry.rows.push(absence);
      grouped.set(absence.userId, entry);
    }
    return [...grouped.values()].sort(
      (a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, locale),
    );
  }, [data, locale]);
  const columns = `minmax(9rem,12rem) repeat(${days.length}, minmax(1.5rem, 1fr))`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70">
        <div>
          <CardTitle className="text-base">{formatMonth(month, locale)}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendar.hint")}</p>
        </div>
        <div className="flex items-center gap-1">
          {month !== monthOf(today) && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(monthOf(today))}>
              {t("entries.today")}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("entries.previous")}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("entries.next")}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <AbsenceTypeLegend className="border-b border-border/70 px-4 py-2.5" />
        {data === undefined ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="min-w-[56rem]">
            <div
              className="grid border-b border-border/70"
              style={{ gridTemplateColumns: columns }}
            >
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                {t("calendar.person")}
              </div>
              {days.map((day) => {
                const holiday = holidayByDate.get(day);
                const weekend = weekdayOf(day) >= 5;
                return (
                  <div
                    key={day}
                    title={holiday?.name}
                    className={cn(
                      "border-l border-border/70 py-1.5 text-center text-[11px] leading-tight text-muted-foreground",
                      (weekend || holiday) && "bg-muted/60",
                      day === today && "font-semibold text-primary",
                    )}
                  >
                    <span className="block opacity-70">
                      {formatDay(day, locale, { weekday: "narrow" })}
                    </span>
                    {Number(day.slice(8))}
                    {holiday && <span className="sr-only">: {holiday.name}</span>}
                  </div>
                );
              })}
            </div>
            {people.length === 0 ? (
              <EmptyState inline icon={<CalendarDays />} title={t("calendar.empty")} />
            ) : (
              people.map((person) => (
                <div
                  key={person.userId}
                  className="grid border-b border-border/70 last:border-0"
                  style={{ gridTemplateColumns: columns }}
                >
                  <div className="truncate px-4 py-2.5 text-sm font-medium">
                    {person.name}
                    {person.mine && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({t("calendar.you")})
                      </span>
                    )}
                  </div>
                  {days.map((day) => {
                    const absence = person.rows.find(
                      (row) => row.startDate <= day && row.endDate >= day,
                    );
                    const half =
                      absence &&
                      ((day === absence.startDate && absence.halfDayStart) ||
                        (day === absence.endDate && absence.halfDayEnd));
                    return (
                      <div
                        key={day}
                        className={cn(
                          "relative border-l border-border/70",
                          (weekdayOf(day) >= 5 || holidayByDate.has(day)) && "bg-muted/40",
                        )}
                      >
                        {absence && (
                          <span
                            title={t(`absenceType.${absence.type}`)}
                            className={cn(
                              "absolute inset-x-0 top-1/2 h-5 -translate-y-1/2",
                              ABSENCE_STYLE[absence.type].barClassName,
                              absence.status === "pending" && "opacity-40",
                              half && "h-2.5",
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
