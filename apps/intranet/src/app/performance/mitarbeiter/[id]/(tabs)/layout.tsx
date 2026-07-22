"use client";

import { useEffect, type ReactNode } from "react";

import { useParams, usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  LayoutDashboard,
  ListTodo,
  Phone,
  TrendingUp,
  Upload,
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
import {
  buildCallActivityChartData,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import {
  PerformanceYmProvider,
  usePerformanceYm,
} from "@/components/performance/PerformanceYmContext";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearPerformanceToken } from "@/lib/performanceAuth";

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
  t,
  locale,
}: {
  data: EmployeeTopData;
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
  return (
    <ClosedWonTrendChart days={data.wonTrend.days} avg={data.wonTrend.avg} />
  );
}

function EmployeeChrome({
  token,
  employeeId,
  isAdmin,
  viaClerk,
  onExit,
  children,
}: {
  token: string;
  employeeId: Id<"performanceEmployees">;
  isAdmin: boolean;
  viaClerk: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const pathname = usePathname();
  const [ym, setYm] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.employeeDetail, {
    token,
    employeeId,
    ym,
  });
  const interactions = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    ym,
    employeeId,
  });

  const activeTab = pathname.split("/").filter(Boolean)[3] ?? "ueberblick";

  const tabs: RouteTab[] = [
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
      value: "topics",
      href: `/performance/mitarbeiter/${employeeId}/topics`,
      label: t("tabTopics"),
      icon: ListTodo,
      count: data?.topics.length,
    },
    {
      value: "interaktionen",
      href: `/performance/mitarbeiter/${employeeId}/interaktionen`,
      label: t("tabInteractions"),
      icon: Activity,
    },
  ];

  const navItems = [
    ...(isAdmin ? [{ href: "/performance", label: t("backToDashboard") }] : []),
    ...(isAdmin && !viaClerk
      ? [{ href: "/performance/upload", label: t("uploadLink"), icon: Upload }]
      : []),
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

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {data && (
          <EmployeeTopSection
            data={data}
            interactionDays={interactions?.days}
            activeTab={activeTab}
            t={t}
            locale={locale}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{data?.employee.name}</h1>
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
        </div>

        <Card className="overflow-hidden">
          <div className="px-2">
            <RouteTabs tabs={tabs} activeValue={activeTab} />
          </div>
        </Card>

        {children}
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}

export default function EmployeeDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const { token, session } = usePerformanceSession();
  const logout = useMutation(api.performanceAuth.logout);

  useEffect(() => {
    // Wait for the query to resolve — a visitor with no password cookie may
    // still resolve via their linked Clerk identity.
    if (session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const canView =
    session?.valid &&
    (session.role === "admin" || session.employeeId === employeeId);

  function exit() {
    if (token) void logout({ token });
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid) return null;
  if (!canView) {
    return (
      <div className="min-h-screen bg-muted/20">
        <PerformanceHeader onExit={session.viaClerk ? undefined : exit} />
        <main className="mx-auto max-w-3xl p-4 md:p-6">
          <Card>
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <PerformanceYmProvider>
      <EmployeeChrome
        token={token}
        employeeId={employeeId}
        isAdmin={!!isAdmin}
        viaClerk={session.viaClerk}
        onExit={exit}
      >
        {children}
      </EmployeeChrome>
    </PerformanceYmProvider>
  );
}
