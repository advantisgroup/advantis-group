"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AlertTriangle, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  DeltaBadge,
  DeltaPair,
  fmtNum,
  fmtPct,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { TeamTable } from "@/components/performance/TeamTable";
import { UnqualifiedReasonsChart } from "@/components/performance/UnqualifiedReasonsChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/format";
import { getPerformanceToken } from "@/lib/performanceAuth";
import { cn } from "@/lib/utils";

const LIST_KEYS = [
  "analysis30",
  "opp_overdue",
  "opp30",
  "leads14",
  "opps14",
] as const;

function PrimaryKpiCard({
  accent,
  label,
  value,
  subtitle,
  dVm,
  dVj,
}: {
  accent: "emerald" | "purple" | "slate" | "amber";
  label: string;
  value: string;
  subtitle?: string;
  dVm?: number;
  dVj?: number;
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
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        <DeltaPair dVm={dVm} dVj={dVj} />
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  badge,
  dVm,
  dVj,
}: {
  label: string;
  value: string;
  badge?: string;
  dVm?: number;
  dVj?: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{value}</span>
          {badge && (
            <Badge variant="muted" className="text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        <DeltaPair dVm={dVm} dVj={dVj} />
      </CardContent>
    </Card>
  );
}

function ListStatCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardContent className="flex flex-col gap-1.5 p-4">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xl font-semibold tabular-nums text-amber-600 underline decoration-dotted underline-offset-4 dark:text-amber-400">
            {value}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardOverviewPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });

  const fc2 = useMemo(() => {
    const fc = data?.total.fc;
    if (!fc?.elapsed || data?.total.leadsCreated === undefined)
      return undefined;
    return Math.round((data.total.leadsCreated / fc.elapsed) * fc.total);
  }, [data]);
  const fc3 = useMemo(() => {
    const fc = data?.total.fc;
    if (!fc?.elapsed || data?.total.workableCreated === undefined)
      return undefined;
    return Math.round((data.total.workableCreated / fc.elapsed) * fc.total);
  }, [data]);

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

  const fc = data.total.fc;
  const listValues: Record<(typeof LIST_KEYS)[number], number | undefined> = {
    analysis30: data.total.overduesAnalysis,
    opp_overdue: data.total.overduesOpps,
    opp30: data.total.oppsOver30,
    leads14: data.total.leadsNoAction14,
    opps14: data.total.oppsNoAction14,
  };
  const workdaysPct =
    fc && fc.total
      ? Math.min(100, Math.round((fc.elapsed / fc.total) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("dashboardSubtitle", {
          ym: fmtYm(data.ym, locale),
          date: data.total.reportDate
            ? formatIsoDate(data.total.reportDate, locale)
            : "–",
          count: data.snaps.length,
        })}
      </p>

      {fc?.incomplete && fc.missingDays.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("dashboardMissingReport", { days: fc.missingDays.join(", ") })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryKpiCard
          accent="emerald"
          label={t("dashboardWorkableRate")}
          value={fmtPct(data.total.workableRate)}
          subtitle={`${fmtNum(data.total.workableCreated)} / ${fmtNum(data.total.leadsCreated)}`}
          dVm={data.dVm.workableRate}
          dVj={data.dVj.workableRate}
        />
        <PrimaryKpiCard
          accent="purple"
          label={t("dashboardMetricHitrate")}
          value={fmtPct(data.total.hitrate)}
          subtitle={`${fmtNum(data.total.wonMonth)} / ${fmtNum(data.total.workableCreated)}`}
          dVm={data.dVm.hitrate}
          dVj={data.dVj.hitrate}
        />
        <PrimaryKpiCard
          accent="slate"
          label={t("dashboardMetricWon")}
          value={fmtNum(data.total.wonMonth)}
          subtitle={t("dashboardClosedWonSubtitle", {
            date: data.total.reportDate
              ? formatIsoDate(data.total.reportDate, locale)
              : "–",
          })}
        />
        <PrimaryKpiCard
          accent="amber"
          label={t("dashboardWonPerWorkday")}
          value={fmtNum(data.total.wonPerDay)}
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
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <Card className="border-none bg-foreground text-background">
          <CardContent className="flex flex-col gap-1.5 p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-background/70">
              {fc?.isActual
                ? t("dashboardForecastTitleDone")
                : t("dashboardForecastTitle")}
            </span>
            <span className="text-4xl font-semibold tabular-nums">
              {fmtNum(fc?.fc1)}
            </span>
            {fc && (
              <p className="text-xs text-background/70">
                {fc.isActual
                  ? t("dashboardForecastSubtitleDone")
                  : t("dashboardForecastSubtitle", {
                      won: fmtNum(data.total.wonMonth),
                      remaining: fc.remaining,
                    })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-background/70">
              {data.dVm.fc1 !== undefined && (
                <span className="inline-flex items-center gap-1">
                  VM <DeltaBadge value={data.dVm.fc1} />
                </span>
              )}
              {data.dVj.fc1 !== undefined && (
                <span className="inline-flex items-center gap-1">
                  VJ <DeltaBadge value={data.dVj.fc1} />
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="text-xs text-muted-foreground">
              {t("dashboardWorkdaysTitle")}
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {fc?.elapsed ?? "–"}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / {fc?.total ?? "–"}
              </span>
            </span>
            <p className="text-xs text-muted-foreground">
              {t("dashboardWorkdaysSubtitle")}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${workdaysPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t("dashboardLeadsCreatedMonth")}
          value={fmtNum(data.total.leadsCreated)}
          badge={fc2 !== undefined ? `FC2 ${fmtNum(fc2)}` : undefined}
          dVm={data.dVm.leadsCreated}
          dVj={data.dVj.leadsCreated}
        />
        <StatCard
          label={t("dashboardWorkableCreatedMonth")}
          value={fmtNum(data.total.workableCreated)}
          badge={fc3 !== undefined ? `FC3 ${fmtNum(fc3)}` : undefined}
          dVm={data.dVm.workableCreated}
          dVj={data.dVj.workableCreated}
        />
        <StatCard
          label={t("dashboardLeadsAnalysisLabel")}
          value={fmtNum(data.total.leadsAnalysis)}
        />
        <StatCard
          label={t("dashboardLeadsDetailsIdentLabel")}
          value={fmtNum(data.total.leadsDetailsIdent)}
        />
        <StatCard
          label={t("dashboardOppsOpenLabel")}
          value={fmtNum(data.total.oppsOpen)}
        />
        <StatCard
          label={t("dashboardOppsClose7dLabel")}
          value={fmtNum(data.total.oppsClose7d)}
        />
        <StatCard
          label={t("dashboardOppsPendingLabel")}
          value={fmtNum(data.total.oppsPending)}
        />
        {LIST_KEYS.map(key => (
          <ListStatCard
            key={key}
            href={`/performance/liste/${key}`}
            label={t(`list.${key}.title`)}
            value={fmtNum(listValues[key])}
          />
        ))}
      </div>

      <UnqualifiedReasonsChart reasons={data.unqualified} />

      <TeamTable data={data} />

      {fc && (
        <p className="text-xs text-muted-foreground">
          {t("dashboardForecastFootnote", {
            elapsed: fc.elapsed,
            total: fc.total,
          })}
        </p>
      )}
    </div>
  );
}
