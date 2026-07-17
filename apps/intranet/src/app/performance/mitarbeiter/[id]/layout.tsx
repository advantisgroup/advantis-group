"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useParams, usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  LayoutDashboard,
  ListTodo,
  LogOut,
  Phone,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import {
  PerformanceYmProvider,
  usePerformanceYm,
} from "@/components/performance/PerformanceYmContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

function EmployeeChrome({
  token,
  employeeId,
  isAdmin,
  onExit,
  children,
}: {
  token: string;
  employeeId: Id<"performanceEmployees">;
  isAdmin: boolean;
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
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <div className="flex-1" />
        {isAdmin && (
          <>
            <Link href="/performance">
              <Button variant="ghost" size="sm">
                {t("backToDashboard")}
              </Button>
            </Link>
            <Link href="/performance/upload">
              <Button variant="ghost" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                {t("uploadLink")}
              </Button>
            </Link>
          </>
        )}
        <Link href="/performance/passwort">
          <Button variant="ghost" size="sm">
            {t("passwordLink")}
          </Button>
        </Link>
        <SettingsMenu />
        <Button variant="ghost" size="sm" onClick={onExit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
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
  const [token] = useState<string | null>(() => getPerformanceToken());

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );
  const logout = useMutation(api.performanceAuth.logout);

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

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
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <PerformanceWordmark />
          <div className="flex-1" />
          <SettingsMenu />
          <Button variant="ghost" size="sm" onClick={exit}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("exit")}
          </Button>
        </header>
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
        token={token!}
        employeeId={employeeId}
        isAdmin={!!isAdmin}
        onExit={exit}
      >
        {children}
      </EmployeeChrome>
    </PerformanceYmProvider>
  );
}
