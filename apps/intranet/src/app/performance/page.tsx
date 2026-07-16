"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Award,
  Download,
  LogOut,
  type LucideIcon,
  Phone,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
import { Link } from "@/components/Link";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import {
  DeltaBadge,
  fmtDayShort,
  fmtNum,
  fmtPct,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearPerformanceToken,
  downloadPerformanceFile,
  getPerformanceToken,
} from "@/lib/performanceAuth";

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

const LIST_KEYS = [
  "analysis30",
  "leads14",
  "opp_overdue",
  "opp30",
  "opps14",
] as const;

function MetricTile({
  icon: Icon,
  label,
  value,
  delta,
  invert,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: number;
  invert?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <DeltaBadge value={delta} invert={invert} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PerformancePage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const [token] = useState<string | null>(() => getPerformanceToken());
  const [ym, setYm] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );
  const logout = useMutation(api.performanceAuth.logout);
  const touchSession = useMutation(api.performanceAuth.touchSession);

  useEffect(() => {
    if (token) void touchSession({ token });
  }, [token, touchSession]);

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  const isAdmin = session?.valid && session.role === "admin";

  // Employee logins have their own detail page — this page is the admin
  // team view.
  useEffect(() => {
    if (!session?.valid || session.role === "admin") return;
    if (session.employeeId) {
      router.replace(`/performance/mitarbeiter/${session.employeeId}`);
    }
  }, [session, router]);

  const data = useQuery(
    api.performanceQueries.teamDashboard,
    token && isAdmin ? { token, ym } : "skip"
  );

  const chartData = useMemo(
    () =>
      (data?.days ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        calls: d.values.callsToday ?? 0,
      })),
    [data?.days, locale]
  );

  function exit() {
    if (token) void logout({ token });
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (!session?.valid) return null;

  if (session.role !== "admin") {
    if (session.employeeId) return null; // redirecting
    return (
      <div className="min-h-screen bg-muted/20">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <PerformanceWordmark />
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={exit}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("exit")}
          </Button>
        </header>
        <main className="mx-auto max-w-3xl p-4 md:p-6">
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle>{t("notLinkedTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">{session.name}</span>
        <Link href="/performance/benutzer">
          <Button variant="ghost" size="sm">
            <Users className="mr-2 h-4 w-4" />
            {t("usersLink")}
          </Button>
        </Link>
        <Link href="/performance/upload">
          <Button variant="ghost" size="sm">
            <Upload className="mr-2 h-4 w-4" />
            {t("uploadLink")}
          </Button>
        </Link>
        <Link href="/performance/passwort">
          <Button variant="ghost" size="sm">
            {t("passwordLink")}
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={ym ?? data?.ym ?? ""}
            onValueChange={v => setYm(v)}
            disabled={!data || data.months.length === 0}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("dashboardMonthLabel")} />
            </SelectTrigger>
            <SelectContent>
              {[...(data?.months ?? [])].reverse().map(m => (
                <SelectItem key={m} value={m}>
                  {fmtYm(m, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <Badge variant={data.monthDone ? "muted" : "success"}>
              {data.monthDone
                ? t("dashboardMonthClosed")
                : t("dashboardMonthOpen")}
            </Badge>
          )}
          {data && data.snaps.length > 0 && token && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadPerformanceFile(
                  `/performance/export?ym=${data.ym}`,
                  token,
                  `performance-${data.ym}.xlsx`
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("exportButton")}
            </Button>
          )}
        </div>

        {!data ? null : data.snaps.length === 0 ? (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle>{t("dashboardEmptyTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center text-sm text-muted-foreground">
              {t("dashboardEmptyBody")}
              <Link href="/performance/upload">
                <Button size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  {t("uploadLink")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <MetricTile
                icon={Users}
                label={t("dashboardMetricLeads")}
                value={fmtNum(data.total.leadsCreated)}
                delta={data.dVm.leadsCreated}
              />
              <MetricTile
                icon={Target}
                label={t("dashboardMetricWorkable")}
                value={fmtNum(data.total.workableCreated)}
                delta={data.dVm.workableCreated}
              />
              <MetricTile
                icon={TrendingUp}
                label={t("dashboardMetricHitrate")}
                value={fmtPct(data.total.hitrate)}
                delta={data.dVm.hitrate}
              />
              <MetricTile
                icon={Award}
                label={t("dashboardMetricWon")}
                value={fmtNum(data.total.wonMonth)}
                delta={data.dVm.wonMonth}
              />
              <MetricTile
                icon={TrendingDown}
                label={t("dashboardMetricForecast")}
                value={fmtNum(data.total.fc1)}
              />
              <MetricTile
                icon={Phone}
                label={t("dashboardMetricCalls")}
                value={fmtNum(data.total.callsToday)}
                delta={data.dVm.callsToday}
              />
            </div>

            {data.hasCalls && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("dashboardCallActivity")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                    >
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke={CHART.axis}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke={CHART.axis}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={32}
                      />
                      <Tooltip {...tooltipStyle} />
                      <Bar
                        dataKey="calls"
                        name={t("dashboardMetricCalls")}
                        fill={CHART.accent}
                        maxBarSize={24}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("dashboardEmployees")}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead className="text-right">
                        {t("colLeads")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colWorkable")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colHitrate")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colWon")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colForecast")}
                      </TableHead>
                      <TableHead>{t("colBadges")}</TableHead>
                      <TableHead>{t("colMark")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.snaps.map(s => {
                      const badges = data.badgeCounts[s.employeeId] ?? {};
                      const mark = data.marks[s.employeeId];
                      return (
                        <TableRow
                          key={s.employeeId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            router.push(
                              `/performance/mitarbeiter/${s.employeeId}`
                            )
                          }
                        >
                          <TableCell className="font-medium">
                            {s.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(s.leadsCreated)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(s.workableCreated)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtPct(s.hitrate)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(s.wonMonth)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(s.fc1)}
                          </TableCell>
                          <TableCell>
                            {Object.entries(badges).some(([, n]) => n > 0) ? (
                              <span className="text-sm">
                                {Object.entries(badges)
                                  .filter(([, n]) => n > 0)
                                  .map(
                                    ([key, n]) =>
                                      `${BADGE_ICONS[key] ?? ""}${n > 1 ? `×${n}` : ""}`
                                  )
                                  .join(" ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {mark && (
                              <Badge
                                variant={
                                  mark.level === "high" ? "success" : "warning"
                                }
                              >
                                {mark.level === "high"
                                  ? t("markHigh")
                                  : t("markLow")}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {data.unqualified.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("dashboardUnqualified")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {data.unqualified.map(u => (
                    <Badge key={u.reason} variant="muted">
                      {u.reason} · {u.count}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("dashboardWatchlists")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LIST_KEYS.map(key => (
                  <Link key={key} href={`/performance/liste/${key}`}>
                    <div className="rounded-md border border-border/70 p-3 text-sm transition-colors hover:bg-muted/50">
                      <div className="font-medium">
                        {t(`list.${key}.title`)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`list.${key}.desc`)}
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
