"use client";

import {
  AbsencePill,
  AbsenceTypeLabel,
  ClockControl,
  type ClockodoSection,
  SectionBoundary,
  TYPE_STYLE,
} from "@/components/clockodo/parts";
import { PersonLink } from "@/components/profile/PersonLink";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { isoToday, mondayOfWeek } from "@/lib/absences";
import { type CalendarAbsence, type MyAbsence } from "@/lib/absences-api";
import { type ClockEntry, useClockEntries } from "@/lib/clockodo-entries-api";
import { cn } from "@/lib/utils";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

/** Your Clockodo day at a glance: the clock, this week and what's coming up. */

export function Dashboard({
  mine,
  calendar,
  pending,
  onNavigate,
}: {
  mine: MyAbsence[] | undefined;
  calendar: CalendarAbsence[] | undefined;
  pending: number | undefined;
  onNavigate: (section: ClockodoSection) => void;
}) {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const [now, setNow] = useState(() => Date.now());
  const weekStart = mondayOfWeek(isoToday());
  const { entries: weekEntries } = useClockEntries(weekStart, isoToday(), !!user.clockodoUserId);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hours = useMemo(() => {
    const entryMs = (entry: ClockEntry) => {
      const start = Date.parse(entry.startTime);
      const end = entry.endTime ? Date.parse(entry.endTime) : now;
      return Math.max(0, end - start);
    };
    const today = (weekEntries ?? []).filter(
      (entry) => entry.startTime.slice(0, 10) === isoToday(),
    );
    const todayMs = today.reduce((sum, entry) => sum + entryMs(entry), 0);
    const weekMs = (weekEntries ?? []).reduce((sum, entry) => sum + entryMs(entry), 0);
    const format = (ms: number) => {
      const totalMinutes = Math.round(ms / 60_000);
      return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")} h`;
    };
    return { today: format(todayMs), week: format(weekMs) };
  }, [weekEntries, now]);

  const upcoming = (mine ?? [])
    .filter(
      (absence) =>
        typeof absence.endDate === "string" &&
        absence.endDate >= isoToday() &&
        absence.status !== "cancelled",
    )
    .sort((a, b) => {
      const aDate = typeof a.startDate === "string" ? a.startDate : "";
      const bDate = typeof b.startDate === "string" ? b.startDate : "";
      return aDate.localeCompare(bDate);
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <SectionBoundary title={t("clockUnavailable")}>
        <ClockControl />
      </SectionBoundary>
      <KpiStrip>
        <Kpi
          featured
          label={t("statsHoursToday")}
          value={user.clockodoUserId ? hours.today : "-"}
        />
        <Kpi label={t("statsHoursWeek")} value={user.clockodoUserId ? hours.week : "-"} />
        <Kpi label={t("statsPending")} value={pending ?? "-"} tone={pending ? "warn" : "neutral"} />
        <Kpi
          label={t("teamOutToday")}
          value={
            calendar?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday()).length ??
            "-"
          }
        />
      </KpiStrip>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("presenceToday")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("presenceTodayHint")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate("planner")}>
              {t("openPlanner")}
            </Button>
          </CardHeader>
          <CardContent>
            <SectionBoundary title={t("presenceUnavailable")}>
              <div className="divide-y divide-border/70">
                {calendar === undefined && (
                  <p className="py-6 text-sm text-muted-foreground">{t("loading")}</p>
                )}
                {calendar?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                  .length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">{t("nobodyOutToday")}</p>
                )}
                {calendar
                  ?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                  .map((absence) => (
                    <div key={absence.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                            TYPE_STYLE[absence.type].className,
                          )}
                        >
                          {absence.userName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <PersonLink
                            userId={absence.userId as Id<"users">}
                            className="block max-w-full text-sm font-medium"
                          >
                            {absence.userName}
                          </PersonLink>
                          <p className="truncate text-xs text-muted-foreground">
                            {absence.userDepartment ?? t("noDepartment")}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium">
                        <AbsenceTypeLabel type={absence.type} />
                      </span>
                    </div>
                  ))}
              </div>
            </SectionBoundary>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("upcomingAbsences")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("requests")}>
              {t("viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <SectionBoundary title={t("upcomingUnavailable")}>
              {upcoming.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">{t("noAbsences")}</p>
              ) : (
                upcoming.map((absence) => <AbsencePill key={absence.id} absence={absence} />)
              )}
            </SectionBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
