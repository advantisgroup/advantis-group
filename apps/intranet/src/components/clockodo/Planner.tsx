"use client";

import { AbsenceTypeLegend } from "@/components/clockodo/AbsenceTypeLegend";
import { CalendarBar, Segmented } from "@/components/clockodo/parts";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysIso, isoToday, rangesOverlap, workingDays } from "@/lib/absences";
import { type CalendarAbsence } from "@/lib/absences-api";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

/** Who's off when, across the team. */

/** Team calendar (Calendar view) plus a per-employee days/periods rollup
 * (Summary view, folded in from the former standalone "Reports" tab — it
 * added little as its own nav item, being just this same data as a bare
 * two-column table) behind one segmented toggle instead of two tabs. */
export function Planner({ calendar }: { calendar: CalendarAbsence[] | undefined }) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const hasTeamAccess = useHasCapability("view_clockodo_team");
  const [view, setView] = useState<"calendar" | "summary">("calendar");
  const [start, setStart] = useState(isoToday());
  const end = addDaysIso(start, 27);
  const people = useMemo(() => {
    const grouped = new Map<string, CalendarAbsence[]>();
    for (const absence of calendar ?? []) {
      if (!rangesOverlap(absence.startDate, absence.endDate, start, end)) continue;
      const list = grouped.get(absence.userName) ?? [];
      list.push(absence);
      grouped.set(absence.userName, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [calendar, start, end]);
  const days = useMemo(
    () => Array.from({ length: 28 }, (_, index) => addDaysIso(start, index)),
    [start],
  );
  const outByDay = useMemo(
    () =>
      new Map(
        days.map((day) => [
          day,
          (calendar ?? []).filter((a) => a.startDate <= day && day <= a.endDate).length,
        ]),
      ),
    [calendar, days],
  );
  const busiest = Math.max(1, ...outByDay.values());

  const year = String(new Date().getFullYear());
  const summaryRows = useMemo(() => {
    const summary = new Map<string, { department: string | null; days: number; periods: number }>();
    for (const absence of calendar ?? []) {
      if (typeof absence.startDate !== "string" || !absence.startDate.startsWith(year)) continue;
      const existing = summary.get(absence.userName) ?? {
        department: absence.userDepartment,
        days: 0,
        periods: 0,
      };
      existing.days += workingDays(absence.startDate, absence.endDate, absence.halfDay);
      existing.periods += 1;
      summary.set(absence.userName, existing);
    }
    return [...summary.entries()].sort(([, a], [, b]) => b.days - a.days);
  }, [calendar, year]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <div>
          <CardTitle className="text-base">
            {view === "calendar" ? t("absencePlanner") : t("teamReport", { year })}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "calendar"
              ? `${formatIsoDate(start, locale)} - ${formatIsoDate(end, locale)}`
              : t("teamReportHint")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasTeamAccess && (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "calendar", label: t("viewCalendar") },
                { value: "summary", label: t("viewSummary") },
              ]}
            />
          )}
          {view === "calendar" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("previousPeriod")}
                onClick={() => setStart(addDaysIso(start, -28))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("nextPeriod")}
                onClick={() => setStart(addDaysIso(start, 28))}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {view === "calendar" ? (
        <CardContent className="overflow-x-auto p-0">
          <AbsenceTypeLegend className="border-b border-border/70 px-4 py-2.5" />
          <div className="min-w-[58rem]">
            <div className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70">
              <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
                {t("employee")}
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="border-l border-border/70 py-3 text-center text-[11px] text-muted-foreground"
                >
                  {new Date(`${day}T00:00:00`).getDate()}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70 bg-muted/20">
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                {t("coverageRow")}
              </div>
              {days.map((day) => {
                const out = outByDay.get(day) ?? 0;
                const weekday = new Date(`${day}T00:00:00`).getDay();
                return (
                  <div
                    key={day}
                    title={t("coverageCell", { count: out })}
                    className="relative border-l border-border/70 py-2 text-center text-[11px] tabular-nums"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-1 rounded-sm bg-warning"
                      style={{ opacity: out === 0 ? 0 : 0.15 + (out / busiest) * 0.55 }}
                    />
                    <span
                      className={cn(
                        "relative",
                        weekday === 0 || weekday === 6 ? "text-muted-foreground/50" : "",
                        out === 0 && "text-muted-foreground/60",
                      )}
                    >
                      {out || "·"}
                    </span>
                  </div>
                );
              })}
            </div>
            {people.map(([name, absences]) => (
              <div
                key={name}
                className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70 last:border-0"
              >
                <div className="px-4 py-3 text-sm font-medium">{name}</div>
                <div className="relative col-span-28 min-h-11 border-l border-border/70 bg-[linear-gradient(to_right,transparent_calc(100%-1px),hsl(var(--border)/.7)_calc(100%-1px))] bg-[size:3.571428%_100%]">
                  {absences.map((absence) => (
                    <CalendarBar key={absence.id} absence={absence} start={start} end={end} />
                  ))}
                </div>
              </div>
            ))}
            {calendar !== undefined && people.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("nobodyOut")}</p>
            )}
          </div>
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="border-b border-border/70 bg-muted/35 text-left text-xs uppercase tracking-wider text-muted-foreground refreshed:bg-muted/40 refreshed:normal-case refreshed:tracking-normal [&_th]:refreshed:font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t("employee")}</th>
                  <th className="px-5 py-3 font-semibold">{t("department")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("absencePeriods")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("absenceDays")}</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(([name, row]) => (
                  <tr key={name} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-3 font-medium">{name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.department ?? "-"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.periods}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
