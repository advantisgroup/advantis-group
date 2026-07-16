"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Award,
  LogOut,
  type LucideIcon,
  Pencil,
  Phone,
  Plus,
  Target,
  Trash2,
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
  Line,
  LineChart,
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
import { TopicDialog } from "@/components/performance/TopicDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

function MetricTile({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: number;
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
          <DeltaBadge value={delta} />
        </div>
      </CardContent>
    </Card>
  );
}

type Signal = {
  key: string;
  label: string;
  value: number;
  unit: string;
  cmp: string;
  trend: { text: string; dir: "good" | "bad" } | null;
};

function SignalList({
  items,
  kind,
}: {
  items: Signal[];
  kind: "alert" | "highlight";
}) {
  return (
    <ul className="space-y-3">
      {items.map(s => (
        <li key={s.key} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{s.label}</span>
            <span
              className={
                kind === "alert"
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400"
              }
            >
              {fmtNum(s.value)}
              {s.unit}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{s.cmp}</p>
          {s.trend && (
            <p
              className={
                s.trend.dir === "good"
                  ? "text-xs text-emerald-600 dark:text-emerald-400"
                  : "text-xs text-destructive"
              }
            >
              {s.trend.text}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function EmployeeDetailPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const [token] = useState<string | null>(() => getPerformanceToken());
  const [ym, setYm] = useState<string | undefined>(undefined);
  const [topicDialog, setTopicDialog] = useState<
    { open: true; topic: Doc<"performanceTopics"> | null } | { open: false }
  >({ open: false });
  const [deleteTarget, setDeleteTarget] =
    useState<Doc<"performanceTopics"> | null>(null);

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );
  const logout = useMutation(api.performanceAuth.logout);
  const setTopicStatus = useMutation(api.performanceTopics.setTopicStatus);
  const deleteTopic = useMutation(api.performanceTopics.deleteTopic);

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const canView =
    session?.valid &&
    (session.role === "admin" || session.employeeId === employeeId);

  const data = useQuery(
    api.performanceQueries.employeeDetail,
    token && canView ? { token, employeeId, ym } : "skip"
  );

  const histChart = useMemo(
    () =>
      (data?.hist ?? []).map(h => ({
        label: h.ym ? fmtYm(h.ym, locale) : "",
        hitrate: h.hitrate ?? null,
      })),
    [data?.hist, locale]
  );
  const dayChart = useMemo(
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
  if (!canView) {
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
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
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
        {isAdmin && (
          <>
            <Link href="/performance">
              <Button variant="ghost" size="sm">
                {t("backToDashboard")}
              </Button>
            </Link>
            <Link href="/performance/upload">
              <Button variant="ghost" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                {t("uploadLink")}
              </Button>
            </Link>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{data?.employee.name}</h1>
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
        </div>

        {!data ? null : !data.cur ? (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle>{t("dashboardEmptyTitle")}</CardTitle>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <MetricTile
                icon={Users}
                label={t("dashboardMetricLeads")}
                value={fmtNum(data.cur.leadsCreated)}
                delta={data.dVm.leadsCreated}
              />
              <MetricTile
                icon={Target}
                label={t("dashboardMetricWorkable")}
                value={fmtNum(data.cur.workableCreated)}
                delta={data.dVm.workableCreated}
              />
              <MetricTile
                icon={TrendingUp}
                label={t("dashboardMetricHitrate")}
                value={fmtPct(data.cur.hitrate)}
                delta={data.dVm.hitrate}
              />
              <MetricTile
                icon={Award}
                label={t("dashboardMetricWon")}
                value={fmtNum(data.cur.wonMonth)}
                delta={data.dVm.wonMonth}
              />
              <MetricTile
                icon={TrendingDown}
                label={t("dashboardMetricForecast")}
                value={fmtNum(data.cur.fc1)}
              />
              <MetricTile
                icon={Phone}
                label={t("dashboardMetricCalls")}
                value={fmtNum(data.cur.callsToday)}
                delta={data.dVm.callsToday}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("alertsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noAlerts")}
                    </p>
                  ) : (
                    <SignalList items={data.alerts} kind="alert" />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("highlightsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.highlights.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noAlerts")}
                    </p>
                  ) : (
                    <SignalList items={data.highlights} kind="highlight" />
                  )}
                </CardContent>
              </Card>
            </div>

            {histChart.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("hitrateHistory")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={histChart}
                      margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                    >
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke={CHART.axis}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        stroke={CHART.axis}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={32}
                        unit="%"
                      />
                      <Tooltip {...tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="hitrate"
                        name={t("dashboardMetricHitrate")}
                        stroke={CHART.accent}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {data.hasCalls && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("dashboardCallActivity")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={dayChart}
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t("badgesTitle")}</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {t("badgeCount", { count: data.nBadges })}
                </span>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Object.keys(data.monthBadges).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("topicEmpty")}
                  </p>
                ) : (
                  Object.entries(data.monthBadges).map(([key, info]) => (
                    <Badge key={key} variant="success">
                      {BADGE_ICONS[key] ?? ""} {key} · {fmtNum(info.value)}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t("topicsTitle")}</CardTitle>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setTopicDialog({ open: true, topic: null })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("topicNew")}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {data.topics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("topicEmpty")}
                  </p>
                ) : (
                  data.topics.map(topic => (
                    <div
                      key={topic._id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border/70 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{topic.topic}</p>
                        {topic.todo && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {topic.todo}
                          </p>
                        )}
                        {topic.endDate && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {topic.endDate}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={topic.status}
                          onValueChange={v =>
                            void setTopicStatus({
                              token: token!,
                              employeeId,
                              id: topic._id,
                              status: v as
                                | "offen"
                                | "erreicht"
                                | "nicht_erreicht",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="offen">
                              {t("topicStatusOpen")}
                            </SelectItem>
                            <SelectItem value="erreicht">
                              {t("topicStatusReached")}
                            </SelectItem>
                            <SelectItem value="nicht_erreicht">
                              {t("topicStatusMissed")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                setTopicDialog({ open: true, topic })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteTarget(topic)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {data.reasons.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("dashboardUnqualified")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {data.reasons.map(r => (
                    <Badge key={r.reason} variant="muted">
                      {r.reason} · {r.count}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {token && (
        <TopicDialog
          open={topicDialog.open}
          onOpenChange={open =>
            setTopicDialog(open ? topicDialog : { open: false })
          }
          topic={topicDialog.open ? topicDialog.topic : null}
          employeeId={employeeId}
          ym={ym ?? data?.ym ?? ""}
          token={token}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={o => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <div className="px-6 pb-5 pt-6 pr-12">
            <DialogTitle className="leading-snug">
              {t("topicDeleteTitle")}
            </DialogTitle>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("topicCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget && token) {
                  void deleteTopic({
                    token,
                    employeeId,
                    id: deleteTarget._id,
                  });
                }
                setDeleteTarget(null);
              }}
            >
              {t("topicDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
