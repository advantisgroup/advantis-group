"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import {
  OnboardingTeamTable,
  OnboardingTiles,
  OnboardingTrend,
} from "@/components/performance/OnboardingKpis";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";

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

/** Onboarding tab: the cockpit's figures per person next to their calls. */
export default function OnboardingTeamPage() {
  const t = useTranslations("Performance.onboarding");
  const locale = useLocale();
  const { dashboard } = usePerformanceAccess();
  const [ym] = usePerformanceYm();
  const data = useQuery(
    api.performance.onboardingKpis.team,
    dashboard?.cockpit ? { companyId: dashboard.companyId, ym } : "skip",
  );

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {t("intro", {
          from: fmtDate(data.period.from, locale),
          to: fmtDate(data.period.to, locale),
          vmTo: fmtDate(data.period.vmTo, locale),
        })}{" "}
        {data.cockpitSince && t("since", { date: fmtDate(data.cockpitSince, locale) })}
      </p>
      <OnboardingTiles cur={data.total.cur} vm={data.total.vm} vj={data.total.vj} />
      <OnboardingTeamTable data={data} />
      <OnboardingTrend data={data} />
    </div>
  );
}
