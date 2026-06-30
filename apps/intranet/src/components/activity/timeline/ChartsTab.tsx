"use client";

import { DailyTrendChart } from "@/components/activity/charts/DailyTrendChart";
import { HourHeatmap } from "@/components/activity/charts/HourHeatmap";
import { HourlyStateChart } from "@/components/activity/charts/HourlyStateChart";
import { IntradayChart } from "@/components/activity/charts/IntradayChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type dailyTrend,
  type hourOfDayActivity,
  type hourlyStateBreakdown,
  type intradayTimeline,
  type StateName,
} from "@/lib/activity/activity";
import { useI18n } from "@/lib/activity/i18n";

/**
 * The default "Overview" tab on the device timeline page: trend, intraday,
 * heatmap and per-hour state breakdown. Pure presentation — all aggregation is
 * done by the page and passed in.
 */
export function ChartsTab({
  trend,
  heatmap,
  intraday,
  hourlyStates,
  stateLabels,
  employeeId,
  stateHistory,
}: {
  trend: ReturnType<typeof dailyTrend>;
  heatmap: ReturnType<typeof hourOfDayActivity>;
  intraday: ReturnType<typeof intradayTimeline>;
  hourlyStates: ReturnType<typeof hourlyStateBreakdown>;
  stateLabels: Record<StateName, string>;
  employeeId: string | null;
  stateHistory: { length: number } | undefined;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-base">
              {t("timeline.trend.heading")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("timeline.trend.sub")}
            </p>
          </CardHeader>
          <CardContent className="pt-0 sm:pt-0">
            <DailyTrendChart
              data={trend}
              activeLabel={t("common.active")}
              idleLabel={t("common.idle")}
            />
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-base">
              {t("timeline.intraday.heading")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("timeline.intraday.sub")}
            </p>
          </CardHeader>
          <CardContent className="pt-0 sm:pt-0">
            {intraday.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("timeline.empty")}
              </p>
            ) : (
              <IntradayChart
                data={intraday}
                seriesLabel={t("timeline.intraday.series")}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">
            {t("timeline.heatmap.heading")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("timeline.heatmap.sub")}
          </p>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
          <HourHeatmap data={heatmap} />
        </CardContent>
      </Card>

      {/* Per-hour state breakdown — what they were doing each hour today. */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">
            {t("timeline.hourly.heading")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("timeline.hourly.sub")}
          </p>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
          {!employeeId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("timeline.hourly.unlinked")}
            </p>
          ) : stateHistory === undefined ? (
            <Skeleton className="h-56 w-full" />
          ) : stateHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("timeline.hourly.empty")}
            </p>
          ) : (
            <HourlyStateChart data={hourlyStates} labels={stateLabels} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
