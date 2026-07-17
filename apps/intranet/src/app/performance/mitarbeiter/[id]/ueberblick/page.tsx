"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  Award,
  Phone,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { MetricTile } from "@/components/performance/MetricTile";
import { fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

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

export default function EmployeeOverviewPage() {
  const t = useTranslations("Performance");
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken();
  const [ym] = usePerformanceYm();
  const data = useQuery(
    api.performanceQueries.employeeDetail,
    token ? { token, employeeId, ym } : "skip"
  );

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

  return (
    <div className="space-y-6">
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
        <CardContent className="flex flex-wrap gap-2">
          {Object.keys(data.monthBadges).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("badgesEmpty")}</p>
          ) : (
            Object.entries(data.monthBadges).map(([key, info]) => (
              <Badge key={key} variant="success" title={t(`badgeLabel.${key}`)}>
                {BADGE_ICONS[key] ?? ""} {t(`badgeLabel.${key}`)} ·{" "}
                {fmtNum(info.value)}
              </Badge>
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
    </div>
  );
}
