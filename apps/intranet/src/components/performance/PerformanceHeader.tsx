"use client";

import { ArrowLeft, LogOut, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { usePerformanceCompany } from "@/components/performance/PerformanceCompanyProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface PerformanceHeaderNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Every action here (back to intranet, page-specific nav links, account,
 * settings, exit) is desktop-only — mobile shows just the wordmark. Those
 * same actions are reachable from `PerformanceBottomTabs`'s Menu sheet
 * instead, rather than a second copy crammed into this header (which used
 * to overflow past the viewport with no way to reach the cut-off buttons).
 */
export function PerformanceHeader({
  navItems = [],
  onExit,
}: {
  /** Page-specific links shown between "back to intranet" and the account
   * menus (e.g. "Users", "Upload", "My password") — already filtered by the
   * caller for admin/viaClerk visibility. Also passed to
   * `PerformanceBottomTabs` for the mobile Menu sheet. */
  navItems?: PerformanceHeaderNavItem[];
  /** Omit entirely for a Clerk-linked session, which has no Performance
   * session to sign out of. */
  onExit?: () => void;
}) {
  const t = useTranslations("Performance");
  // "Back to intranet" only makes sense on Advantis's own grandfathered
  // host — a client's own domain (e.g. salespirates.de) never has a
  // Clerk-gated intranet to go back to; `/` there just re-resolves to their
  // own Performance dashboard via proxy.ts, which is confusing, not useful.
  const onAdvantisHost = usePerformanceCompany() === null;

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
      <PerformanceWordmark className="shrink-0" />
      <div className="flex-1" />

      {/* Desktop only: grouped into "navigation" vs. "account" clusters,
       * separated by thin dividers. */}
      <div className="hidden items-center gap-3 md:flex">
        {onAdvantisHost && (
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToIntranet")}
            </Button>
          </Link>
        )}

        {navItems.length > 0 && (
          <>
            <div className="h-6 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button variant="ghost" size="sm" className="h-8">
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="h-6 w-px bg-border" aria-hidden />

        <div className="flex items-center gap-1">
          <PerformanceAccountMenu />
          <SettingsMenu />
          {onExit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onExit} aria-label={t("exit")}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("exit")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  );
}
