"use client";

import { type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { addDays, berlinDate, mondayOf } from "@advantis/convex/time";
import { useQuery } from "convex/react";
import { ArrowRight, CalendarClock, Coffee, Info, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { TimeClockHeaderControl } from "@/components/layout/TimeClockHeaderControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ClockCard } from "@/components/zeiterfassung/ClockCard";
import {
  AbsenceStatusBadge,
  AbsenceTypeLabel,
  Chip,
  SectionBoundary,
  WarningChips,
} from "@/components/zeiterfassung/parts";
import { type DayView, useDays } from "@/components/zeiterfassung/use-days";
import { cn } from "@/lib/utils";
import {
  formatClock,
  formatDay,
  formatDays,
  formatMinutes,
  useBerlinToday,
  useNow,
} from "@/lib/zeiterfassung";

/** Your day at a glance: the clock, today, this week, hours account, vacation. */
export function Overview() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const monday = mondayOf(today);
  const { days } = useDays(undefined, monday, addDays(monday, 6));
  const summary = useQuery(api.time.overview.summary, { today });
  const todayView = days?.find((day) => day.date === today);
  const week = days?.reduce(
    (sum, day) => ({
      worked: sum.worked + day.workedMinutes,
      target: sum.target + day.targetMinutes,
    }),
    { worked: 0, target: 0 },
  );
  const weekWarnings = (days ?? []).filter((day) => day.date <= today && day.warnings.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {formatDay(today, locale, { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <TimeClockHeaderControl className="hidden lg:flex" />
      </div>
      <SectionBoundary title={t("overview.clockUnavailable")}>
        <ClockCard />
      </SectionBoundary>
      <KpiStrip>
        <Kpi
          featured
          label={t("overview.today")}
          value={todayView ? formatMinutes(todayView.workedMinutes) : "–"}
          hint={
            todayView
              ? t("overview.ofTarget", { target: formatMinutes(todayView.targetMinutes) })
              : undefined
          }
        />
        <Kpi
          label={t("overview.week")}
          value={week ? formatMinutes(week.worked) : "–"}
          hint={week ? t("overview.ofTarget", { target: formatMinutes(week.target) }) : undefined}
        />
        <Kpi
          label={t("overview.balance")}
          value={summary ? formatMinutes(summary.balance.minutes, true) : "–"}
          tone={summary && summary.balance.minutes < 0 ? "warn" : "neutral"}
          hint={t("overview.balanceHint")}
        />
        <Kpi
          label={t("overview.vacation")}
          value={summary ? formatDays(summary.vacation.remaining, locale) : "–"}
          hint={
            summary
              ? summary.vacation.pending > 0
                ? t("overview.vacationPending", {
                    days: formatDays(summary.vacation.pending, locale),
                  })
                : t("overview.vacationOf", {
                    days: formatDays(
                      summary.vacation.entitlement + summary.vacation.carriedOver,
                      locale,
                    ),
                  })
              : undefined
          }
        />
      </KpiStrip>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="space-y-5">
          <TodayCard day={todayView} />
          <WeekCard days={days} today={today} />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("overview.notices")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              {summary === undefined && <SkeletonRows className="py-1" />}
              {summary && (
                <>
                  {summary.autoClosed.length > 0 && (
                    <Notice icon={<TriangleAlert className="size-4 text-warn" />}>
                      {t("overview.autoClosedNotice", { count: summary.autoClosed.length })}{" "}
                      <Link
                        href={`/zeiterfassung/arbeitszeiten?date=${berlinDate(summary.autoClosed[0].start)}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {t("overview.check")}
                      </Link>
                    </Notice>
                  )}
                  {weekWarnings.length > 0 && (
                    <Notice icon={<Info className="size-4 text-muted-foreground" />}>
                      {t("overview.warningsNotice", { count: weekWarnings.length })}
                    </Notice>
                  )}
                  {summary.pendingCorrections + summary.pendingAbsences > 0 && (
                    <Notice icon={<CalendarClock className="size-4 text-muted-foreground" />}>
                      {t("overview.pendingNotice", {
                        count: summary.pendingCorrections + summary.pendingAbsences,
                      })}
                    </Notice>
                  )}
                  {summary.vacation.carriedOverLeft > 0 && (
                    <Notice icon={<Info className="size-4 text-muted-foreground" />}>
                      {t("overview.carryOverNotice", {
                        days: formatDays(summary.vacation.carriedOverLeft, locale),
                        date: formatDay(summary.vacation.carriedOverExpires, locale, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }),
                      })}
                    </Notice>
                  )}
                  {summary.autoClosed.length === 0 &&
                    weekWarnings.length === 0 &&
                    summary.pendingCorrections + summary.pendingAbsences === 0 &&
                    summary.vacation.carriedOverLeft === 0 && (
                      <p className="py-2 text-muted-foreground">{t("overview.allClear")}</p>
                    )}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{t("overview.upcoming")}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/zeiterfassung/abwesenheiten">
                  {t("overview.allAbsences")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {summary === undefined ? (
                <SkeletonRows className="py-1" />
              ) : summary.upcoming.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("overview.noUpcoming")}</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {summary.upcoming.map((absence) => (
                    <li
                      key={absence._id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <AbsenceTypeLabel type={absence.type} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDay(absence.startDate, locale)}
                          {absence.endDate !== absence.startDate &&
                            ` – ${formatDay(absence.endDate, locale)}`}
                        </p>
                      </div>
                      <AbsenceStatusBadge status={absence.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-sm leading-snug">{children}</p>
    </div>
  );
}

function TodayCard({ day }: { day: DayView | undefined }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const now = useNow(30_000);
  const segments = (day?.entries ?? [])
    .filter((row) => row.status === "active")
    .sort((a, b) => a.start - b.start);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("overview.todaySegments")}</CardTitle>
          {day?.holiday && <p className="mt-1 text-sm text-muted-foreground">{day.holiday.name}</p>}
        </div>
        {day && <WarningChips warnings={day.warnings} />}
      </CardHeader>
      <CardContent className="pt-0">
        {day === undefined ? (
          <SkeletonRows className="py-1" />
        ) : segments.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("overview.noSegments")}</p>
        ) : (
          <ul className="space-y-1.5">
            {segments.map((row) => {
              const end = row.end ?? now;
              const minutes = Math.round((end - row.start) / 60_000);
              return (
                <li
                  key={row._id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2",
                    row.kind === "work"
                      ? "border-l-2 border-l-primary/60 bg-card"
                      : "border-dashed bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm tabular-nums">
                    {row.kind === "break" && <Coffee className="size-3.5" />}
                    {formatClock(row.start, locale)} –{" "}
                    {row.end ? formatClock(row.end, locale) : t("entries.running")}
                    {row.autoClosed && <Chip tone="warn">{t("entries.autoClosed")}</Chip>}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatMinutes(minutes)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {day && segments.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-sm">
            <span className="text-muted-foreground">
              {t("overview.breaks", { minutes: day.breakMinutes })}
            </span>
            <span className="font-semibold tabular-nums">
              {formatMinutes(day.workedMinutes)} / {formatMinutes(day.targetMinutes)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeekCard({ days, today }: { days: DayView[] | undefined; today: string }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const max = Math.max(60, ...(days ?? []).map((d) => Math.max(d.workedMinutes, d.targetMinutes)));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("overview.thisWeek")}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/zeiterfassung/arbeitszeiten">
            {t("overview.allEntries")}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {days === undefined ? (
          <SkeletonRows className="py-1" />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const future = day.date > today;
              return (
                <div key={day.date} className="flex flex-col items-center gap-1.5">
                  <div className="relative flex h-28 w-full items-end justify-center rounded-md bg-muted/40">
                    {day.targetMinutes > 0 && (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 border-t border-dashed border-muted-foreground/50"
                        style={{ bottom: `${(day.targetMinutes / max) * 100}%` }}
                      />
                    )}
                    <span
                      className={cn(
                        "w-3/5 rounded-t-sm",
                        day.warnings.length > 0 ? "bg-warn/70" : "bg-primary/70",
                        future && "opacity-30",
                      )}
                      style={{ height: `${(day.workedMinutes / max) * 100}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      day.date === today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {formatDay(day.date, locale, { weekday: "short" })}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {day.workedMinutes > 0 ? formatMinutes(day.workedMinutes) : "·"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
