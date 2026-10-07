"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { Briefcase, CircleDot, Hourglass, Trophy, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CHART } from "@/components/charts/theme";
import { MetricTile } from "@/components/performance/MetricTile";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";
import { fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { WallboxHistoryChart } from "@/components/performance/WallboxDevelopment";
import { WallboxOppTable, winRate } from "@/components/performance/WallboxOppList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIsoDate } from "@/lib/format";

export default function EmployeeWallboxPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const employeeId = useParams<{ id: string }>().id as Id<"performanceEmployees">;
  const { me } = usePerformanceAccess();
  const detail = useEmployeeDetailData();
  const data = useQuery(api.performance.wallbox.employee, { employeeId });

  if (data === undefined || !detail) return <PerformanceContentSkeleton tiles={5} />;
  if (data === null) return <EmptyState title={t("wallbox.notWallbox")} />;

  const row = data.row;
  const isMe = me?.dashboards.some((d) => d.employeeId === employeeId) ?? false;
  const dates = [
    { label: t("wallbox.membersReport"), date: data.membersDate },
    { label: t("wallbox.oppsReport"), date: data.oppsDate },
  ].filter((d) => d.date);

  if (!row && data.history.length === 0) {
    return <EmptyState title={t("wallbox.employeeEmpty")} />;
  }

  const rate = row ? winRate(row.won, row.lost) : null;

  return (
    <div className="space-y-6">
      {dates.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {dates.map((d) => (
            <span key={d.label}>
              {t("wallbox.asOf", { report: d.label, date: formatIsoDate(d.date!, locale) })}
            </span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          icon={Hourglass}
          label={t("wallbox.inProgress")}
          value={fmtNum(row?.inProgress ?? 0)}
        />
        <MetricTile
          icon={Briefcase}
          label={t("wallbox.opps")}
          value={fmtNum(row?.opps ?? 0)}
          delta={row?.oppsDelta ?? undefined}
        />
        <MetricTile icon={CircleDot} label={t("wallbox.open")} value={fmtNum(row?.open ?? 0)} />
        <MetricTile icon={Trophy} label={t("wallbox.won")} value={fmtNum(row?.won ?? 0)} />
        <MetricTile icon={XCircle} label={t("wallbox.lost")} value={fmtNum(row?.lost ?? 0)} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {row && row.inProgressEv > 0 && (
          <span>
            {t("wallbox.inProgress")}: {t("wallbox.evCount", { count: fmtNum(row.inProgressEv) })}
          </span>
        )}
        {rate !== null && (
          <span>
            {t("wallbox.rate")}: {fmtPct(rate)}
          </span>
        )}
        {row?.oppsDelta ? <span>{t("wallbox.deltaHint")}</span> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("wallbox.myHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length < 2 ? (
            <p className="text-sm text-muted-foreground">{t("wallbox.devOnePoint")}</p>
          ) : (
            <WallboxHistoryChart
              height={220}
              history={data.history}
              series={[
                { key: "opps", name: t("wallbox.opps"), color: CHART.accent },
                { key: "won", name: t("wallbox.won"), color: CHART.active },
                { key: "lost", name: t("wallbox.lost"), color: CHART.idle },
                { key: "inProgress", name: t("wallbox.inProgress"), color: CHART.info },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isMe ? t("wallbox.myOpps") : t("wallbox.opps")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <WallboxOppTable
            args={{ companyId: detail.employee.companyId, by: "acquirer", employeeId }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
