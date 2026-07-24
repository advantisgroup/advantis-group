"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Download,
  LayoutDashboard,
  Phone,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { FilterableBarChart } from "@/components/activity/charts/FilterableBarChart";
import { CHART } from "@/components/activity/charts/theme";
import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { ClosedWonTrendChart } from "@/components/performance/ClosedWonTrendChart";
import {
  LastDayInteractions,
  type LastDayInteractionRow,
} from "@/components/performance/LastDayInteractions";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceDashboardDataProvider } from "@/components/performance/PerformanceDashboardContext";
import {
  buildCallActivityChartData,
  fmtDayShort,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import {
  PerformanceYmProvider,
  usePerformanceYm,
} from "@/components/performance/PerformanceYmContext";
import { SelfLinkPrompt } from "@/components/performance/SelfLinkPrompt";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatIsoDate } from "@/lib/format";
import {
  clearPerformanceToken,
  downloadPerformanceFile,
} from "@/lib/performanceAuth";

interface DashboardTopData {
  hasCalls: boolean;
  days: {
    date: string;
    values: { callsAnswered?: number; callsOutbound?: number };
  }[];
  wonTrend: { days: { date: string; won: number }[]; avg: number };
  loggedIn: { date: string; count: number }[];
}

/** The chart shown above the tab bar, tab-dependent: the Calls tab promotes
 * its own "Call-Aktivität" chart up here (so it isn't shown twice — see
 * `calls/page.tsx`, which no longer renders it in the page body); every
 * other tab keeps the closed-won trend chart that used to render
 * unconditionally here. */
function DashboardTopSection({
  data,
  interactionDays,
  activeTab,
  t,
  locale,
}: {
  data: DashboardTopData;
  interactionDays: LastDayInteractionRow[] | undefined;
  activeTab: string;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  if (activeTab === "calls") {
    if (!data.hasCalls) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("dashboardCallActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableBarChart
            data={buildCallActivityChartData(data.days, locale)}
            series={[
              {
                key: "answered",
                name: t("callsAnsweredLabel"),
                color: CHART.active,
              },
              {
                key: "outbound",
                name: t("callsOutboundLabel"),
                color: CHART.accent,
              },
            ]}
          />
        </CardContent>
      </Card>
    );
  }
  if (activeTab === "interaktionen") {
    if (!interactionDays) return null;
    return <LastDayInteractions days={interactionDays} locale={locale} />;
  }
  if (activeTab === "team") {
    const chartData = data.loggedIn.map(d => ({
      label: fmtDayShort(d.date, locale),
      count: d.count,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("dashboardLoggedInTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableBarChart
            data={chartData}
            series={[
              {
                key: "count",
                name: t("dashboardLoggedInSeries"),
                color: CHART.active,
              },
            ]}
          />
        </CardContent>
      </Card>
    );
  }
  // The Entwicklung tab already shows a closed-won trend chart itself
  // (over its own trailing-3-month window) further down the page — no
  // top-of-page chart needed here too.
  if (activeTab === "entwicklung") return null;
  return (
    <ClosedWonTrendChart days={data.wonTrend.days} avg={data.wonTrend.avg} />
  );
}

function DashboardChrome({
  token,
  viaClerk,
  onExit,
  children,
}: {
  token: string;
  viaClerk: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const pathname = usePathname();
  const [ym, setYm] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });
  const interactions = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    ym,
  });

  const activeTab = pathname.split("/").filter(Boolean)[1] ?? "ueberblick";

  const tabs: RouteTab[] = [
    {
      value: "ueberblick",
      href: "/performance/ueberblick",
      label: t("tabOverview"),
      icon: LayoutDashboard,
    },
    {
      value: "calls",
      href: "/performance/calls",
      label: t("tabCalls"),
      icon: Phone,
    },
    {
      value: "team",
      href: "/performance/team",
      label: t("tabTeam"),
      icon: Users,
      count: data?.snaps.length,
    },
    {
      value: "interaktionen",
      href: "/performance/interaktionen",
      label: t("tabInteractions"),
      icon: Activity,
    },
    {
      value: "entwicklung",
      href: "/performance/entwicklung",
      label: t("tabDevelopment"),
      icon: TrendingUp,
    },
  ];

  const navItems = [
    { href: "/performance/benutzer", label: t("usersLink"), icon: Users },
    ...(viaClerk
      ? []
      : [
          { href: "/performance/upload", label: t("uploadLink"), icon: Upload },
        ]),
    ...(viaClerk
      ? []
      : [{ href: "/performance/passwort", label: t("passwordLink") }]),
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader
        navItems={navItems}
        onExit={viaClerk ? undefined : onExit}
      />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        {!viaClerk && <SelfLinkPrompt token={token} />}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={ym ?? data?.ym ?? ""}
            onValueChange={v => setYm(v)}
            disabled={!data || data.months.length === 0}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("dashboardMonthLabel")} />
            </SelectTrigger>
            <SelectContent>
              {[...(data?.months ?? [])].reverse().map(m => (
                <SelectItem key={m} value={m}>
                  {fmtYm(m, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <Badge variant={data.monthDone ? "muted" : "success"}>
              {data.monthDone
                ? t("dashboardMonthClosed")
                : t("dashboardMonthOpen")}
            </Badge>
          )}
          {data?.total.reportDate && (
            <span className="text-xs text-muted-foreground">
              {t("dashboardLastUpdated", {
                date: formatIsoDate(data.total.reportDate, locale),
              })}
            </span>
          )}
          {!viaClerk && data && data.snaps.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadPerformanceFile(
                  `/performance/export?ym=${data.ym}`,
                  token,
                  `performance-${data.ym}.xlsx`
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("exportButton")}
            </Button>
          )}
        </div>

        {data && (
          <DashboardTopSection
            data={data}
            interactionDays={interactions?.days}
            activeTab={activeTab}
            t={t}
            locale={locale}
          />
        )}

        <Card className="overflow-hidden">
          <div className="px-2">
            <RouteTabs tabs={tabs} activeValue={activeTab} />
          </div>
        </Card>

        <PerformanceDashboardDataProvider data={data}>
          {children}
        </PerformanceDashboardDataProvider>
      </main>
      <PerformanceBottomTabs
        navItems={navItems}
        onExit={viaClerk ? undefined : onExit}
      />
    </div>
  );
}

export default function PerformanceDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const logout = useMutation(api.performanceAuth.logout);
  const touchSession = useMutation(api.performanceAuth.touchSession);

  useEffect(() => {
    void touchSession({ token });
  }, [token, touchSession]);

  useEffect(() => {
    // Wait for the query to resolve before redirecting — a visitor with no
    // password cookie may still resolve via their linked Clerk identity, so
    // "no cookie" alone isn't grounds to bounce to the login page.
    if (session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [session, router]);

  // Employee logins have their own detail page — this layout is the admin
  // team view.
  useEffect(() => {
    if (!session?.valid || session.permissions.includes("view_all_employees")) return;
    if (session.employeeId) {
      router.replace(`/performance/mitarbeiter/${session.employeeId}`);
    }
  }, [session, router]);

  function exit() {
    if (token) void logout({ token });
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid) return null;

  if (!session.permissions.includes("view_all_employees")) {
    if (session.employeeId) return null; // redirecting
    return (
      <div className="min-h-screen bg-muted/20">
        <PerformanceHeader onExit={session.viaClerk ? undefined : exit} />
        <main className="mx-auto max-w-3xl p-4 pb-24 md:p-6">
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle>{t("notLinkedTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </CardContent>
          </Card>
        </main>
        <PerformanceBottomTabs onExit={session.viaClerk ? undefined : exit} />
      </div>
    );
  }

  return (
    <PerformanceYmProvider>
      <DashboardChrome token={token} viaClerk={session.viaClerk} onExit={exit}>
        {children}
      </DashboardChrome>
    </PerformanceYmProvider>
  );
}
