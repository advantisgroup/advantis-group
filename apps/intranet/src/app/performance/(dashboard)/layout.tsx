"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Activity,
  ClipboardList,
  Download,
  LayoutDashboard,
  Phone,
  Presentation,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { FilterableBarChart } from "@/components/charts/FilterableBarChart";
import { CHART } from "@/components/charts/theme";
import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";
import { ClosedWonTrendChart } from "@/components/performance/ClosedWonTrendChart";
import {
  LastDayInteractions,
  type LastDayInteractionRow,
} from "@/components/performance/LastDayInteractions";
import {
  dashboardHome,
  type PerformanceDashboard,
  type PerformanceDashboardKind,
  teamHome,
  usePerformanceAccess,
} from "@/components/performance/PerformanceAccess";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePerformanceApi } from "@/lib/performance";

const CALLS_ONLY_TABS = new Set(["calls", "team", "interaktionen"]);

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
  kind,
  t,
  locale,
}: {
  data: DashboardTopData;
  interactionDays: LastDayInteractionRow[] | undefined;
  activeTab: string;
  kind: PerformanceDashboardKind;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  if (activeTab === "calls") {
    if (!data.hasCalls) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboardCallActivity")}</CardTitle>
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
    const chartData = data.loggedIn.map((d) => ({
      label: fmtDayShort(d.date, locale),
      count: d.count,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboardLoggedInTitle")}</CardTitle>
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
  // Monitoring and the business review have their own content only.
  if (activeTab === "monitoring" || activeTab === "business-review") return null;
  // The Entwicklung tab already shows a closed-won trend chart itself
  // (over its own trailing-3-month window) further down the page — no
  // top-of-page chart needed here too.
  if (activeTab === "entwicklung") return null;
  // Closed won is Salesforce data; Wallbox shows its own numbers below.
  if (kind !== "sales") return null;
  return <ClosedWonTrendChart days={data.wonTrend.days} avg={data.wonTrend.avg} />;
}

const SOURCES = ["lead", "opp", "call", "interactions"] as const;
/** Wallbox and calls-only dashboards get no Salesforce exports. */
const CALL_SOURCES = ["call", "interactions"] as const;
const SOURCE_LABEL = {
  lead: "dataStatusLead",
  opp: "dataStatusOpp",
  call: "dataStatusCall",
  interactions: "dataStatusInteractions",
} as const;

/** "Datenstand" per source, so one that stopped arriving stands out: a
 * source more than a day behind the newest one is shown in warning colour. */
function DataStatusLine({
  status,
  kind,
}: {
  status: Record<(typeof SOURCES)[number], string | null>;
  kind: PerformanceDashboardKind;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const sources: readonly (typeof SOURCES)[number][] = kind === "sales" ? SOURCES : CALL_SOURCES;
  const newest = sources
    .map((s) => status[s])
    .reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null);
  if (!newest) return null;
  const dayBefore = new Date(Date.parse(`${newest}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>{t("dataStatusLabel")}:</span>
      {sources
        .filter((s) => status[s])
        .map((s) => {
          const stale = status[s]! < dayBefore;
          const label = `${t(SOURCE_LABEL[s])} ${fmtDayShort(status[s]!, locale)}`;
          return stale ? (
            <InfoTip key={s} text={t("dataStatusStale")}>
              <span className="font-medium text-warn">{label}</span>
            </InfoTip>
          ) : (
            <span key={s}>{label}</span>
          );
        })}
    </span>
  );
}

function DashboardChrome({
  dashboard,
  children,
}: {
  dashboard: PerformanceDashboard;
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const pathname = usePathname();
  const performanceApi = usePerformanceApi();
  const [ym, setYm] = usePerformanceYm();
  const companyId = dashboard.companyId;
  const data = useQuery(api.performance.queries.teamDashboard, { companyId, ym });

  const activeTab = pathname.split("/").filter(Boolean)[1] ?? "ueberblick";
  // A whole month of single interactions is heavy — only load it on the tab
  // that shows it.
  const interactions = useQuery(
    api.performance.queries.interactionsMonth,
    activeTab === "interaktionen" ? { companyId, ym } : "skip",
  );

  const kind = dashboard.kind;
  const allTabs: RouteTab[] = [
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
  // Checks, Monitoring and the business review are about the Salesforce KPIs.
  if (kind === "sales") {
    allTabs.push(
      {
        value: "monitoring",
        href: "/performance/monitoring",
        label: t("checks.tabMonitoring"),
        icon: ClipboardList,
      },
      {
        value: "business-review",
        href: "/performance/business-review",
        label: t("checks.tabReview"),
        icon: Presentation,
      },
    );
  }
  const tabs = kind === "calls" ? allTabs.filter((tab) => CALLS_ONLY_TABS.has(tab.value)) : allTabs;

  // Entwicklung always shows the last 3 months and Interaktionen has its own
  // period filter — a month picker there would only mislead. Wallbox's
  // Überblick and Entwicklung are report snapshots, not months.
  const usesMonth =
    kind === "sales"
      ? !["entwicklung", "interaktionen", "monitoring", "business-review"].includes(activeTab)
      : activeTab === "calls" || activeTab === "team";

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          {usesMonth && (
            <>
              <Select
                value={ym ?? data?.ym ?? ""}
                onValueChange={(v) => setYm(v)}
                disabled={!data || data.months.length === 0}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t("dashboardMonthLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {[...(data?.months ?? [])].reverse().map((m) => (
                    <SelectItem key={m} value={m}>
                      {fmtYm(m, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data && (
                <Badge variant={data.monthDone ? "muted" : "success"}>
                  {data.monthDone ? t("dashboardMonthClosed") : t("dashboardMonthOpen")}
                </Badge>
              )}
            </>
          )}
          {data && <DataStatusLine status={data.dataStatus} kind={kind} />}
          {kind === "sales" && usesMonth && data && data.snaps.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void performanceApi.download(
                  `/performance/export?ym=${data.ym}&companyId=${companyId}`,
                  `performance-${data.ym}.xlsx`,
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
            kind={kind}
            t={t}
            locale={locale}
          />
        )}

        <Card className="overflow-hidden">
          <div className="px-2">
            <RouteTabs tabs={tabs} activeValue={activeTab} inline />
          </div>
        </Card>

        <PerformanceDashboardDataProvider data={data}>{children}</PerformanceDashboardDataProvider>
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}

export default function PerformanceDashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, dashboard } = usePerformanceAccess();
  const activeTab = pathname.split("/").filter(Boolean)[1] ?? "ueberblick";
  // A calls-only dashboard has no Überblick or Entwicklung.
  const offTab = dashboard?.kind === "calls" && !CALLS_ONLY_TABS.has(activeTab);

  // People without the team view have their own detail page instead.
  useEffect(() => {
    if (dashboard && !dashboard.canViewTeam && dashboard.employeeId) {
      router.replace(dashboardHome(dashboard));
    } else if (dashboard?.canViewTeam && offTab) {
      router.replace(teamHome(dashboard.kind));
    }
  }, [dashboard, offTab, router]);

  if (me === undefined) return <PerformancePageSkeleton />;
  if (!dashboard?.canViewTeam) {
    if (dashboard?.employeeId) return null; // redirecting
    return <NoDashboard />;
  }
  if (offTab) return <PerformancePageSkeleton />;

  return (
    <PerformanceYmProvider>
      {/* Remount on dashboard switch so month and tab state start fresh. */}
      <DashboardChrome key={dashboard.companyId} dashboard={dashboard}>
        {children}
      </DashboardChrome>
    </PerformanceYmProvider>
  );
}

/** Signed in, but nothing to show: not on a team with a dashboard yet, or
 * no report name linked to this person. */
function NoDashboard() {
  const t = useTranslations("Performance");
  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />
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
      <PerformanceBottomTabs />
    </div>
  );
}
