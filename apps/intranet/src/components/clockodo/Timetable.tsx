"use client";

import { formatClockTime, NoPersonalClockodoAccount } from "@/components/clockodo/parts";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysIso, isoToday, mondayOfWeek } from "@/lib/absences";
import { elapsedSince } from "@/lib/clockodo-clock";
import { type ClockEntry, deleteClockEntry, useClockEntries } from "@/lib/clockodo-entries-api";
import { useEdenApi } from "@/lib/eden";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Coffee, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Your time entries, week by week. */

/** Real clocked time entries for one calendar week — start/end times,
 * break gaps, and a daily total, matching what Clockodo itself calls
 * "Timetable". Distinct from the absence-type week grid this replaced,
 * which showed vacation/sick days, not actual worked hours. */
export function Timetable() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const locale = useLocale();
  const eden = useEdenApi();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const weekStart = addDaysIso(mondayOfWeek(isoToday()), offset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  const [selected, setSelected] = useState(() =>
    dates.includes(isoToday()) ? isoToday() : dates[0],
  );
  const inThisWeek = dates.includes(selected) ? selected : dates[0];

  const { entries, refresh } = useClockEntries(dates[0], dates.at(-1)!, !!user.clockodoUserId);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const byDay = useMemo(() => {
    const grouped = new Map<string, ClockEntry[]>();
    for (const entry of entries ?? []) {
      const day = entry.startTime.slice(0, 10);
      const list = grouped.get(day) ?? [];
      list.push(entry);
      grouped.set(day, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return grouped;
  }, [entries]);

  function totalMsFor(day: string): number {
    return (byDay.get(day) ?? []).reduce((sum, entry) => {
      const start = Date.parse(entry.startTime);
      const end = entry.endTime ? Date.parse(entry.endTime) : now;
      return sum + Math.max(0, end - start);
    }, 0);
  }

  function formatHours(ms: number): string {
    const totalMinutes = Math.round(ms / 60_000);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")} h`;
  }

  if (!user.clockodoUserId) {
    return <NoPersonalClockodoAccount hint={t("noPersonalAccountTimetableHint")} />;
  }

  const dayEntries = byDay.get(inThisWeek) ?? [];

  async function remove(entry: ClockEntry) {
    try {
      await deleteClockEntry(eden, entry.id, inThisWeek);
      refresh();
    } catch {
      toast.error(t("entryDeleteFailed"));
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <div>
          <CardTitle className="text-base">{t("yourTimetable")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIsoDate(dates[0], locale)} - {formatIsoDate(dates.at(-1)!, locale)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previousWeek")}
            onClick={() => setOffset((value) => value - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("nextWeek")}
            onClick={() => setOffset((value) => value + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {/* No min-width here (unlike the multi-week Planner grid below, which
            genuinely needs it): 7 columns already fit a phone screen if left
            to shrink naturally, so forcing one made a simple day picker
            scroll for no reason. `overflow-x-auto` above still catches the
            rare viewport too narrow for even that. */}
        <div className="grid grid-cols-7 border-b border-border/70">
          {dates.map((date) => {
            const active = date === inThisWeek;
            const isToday = date === isoToday();
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={cn(
                  "border-r border-border/70 px-2 py-3 text-center transition-colors last:border-r-0 hover:bg-accent",
                  active && "bg-accent",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
                    weekday: "short",
                    timeZone: "UTC",
                  })}
                </p>
                <p className={cn("mt-1 text-sm font-semibold", isToday && "text-primary")}>
                  {new Date(`${date}T00:00:00Z`).getUTCDate()}
                </p>
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {entries === undefined ? "···" : formatHours(totalMsFor(date))}
                </p>
              </button>
            );
          })}
        </div>
        <div className="p-2">
          {entries === undefined && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">{t("loading")}</p>
          )}
          {entries !== undefined && dayEntries.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t("noTimeEntries")}
            </p>
          )}
          {dayEntries.map((entry, index) => {
            const previous = dayEntries[index - 1];
            const breakLabel =
              previous?.endTime && entry.startTime
                ? elapsedSince(previous.endTime, Date.parse(entry.startTime))
                : null;
            const duration = elapsedSince(
              entry.startTime,
              entry.endTime ? Date.parse(entry.endTime) : now,
            );
            return (
              <div key={entry.id}>
                {breakLabel && (
                  <div className="my-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,hsl(var(--muted))_6px,hsl(var(--muted))_12px)] px-3 py-2 text-xs text-muted-foreground">
                    <Coffee className="size-3.5" />
                    {t("breakDuration", { duration: breakLabel })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 border-l-2 border-l-primary/60 bg-card px-3 py-2.5 shadow-sm refreshed:shadow-none">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatClockTime(entry.startTime, locale)} –{" "}
                      {entry.endTime
                        ? formatClockTime(entry.endTime, locale)
                        : t("entryInProgress")}
                    </p>
                    {(entry.customerName || entry.serviceName) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[entry.customerName, entry.serviceName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">{duration}</span>
                    {entry.endTime && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteEntry")}
                        onClick={() => void remove(entry)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {dayEntries.length > 0 && (
            <div className="flex items-center justify-between px-3 pt-3 text-sm font-semibold">
              <span>{t("dailyTotal")}</span>
              <span className="tabular-nums">{formatHours(totalMsFor(inThisWeek))}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
