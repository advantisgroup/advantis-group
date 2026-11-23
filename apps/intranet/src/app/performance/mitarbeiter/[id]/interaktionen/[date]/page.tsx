"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { InteractionRecordsTable } from "@/components/performance/InteractionRecordsTable";
import { fmtTimeOfDay } from "@/components/performance/PerformanceFormat";
import { PerformanceBackLink } from "@/components/performance/PerformanceBackLink";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/format";

export default function EmployeeInteractionDayPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const params = useParams<{ id: string; date: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const { me } = usePerformanceAccess();
  const canView =
    !!me && (me.isAdmin || me.dashboards.some((d) => d.canViewTeam || d.employeeId === employeeId));

  const data = useQuery(
    api.performance.queries.interactionsDayDetail,
    canView ? { date: params.date, employeeId } : "skip",
  );

  if (me === undefined) return <PerformancePageSkeleton />;

  if (!canView) {
    return (
      <div className="min-h-screen bg-muted/20">
        <PerformanceHeader />
        <main className="mx-auto max-w-3xl p-4 pb-24 md:p-6">
          <Card>
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </div>
          </Card>
        </main>
        <PerformanceBottomTabs />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <div>
          <PerformanceBackLink href={`/performance/mitarbeiter/${employeeId}/calls`} />
          <h1 className="text-xl font-semibold">{formatIsoDate(params.date, locale)}</h1>
          <p className="text-sm text-muted-foreground">{t("interactionsTitle")}</p>
          {data?.workday && <WorkdayTimes workday={data.workday} />}
        </div>

        {!data ? (
          <Card>
            <CardContent className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : (
          <InteractionRecordsTable records={data.records} total={data.total} showEmployee={false} />
        )}
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}

/** At a glance: first and last call of the day, and — small below, for
 * admins and the person themselves — when they clocked in and out. */
function WorkdayTimes({
  workday,
}: {
  workday: {
    firstCall: number | null;
    lastCall: number | null;
    clock: { clockIn: number; clockOut: number | null } | null;
  };
}) {
  const t = useTranslations("Performance");
  const time = (ms: number | null) => (ms === null ? "–" : fmtTimeOfDay(ms));
  return (
    <div className="mt-3 space-y-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">{t("workdayFirstCall")}</span>{" "}
          <span className="font-semibold tabular-nums">{time(workday.firstCall)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">{t("workdayLastCall")}</span>{" "}
          <span className="font-semibold tabular-nums">{time(workday.lastCall)}</span>
        </span>
      </div>
      {workday.clock && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("workdayClockIn")}{" "}
            <span className="tabular-nums text-foreground">{time(workday.clock.clockIn)}</span>
          </span>
          <span>
            {t("workdayClockOut")}{" "}
            <span className="tabular-nums text-foreground">
              {workday.clock.clockOut === null
                ? t("workdayStillClockedIn")
                : time(workday.clock.clockOut)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
