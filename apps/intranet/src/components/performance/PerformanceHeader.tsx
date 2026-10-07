"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { DashboardSwitcher } from "@/components/performance/DashboardSwitcher";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { usePerformanceNav } from "@/components/performance/usePerformanceNav";
import { ViewAsControl } from "@/components/performance/ViewAsControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Wordmark and section nav on the left, dashboard picker and account
 * actions on the right. Mobile shows the wordmark and picker — nav and
 * actions live in `PerformanceBottomTabs`'s Menu sheet instead.
 */
export function PerformanceHeader() {
  const t = useTranslations("Performance");
  const { items } = usePerformanceNav();
  const { me } = usePerformanceAccess();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/90 px-4 backdrop-blur">
      <PerformanceWordmark className="shrink-0" />

      {items.length > 0 && (
        <nav className="hidden items-center gap-0.5 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                item.active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      {me?.canViewAs && !me.live && (
        <Badge
          variant="warning"
          className="hidden shrink-0 sm:inline-flex"
          title={t("adminsOnlyHint")}
        >
          {t("adminsOnlyBadge")}
        </Badge>
      )}
      <ViewAsControl className="max-w-[40vw]" />
      <DashboardSwitcher className="max-w-[45vw]" />

      <div className="hidden items-center gap-1 md:flex">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToIntranet")}
          </Button>
        </Link>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <PerformanceAccountMenu />
        <SettingsMenu />
      </div>
    </header>
  );
}
