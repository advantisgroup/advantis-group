"use client";

import { Award, Phone, Target, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { MetricTile } from "@/components/performance/MetricTile";
import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";
import { DeltaTriple, fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { UnqualifiedReasonsChart } from "@/components/performance/UnqualifiedReasonsChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

const BADGE_ORDER = ["hitrate", "won", "calls"];

function PrimaryKpiCard({
  accent,
  label,
  value,
  subtitle,
  dVm,
  dVj,
  dTeam,
}: {
  accent: "emerald" | "purple" | "slate" | "amber";
  label: string;
  value: string;
  subtitle?: string;
  dVm?: number;
  dVj?: number;
  dTeam?: number;
}) {
  const border = {
    emerald: "border-t-emerald-500",
    purple: "border-t-purple-500",
    slate: "border-t-foreground/60",
    amber: "border-t-amber-500",
  }[accent];
  return (
    <Card className={cn("border-t-2", border)}>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <DeltaTriple dVm={dVm} dVj={dVj} dTeam={dTeam} />
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

function SignalList({ items, kind }: { items: Signal[]; kind: "alert" | "highlight" }) {
  return (
    <ul className="space-y-3">
      {items.map((s) => (
        <li key={s.key} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{s.label}</span>
            <span
              className={
                kind === "alert" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
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

export default function EmployeeOverviewPage() {
  const t = useTranslations("Performance");
  const data = useEmployeeDetailData();

  if (!data) return <PerformanceContentSkeleton />;
  if (!data.cur) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle>{t("dashboardEmptyTitle")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const fc = data.cur.fc;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryKpiCard
          accent="emerald"
          label={t("dashboardWorkableRate")}
          value={fmtPct(data.cur.workableRate)}
          subtitle={`${fmtNum(data.cur.workableCreated)} / ${fmtNum(data.cur.leadsCreated)}`}
          dVm={data.dVm.workableRate}
          dVj={data.dVj.workableRate}
          dTeam={data.dTeam.workableRate}
        />
        <PrimaryKpiCard
          accent="purple"
          label={t("dashboardMetricHitrate")}
          value={fmtPct(data.cur.hitrate)}
          subtitle={`${fmtNum(data.cur.wonMonth)} / ${fmtNum(data.cur.workableCreated)}`}
          dVm={data.dVm.hitrate}
          dVj={data.dVj.hitrate}
          dTeam={data.dTeam.hitrate}
        />
        <PrimaryKpiCard
          accent="slate"
          label={fc?.isActual ? t("dashboardForecastTitleDone") : t("dashboardForecastTitle")}
          value={fmtNum(data.cur.fc1)}
          subtitle={
            fc?.isActual
              ? t("dashboardForecastSubtitleDone")
              : fc
                ? t("dashboardForecastSubtitle", {
                    won: fmtNum(data.cur.wonMonth),
                    remaining: fc.remaining,
                  })
                : undefined
          }
          dVm={data.dVm.fc1}
          dVj={data.dVj.fc1}
          dTeam={data.dTeam.fc1}
        />
        <PrimaryKpiCard
          accent="amber"
          label={t("dashboardWonPerWorkday")}
          value={fmtNum(data.cur.wonPerDay)}
          subtitle={
            fc
              ? t("dashboardWonPerWorkdaySubtitle", {
                  elapsed: fc.elapsed,
                  total: fc.total,
                })
              : undefined
          }
          dVm={data.dVm.wonPerDay}
          dVj={data.dVj.wonPerDay}
          dTeam={data.dTeam.wonPerDay}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          icon={Award}
          label={t("dashboardMetricWon")}
          value={fmtNum(data.cur.wonMonth)}
          delta={data.dVm.wonMonth}
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
            <CardTitle className="text-base">{t("alertsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAlerts")}</p>
            ) : (
              <SignalList items={data.alerts} kind="alert" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("highlightsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.highlights.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAlerts")}</p>
            ) : (
              <SignalList items={data.highlights} kind="highlight" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("badgesTitle")}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {t("badgeCount", { count: data.nBadges })}
          </span>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          {BADGE_ORDER.map((key) => {
            const count = data.myBadges[key] ?? 0;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {BADGE_ICONS[key]}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {t(`badgeTotalLabel.${key}`)}
                  </span>
                </div>
                <Badge variant={count > 0 ? "success" : "muted"}>{fmtNum(count)}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <UnqualifiedReasonsChart reasons={data.reasons} />
    </div>
  );
}
