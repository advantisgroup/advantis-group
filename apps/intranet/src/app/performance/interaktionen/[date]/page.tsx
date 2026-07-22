"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { InteractionRecordsTable } from "@/components/performance/InteractionRecordsTable";
import { PerformanceShell } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Card, CardContent } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/format";
import { clearPerformanceToken } from "@/lib/performanceAuth";

export default function DashboardInteractionDayPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const { token, session } = usePerformanceSession();

  useEffect(() => {
    if (session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [session, router]);

  useEffect(() => {
    // Team-wide day detail is admin-only, same gate as PerformanceDashboardLayout.
    if (!session?.valid || session.role === "admin") return;
    if (session.employeeId) {
      router.replace(`/performance/mitarbeiter/${session.employeeId}`);
    }
  }, [session, router]);

  const data = useQuery(
    api.performanceQueries.interactionsDayDetail,
    session?.valid && session.role === "admin"
      ? { token, date: params.date }
      : "skip"
  );

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || session.role !== "admin") return null;

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  return (
    <PerformanceShell
      navItems={[
        { href: "/performance/interaktionen", label: t("backToDashboard") },
      ]}
      onExit={session.viaClerk ? undefined : exit}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">
            {formatIsoDate(params.date, locale)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("interactionsTitle")}
          </p>
        </div>

        {!data ? (
          <Card>
            <CardContent className="space-y-2 p-6">
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ) : (
          <InteractionRecordsTable
            records={data.records}
            total={data.total}
            showEmployee
          />
        )}
      </div>
    </PerformanceShell>
  );
}
