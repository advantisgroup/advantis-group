"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Download,
  LayoutDashboard,
  LogOut,
  Phone,
  Upload,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { BackToIntranetLink } from "@/components/performance/BackToIntranetLink";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { fmtYm } from "@/components/performance/PerformanceFormat";
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

function DashboardChrome({
  token,
  name,
  viaClerk,
  onExit,
  children,
}: {
  token: string;
  name: string;
  viaClerk: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const pathname = usePathname();
  const [ym, setYm] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });

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
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <BackToIntranetLink />
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">{name}</span>
        <Link href="/performance/benutzer">
          <Button variant="ghost" size="sm">
            <Users className="mr-2 h-4 w-4" />
            {t("usersLink")}
          </Button>
        </Link>
        {!viaClerk && (
          <Link href="/performance/upload">
            <Button variant="ghost" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              {t("uploadLink")}
            </Button>
          </Link>
        )}
        {!viaClerk && (
          <Link href="/performance/passwort">
            <Button variant="ghost" size="sm">
              {t("passwordLink")}
            </Button>
          </Link>
        )}
        <PerformanceAccountMenu />
        <SettingsMenu />
        {!viaClerk && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("exit")}
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
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
    if (!session?.valid || session.role === "admin") return;
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

  if (session.role !== "admin") {
    if (session.employeeId) return null; // redirecting
    return (
      <div className="min-h-screen bg-muted/20">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <PerformanceWordmark />
          <BackToIntranetLink />
          <div className="flex-1" />
          <PerformanceAccountMenu />
          <SettingsMenu />
          {!session.viaClerk && (
            <Button variant="ghost" size="sm" onClick={exit}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("exit")}
            </Button>
          )}
        </header>
        <main className="mx-auto max-w-3xl p-4 md:p-6">
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle>{t("notLinkedTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              {t("notLinkedBody")}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <PerformanceYmProvider>
      <DashboardChrome
        token={token}
        name={session.name}
        viaClerk={session.viaClerk}
        onExit={exit}
      >
        {children}
      </DashboardChrome>
    </PerformanceYmProvider>
  );
}
