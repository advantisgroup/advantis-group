"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FilterableBarChart } from "@/components/charts/FilterableBarChart";
import { CHART, tooltipStyle } from "@/components/charts/theme";
import { PrimaryKpiCard, StatCard } from "@/components/performance/KpiCards";
import {
  OnboardingBasisToggle,
  useOnboardingBasis,
} from "@/components/performance/OnboardingBasis";
import {
  fmtOnboarding,
  ONBOARDING_GROUPS,
  type OnboardingKey,
  OnboardingTeamTable,
  OnboardingTrend,
  type OnboardingValues,
} from "@/components/performance/OnboardingKpis";
import {
  DeltaBadge,
  type DeltaFormat,
  fmtDayShort,
  fmtNum,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";

function useOnboardingTeam(companyId: Id<"companies">) {
  const [ym] = usePerformanceYm();
  const [basis] = useOnboardingBasis();
  return useQuery(api.performance.onboardingKpis.team, { companyId, ym, basis });
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function diff(cur: number | null, ref: number | null): number | undefined {
  if (cur === null || ref === null) return undefined;
  return Math.round((cur - ref) * 10) / 10;
}

function formatOf(key: OnboardingKey): DeltaFormat {
  if (key === "reachRate") return "pts";
  if (key.endsWith("Sec")) return "duration";
  return "num";
}

/** The four headline figures get the big cards; everything else a stat card. */
const PRIMARY: OnboardingKey[] = ["reachRate", "attempts", "cards", "fuel"];

/** Contacts per day of the month — above the tab bar, like Sales' closed-won chart. */
export function OnboardingDailyChart({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance.onboarding");
  const locale = useLocale();
  const data = useOnboardingTeam(companyId);
  const chart = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        label: fmtDayShort(d.date, locale),
        reached: d.reached,
        notReached: d.notReached,
        emails: d.emails,
      })),
    [data?.days, locale],
  );
  if (!data || chart.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dailyTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FilterableBarChart
          data={chart}
          series={[
            { key: "reached", name: t("kpi.reached"), color: CHART.active },
            { key: "notReached", name: t("kpi.notReached"), color: CHART.idle },
            { key: "emails", name: t("kpi.emails"), color: CHART.info },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/** Überblick of a dashboard linked to the Onboarding-Cockpit, laid out like Sales'. */
export function OnboardingOverview({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance.onboarding");
  const tp = useTranslations("Performance");
  const locale = useLocale();
  const data = useOnboardingTeam(companyId);

  if (!data) return <PerformanceContentSkeleton />;

  const { cur, vm, vj } = data.total;
  const card = (k: OnboardingKey) => ({
    value: fmtOnboarding(k, cur[k]),
    dVm: diff(cur[k], vm[k]),
    dVj: diff(cur[k], vj[k]),
    format: formatOf(k),
  });
  const { elapsed, total } = data.workdays;
  const perDay = cur.attempts !== null && elapsed > 0 ? cur.attempts / elapsed : null;
  const vmPerDay =
    vm.attempts !== null && elapsed > 0 ? Math.round((vm.attempts / elapsed) * 10) / 10 : null;
  const forecast = perDay !== null ? Math.round(perDay * total) : null;
  const workdaysPct = total ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
  const dialled = (cur.reached ?? 0) + (cur.notReached ?? 0);
  const others = ONBOARDING_GROUPS.flatMap((g) => g.items).filter((k) => !PRIMARY.includes(k));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t(data.basis === "won" ? "subtitleWon" : "subtitle", {
            ym: fmtYm(data.ym, locale),
            count: data.rows.length,
          })}
        </p>
        <OnboardingBasisToggle />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryKpiCard
          accent="emerald"
          label={t("kpi.reachRate")}
          info={t("info.reachRate")}
          subtitle={t("reachSubtitle", { reached: fmtNum(cur.reached), dialled: fmtNum(dialled) })}
          {...card("reachRate")}
        />
        <PrimaryKpiCard
          accent="purple"
          label={t("kpi.attempts")}
          info={t("info.attempts")}
          subtitle={t("attemptsSubtitle", { cases: fmtNum(cur.casesWorked) })}
          {...card("attempts")}
        />
        <PrimaryKpiCard
          accent="slate"
          label={t("kpi.cards")}
          info={t("info.cards")}
          {...card("cards")}
        />
        <PrimaryKpiCard
          accent="amber"
          label={t("kpi.fuel")}
          info={t("info.fuel")}
          {...card("fuel")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <Card className="relative border-none bg-foreground text-background">
          <InfoTip
            text={t("perDayInfo")}
            className="absolute right-4 top-4 text-background/70 hover:text-background focus-visible:text-background"
          />
          <CardContent className="flex flex-col gap-1.5 p-5 pr-10">
            <span className="text-xs font-medium uppercase tracking-wide text-background/70">
              {t("perDayTitle")}
            </span>
            <span className="text-4xl font-semibold tabular-nums">
              {perDay === null ? "–" : fmtNum(Math.round(perDay * 10) / 10)}
            </span>
            <p className="text-xs text-background/70">
              {data.monthDone
                ? t("perDaySubtitleDone", { total: fmtNum(cur.attempts) })
                : t("perDaySubtitle", { fc: fmtNum(forecast) })}
            </p>
            {perDay !== null && vmPerDay !== null && (
              <span className="inline-flex items-center gap-1 text-xs text-background/70">
                VM <DeltaBadge value={Math.round((perDay - vmPerDay) * 10) / 10} />
              </span>
            )}
          </CardContent>
        </Card>
        <Card className="relative">
          <InfoTip text={tp("kpiInfo.workdays")} className="absolute right-4 top-4" />
          <CardContent className="flex flex-col gap-2 p-5 pr-10">
            <span className="text-xs text-muted-foreground">{tp("dashboardWorkdaysTitle")}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {elapsed}{" "}
              <span className="text-base font-normal text-muted-foreground">/ {total}</span>
            </span>
            <p className="text-xs text-muted-foreground">{tp("dashboardWorkdaysSubtitle")}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-ok" style={{ width: `${workdaysPct}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {others.map((k) => (
          <StatCard key={k} label={t(`kpi.${k}`)} info={t(`info.${k}`)} {...card(k)} />
        ))}
      </div>

      <OnboardingTeamTable data={data} />

      <p className="text-xs text-muted-foreground">
        {t("intro", {
          from: fmtDate(data.period.from, locale),
          to: fmtDate(data.period.to, locale),
          vmTo: fmtDate(data.period.vmTo, locale),
        })}{" "}
        {data.cockpitSince && t("since", { date: fmtDate(data.cockpitSince, locale) })}
      </p>
    </div>
  );
}

/** Entwicklung: the team's last months as charts, then the figures. */
export function OnboardingDevelopment({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance.onboarding");
  const locale = useLocale();
  const data = useOnboardingTeam(companyId);
  const months = useMemo(
    () =>
      (data?.trend ?? []).map((m) => {
        const v: OnboardingValues = m.values;
        const row: Record<string, string | number> = { label: fmtYm(m.ym, locale) };
        for (const [k, value] of Object.entries(v)) row[k] = value ?? 0;
        row.reachRate = v.reachRate ?? Number.NaN;
        return row;
      }),
    [data?.trend, locale],
  );

  if (!data) return <PerformanceContentSkeleton />;

  const bar = (title: string, keys: { key: OnboardingKey; color: string }[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <FilterableBarChart
          data={months}
          series={keys.map(({ key, color }) => ({ key, name: t(`kpi.${key}`), color }))}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("devSubtitle")}</p>
        <OnboardingBasisToggle />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {bar(t("devContacts"), [
          { key: "reached", color: CHART.active },
          { key: "notReached", color: CHART.idle },
          { key: "emails", color: CHART.info },
        ])}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("devReach")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
                  width={40}
                  unit="%"
                />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="reachRate"
                  name={t("kpi.reachRate")}
                  stroke={CHART.accent}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {bar(t("devMilestones"), [
          { key: "cards", color: CHART.accent },
          { key: "fuel", color: CHART.active },
          { key: "twoMonth", color: CHART.info },
        ])}
        {bar(t("devClosed"), [
          { key: "done", color: CHART.active },
          { key: "winback", color: CHART.idle },
          { key: "refused", color: CHART.info },
          { key: "unreachable", color: CHART.axis },
        ])}
      </div>
      {bar(t("devCalls"), [
        { key: "calls", color: CHART.accent },
        { key: "callsOutbound", color: CHART.info },
        { key: "callsAnswered", color: CHART.active },
      ])}
      <OnboardingTrend data={data} />
    </div>
  );
}
