"use client";

import { ArrowLeft, KeyRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { usePerformanceCompany } from "@/components/performance/PerformanceCompanyProvider";
import { usePerformanceNav } from "@/components/performance/usePerformanceNav";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Wordmark and section nav on the left, account actions on the right. Mobile
 * shows just the wordmark — the same nav and actions live in
 * `PerformanceBottomTabs`'s Menu sheet instead.
 */
export function PerformanceHeader() {
  const t = useTranslations("Performance");
  const { items, passwordHref, exit } = usePerformanceNav();
  // A client's own domain has no Clerk-gated intranet to go back to — `/`
  // there just re-resolves to their own Performance dashboard via proxy.ts.
  const onAdvantisHost = usePerformanceCompany() === null;

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

      <div className="hidden items-center gap-1 md:flex">
        {onAdvantisHost && (
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToIntranet")}
            </Button>
          </Link>
        )}
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        {passwordHref && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={passwordHref}>
                <Button variant="ghost" size="icon" aria-label={t("passwordLink")}>
                  <KeyRound className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>{t("passwordLink")}</TooltipContent>
          </Tooltip>
        )}
        <PerformanceAccountMenu />
        <SettingsMenu />
        {exit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={exit} aria-label={t("exit")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("exit")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
