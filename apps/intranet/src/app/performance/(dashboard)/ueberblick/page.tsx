"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Award,
  Phone,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { MetricTile } from "@/components/performance/MetricTile";
import { fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

const LIST_KEYS = [
  "analysis30",
  "leads14",
  "opp_overdue",
  "opp30",
  "opps14",
] as const;

export default function DashboardOverviewPage() {
  const t = useTranslations("Performance");
  const token = getPerformanceToken();
  const [ym] = usePerformanceYm();
  const data = useQuery(
    api.performanceQueries.teamDashboard,
    token ? { token, ym } : "skip"
  );

  if (!data) return <PerformanceContentSkeleton />;

  if (data.snaps.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
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
                <div className="font-medium">{t(`list.${key}.title`)}</div>
                <div className="text-xs text-muted-foreground">
                  {t(`list.${key}.desc`)}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
