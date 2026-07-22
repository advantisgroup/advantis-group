"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { InteractionRecordsTable } from "@/components/performance/InteractionRecordsTable";
import { PerformanceShell } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Card, CardContent } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/format";
import { clearPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeInteractionDayPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string; date: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const { token, session } = usePerformanceSession();

  useEffect(() => {
    if (session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const canView =
    session?.valid &&
    (session.role === "admin" || session.employeeId === employeeId);

  const data = useQuery(
    api.performanceQueries.interactionsDayDetail,
    canView ? { token, date: params.date, employeeId } : "skip"
  );

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid) return null;

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (!canView) {
    return (
      <PerformanceShell
        navItems={[]}
        onExit={session.viaClerk ? undefined : exit}
      >
        <div className="mx-auto max-w-3xl">
          <Card>
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </div>
          </Card>
        </div>
      </PerformanceShell>
    );
  }

  return (
    <PerformanceShell
      navItems={[
        {
          href: `/performance/mitarbeiter/${employeeId}/interaktionen`,
          label: t("backToDashboard"),
        },
        ...(isAdmin ? [{ href: "/performance", label: t("tabOverview") }] : []),
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
            showEmployee={false}
          />
        )}
      </div>
    </PerformanceShell>
  );
}
