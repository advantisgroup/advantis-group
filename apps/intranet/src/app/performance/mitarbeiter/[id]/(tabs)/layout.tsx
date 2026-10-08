"use client";

import { useEffect, type ReactNode } from "react";

import { useParams, usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  Activity,
  BatteryCharging,
  ClipboardCheck,
  LayoutDashboard,
  Phone,
  TrendingUp,
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
  employeeHome,
  type PerformanceDashboardKind,
  usePerformanceAccess,
} from "@/components/performance/PerformanceAccess";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceEmployeeDetailProvider } from "@/components/performance/PerformanceEmployeeDetailContext";
import { buildCallActivityChartData, fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import {
  PerformanceContentSkeleton,
  PerformancePageSkeleton,
} from "@/components/performance/PerformanceSkeleton";
import {
  PerformanceYmProvider,
  usePerformanceYm,
} from "@/components/performance/PerformanceYmContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmployeeTopData {
  hasCalls: boolean;
  days: {
    date: string;
    values: { callsAnswered?: number; callsOutbound?: number };
  }[];
  wonTrend: { days: { date: string; won: number }[]; avg: number };
}

/** Same tab-dependent top-of-page chart as the team dashboard's
 * `DashboardTopSection` ((dashboard)/layout.tsx) — the Calls tab promotes
 * its own "Call-Aktivität" chart up here instead of the closed-won trend
 * (see `calls/page.tsx`, which no longer renders it in the page body). */
function EmployeeTopSection({
  data,
  interactionDays,
  activeTab,
  kind,
  t,
  locale,
}: {
  data: EmployeeTopData;
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
  if (kind !== "sales" || activeTab === "checks") return null;
  return <ClosedWonTrendChart days={data.wonTrend.days} avg={data.wonTrend.avg} />;
}

/** Which tabs an employee page has, by the kind of their dashboard: Wallbox
 * and calls-only people have no Salesforce numbers, checks or badges. The
 * Checks tab replaced "Topics" (10/2026) and is for team leads/admins only. */
const TABS_BY_KIND: Record<PerformanceDashboardKind, readonly string[]> = {
  sales: ["ueberblick", "entwicklung", "calls", "checks", "interaktionen"],
  wallbox: ["wallbox", "calls", "interaktionen"],
  calls: ["calls", "interaktionen"],
};

function EmployeeChrome({
  employeeId,
  children,
}: {
  employeeId: Id<"performanceEmployees">;
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { me, dashboard } = usePerformanceAccess();
  const [ym, setYm] = usePerformanceYm();
  const data = useQuery(api.performance.queries.employeeDetail, { employeeId, ym });

  const activeTab = pathname.split("/").filter(Boolean)[3] ?? "ueberblick";
  // Until the detail loads: their own dashboard, else the one being viewed.
  const kind: PerformanceDashboardKind =
    data?.employee.kind ??
    me?.dashboards.find((d) => d.employeeId === employeeId)?.kind ??
    dashboard?.kind ??
    "sales";
  // Team lead of this employee's dashboard, or admin: sees the Checks tab.
  const canLead =
    !!me &&
    (me.isAdmin ||
      me.dashboards.some(
        (d) => d.canViewTeam && (!data || d.companyId === data.employee.companyId),
      ));
  const tabsForViewer = TABS_BY_KIND[kind].filter((tab) => tab !== "checks" || canLead);
  const offTab = !tabsForViewer.includes(activeTab);
  useEffect(() => {
    if (data && offTab) router.replace(employeeHome(employeeId, data.employee.kind));
  }, [data, offTab, employeeId, router]);
  // Only the Interaktionen tab shows the month's single interactions.
  const interactions = useQuery(
    api.performance.queries.interactionsMonth,
    activeTab === "interaktionen" ? { ym, employeeId } : "skip",
  );

  const allTabs: RouteTab[] = [
    {
      value: "wallbox",
      href: `/performance/mitarbeiter/${employeeId}/wallbox`,
      label: t("tabWallbox"),
      icon: BatteryCharging,
    },
    {
      value: "ueberblick",
      href: `/performance/mitarbeiter/${employeeId}/ueberblick`,
      label: t("tabOverview"),
      icon: LayoutDashboard,
    },
    {
      value: "entwicklung",
      href: `/performance/mitarbeiter/${employeeId}/entwicklung`,
      label: t("tabDevelopment"),
      icon: TrendingUp,
    },
    {
      value: "calls",
      href: `/performance/mitarbeiter/${employeeId}/calls`,
      label: t("tabCalls"),
      icon: Phone,
    },
    {
      value: "checks",
      href: `/performance/mitarbeiter/${employeeId}/checks`,
      label: t("checks.tabChecks"),
      icon: ClipboardCheck,
    },
    {
      value: "interaktionen",
      href: `/performance/mitarbeiter/${employeeId}/interaktionen`,
      label: t("tabInteractions"),
      icon: Activity,
    },
  ];
  const tabs = allTabs.filter((tab) => tabsForViewer.includes(tab.value));
  // Entwicklung shows every month, Interaktionen pages by day, Wallbox is
  // report snapshots.
  const usesMonth = !["entwicklung", "interaktionen", "wallbox", "checks"].includes(activeTab);

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{data?.employee.name}</h1>
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
        </div>

        {data && (
          <EmployeeTopSection
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

        <PerformanceEmployeeDetailProvider data={data}>
          {offTab ? <PerformanceContentSkeleton /> : children}
        </PerformanceEmployeeDetailProvider>
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}

export default function EmployeeDetailLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Performance");
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const { me } = usePerformanceAccess();

  // Rough client-side check so a plain employee opening someone else's link
  // gets a note instead of an error; the server decides exactly
  // (`performance/lib/access.ts`).
  const canView =
    !!me && (me.isAdmin || me.dashboards.some((d) => d.canViewTeam || d.employeeId === employeeId));

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
    <PerformanceYmProvider>
      <EmployeeChrome employeeId={employeeId}>{children}</EmployeeChrome>
    </PerformanceYmProvider>
  );
}
