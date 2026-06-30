"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ChevronRight, Clock, Moon, Users } from "lucide-react";

import { DailyTrendChart } from "@/components/activity/charts/DailyTrendChart";
import { StatCard } from "@/components/activity/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  sumDaily,
  weekStartOf,
  weeklyTrend,
  type DailyStat,
} from "@/lib/activity/activity";
import { formatDuration, todayLocalDay } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";

type TimeFrame =
  | "thisWeek"
  | "lastWeek"
  | "last4Weeks"
  | "thisMonth"
  | "custom";

/** Shift a YYYY-MM-DD day by `n` days (UTC arithmetic). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Resolve a time frame to an inclusive [startDay, endDay] range. */
function rangeFor(
  tf: TimeFrame,
  today: string,
  custom: { from: string; to: string }
): { startDay: string; endDay: string } {
  const thisWeekStart = weekStartOf(today);
  switch (tf) {
    case "thisWeek":
      return { startDay: thisWeekStart, endDay: today };
    case "lastWeek":
      return {
        startDay: addDays(thisWeekStart, -7),
        endDay: addDays(thisWeekStart, -1),
      };
    case "last4Weeks":
      return { startDay: addDays(thisWeekStart, -21), endDay: today };
    case "thisMonth":
      return { startDay: `${today.slice(0, 7)}-01`, endDay: today };
    case "custom":
      return { startDay: custom.from, endDay: custom.to };
  }
}

export default function ReportsPage() {
  const { t, lang } = useI18n();
  const today = todayLocalDay();

  const [timeFrame, setTimeFrame] = useState<TimeFrame>("thisWeek");
  const [custom, setCustom] = useState({
    from: addDays(weekStartOf(today), -21),
    to: today,
  });
  const [deviceFilter, setDeviceFilter] = useState<string>("__all__");

  const { startDay, endDay } = useMemo(
    () => rangeFor(timeFrame, today, custom),
    [timeFrame, today, custom]
  );

  const report = useQuery(api.activity.reports.weeklyOverview, {
    startDay,
    endDay,
  });

  // Filtered + sorted device rows with their range totals.
  const rows = useMemo(() => {
    const base = (report ?? []).filter(
      d => deviceFilter === "__all__" || d.deviceId === deviceFilter
    );
    return base
      .map(d => ({ ...d, totals: sumDaily(d.daily as DailyStat[]) }))
      .sort((a, b) => b.totals.activeSeconds - a.totals.activeSeconds);
  }, [report, deviceFilter]);

  // Weekly trend across the currently filtered devices (summed per week).
  const trend = useMemo(() => {
    const flat: DailyStat[] = rows.flatMap(d => d.daily as DailyStat[]);
    return weeklyTrend(flat, startDay, endDay);
  }, [rows, startDay, endDay]);

  const timeFrames: TimeFrame[] = [
    "thisWeek",
    "lastWeek",
    "last4Weeks",
    "thisMonth",
    "custom",
  ];

  // Range totals across the currently filtered devices.
  const totals = useMemo(
    () => ({
      active: rows.reduce((s, d) => s + d.totals.activeSeconds, 0),
      idle: rows.reduce((s, d) => s + d.totals.idleSeconds, 0),
      devices: rows.length,
    }),
    [rows]
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">
          {t("reports.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reports.subtitle")}
        </p>
      </div>

      {/* Controls: time frame, optional custom range, device filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("reports.timeframe")}
          <Select
            value={timeFrame}
            onValueChange={v => setTimeFrame(v as TimeFrame)}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeFrames.map(tf => (
                <SelectItem key={tf} value={tf}>
                  {t(`reports.tf.${tf}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {timeFrame === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("timeline.export.from")}
              <Input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                className="w-full sm:w-40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("timeline.export.to")}
              <Input
                type="date"
                value={custom.to}
                min={custom.from}
                max={today}
                onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                className="w-full sm:w-40"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("reports.filter")}
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("reports.filterAll")}</SelectItem>
              {(report ?? []).map(d => (
                <SelectItem key={d.deviceId} value={d.deviceId}>
                  {d.personName ?? d.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {/* Range totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t("reports.col.active")}
          value={
            report === undefined ? "—" : formatDuration(totals.active, lang)
          }
          tone="ok"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label={t("reports.col.idle")}
          value={report === undefined ? "—" : formatDuration(totals.idle, lang)}
          tone="warn"
          icon={<Moon className="h-4 w-4" />}
        />
        <StatCard
          label={t("reports.filter")}
          value={report === undefined ? "—" : totals.devices}
          tone="fg"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* Weekly trend chart */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">
            {t("reports.trend.heading")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("reports.trend.sub")}
          </p>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
          {report === undefined ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <DailyTrendChart
              data={trend}
              activeLabel={t("common.active")}
              idleLabel={t("common.idle")}
            />
          )}
        </CardContent>
      </Card>

      {/* Per-device totals table */}
      <Card>
        <Table aria-label={t("reports.title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.col.person")}</TableHead>
              <TableHead className="text-right">
                {t("reports.col.active")}
              </TableHead>
              <TableHead className="text-right">
                {t("reports.col.idle")}
              </TableHead>
              <TableHead className="text-right">
                {t("reports.col.total")}
              </TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {report === undefined ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {t("reports.empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(d => {
                const total = d.totals.activeSeconds + d.totals.idleSeconds;
                return (
                  <TableRow key={d.deviceId} className="group">
                    <TableCell>
                      <Link
                        href={`/admin/activity/timeline/${encodeURIComponent(d.deviceId)}`}
                        className="font-medium text-fg transition-colors group-hover:text-signal"
                      >
                        {d.personName ?? d.hostname}
                      </Link>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {d.personName ? d.hostname : d.windowsUser}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ok">
                      {formatDuration(d.totals.activeSeconds, lang)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warn">
                      {formatDuration(d.totals.idleSeconds, lang)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-fg">
                      {formatDuration(total, lang)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/activity/timeline/${encodeURIComponent(d.deviceId)}`}
                        aria-label={d.personName ?? d.hostname}
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-signal" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
