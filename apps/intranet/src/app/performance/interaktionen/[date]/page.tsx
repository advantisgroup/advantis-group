"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { InteractionRecordsTable } from "@/components/performance/InteractionRecordsTable";
import { PerformanceBackLink } from "@/components/performance/PerformanceBackLink";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/format";

export default function DashboardInteractionDayPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const { me, dashboard } = usePerformanceAccess();
  const canViewTeam = !!dashboard?.canViewTeam;

  useEffect(() => {
    // The team-wide day detail is for the team view only.
    if (me && !canViewTeam) router.replace(dashboardHome(dashboard));
  }, [me, canViewTeam, dashboard, router]);

  const data = useQuery(
    api.performance.queries.interactionsDayDetail,
    canViewTeam && dashboard ? { date: params.date, companyId: dashboard.companyId } : "skip",
  );

  if (me === undefined) return <PerformancePageSkeleton />;
  if (!canViewTeam) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <div>
          <PerformanceBackLink href="/performance/interaktionen" />
          <h1 className="text-xl font-semibold">{formatIsoDate(params.date, locale)}</h1>
          <p className="text-sm text-muted-foreground">{t("interactionsTitle")}</p>
        </div>

        {!data ? (
          <Card>
            <CardContent className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : (
          <InteractionRecordsTable records={data.records} total={data.total} showEmployee />
        )}
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}
