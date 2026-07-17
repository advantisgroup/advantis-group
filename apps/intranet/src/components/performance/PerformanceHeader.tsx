"use client";

import { useRouter } from "next/navigation";

import { ArrowLeft, LogOut, Menu, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PerformanceHeaderNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Every Performance page's header used to inline its own row of text-label
 * buttons (back to intranet, page-specific links, exit) alongside the two
 * icon-first menus (account, settings) — on mobile that's 5-7 items in one
 * unwrapped `flex` row, which overflows past the viewport with no way to
 * reach the cut-off buttons. This collapses everything but the two compact
 * icon menus into a single dropdown below the `md` breakpoint, keeping the
 * exact same actions reachable through one trigger instead of a horizontal
 * scroll or squeeze. Desktop keeps the original inline row unchanged.
 */
export function PerformanceHeader({
  navItems = [],
  onExit,
}: {
  /** Page-specific links shown between "back to intranet" and the account
   * menus (e.g. "Users", "Upload", "My password") — already filtered by the
   * caller for admin/viaClerk visibility. */
  navItems?: PerformanceHeaderNavItem[];
  /** Omit entirely for a Clerk-linked session, which has no Performance
   * session to sign out of. */
  onExit?: () => void;
}) {
  const t = useTranslations("Performance");
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
      <PerformanceWordmark className="shrink-0" />
      <div className="flex-1" />

      {/* Desktop: the full row inline, same as before. */}
      <div className="hidden items-center gap-2 md:flex">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToIntranet")}
          </Button>
        </Link>
        {navItems.map(item => (
          <Link key={item.href} href={item.href}>
            <Button variant="ghost" size="sm">
              {item.icon && <item.icon className="mr-2 h-4 w-4" />}
              {item.label}
            </Button>
          </Link>
        ))}
        <PerformanceAccountMenu />
        <SettingsMenu />
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("exit")}
          </Button>
        )}
      </div>

      {/* Mobile: collapse every text-label action into one menu; the account
       * and settings menus stay put since they're already single-icon
       * triggers, not part of the overflow problem. */}
      <div className="flex items-center gap-1 md:hidden">
        <PerformanceAccountMenu />
        <SettingsMenu />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("menuLabel")}>
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToIntranet")}
            </DropdownMenuItem>
            {navItems.length > 0 && <DropdownMenuSeparator />}
            {navItems.map(item => (
              <DropdownMenuItem
                key={item.href}
                onClick={() => router.push(item.href)}
              >
                {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                {item.label}
              </DropdownMenuItem>
            ))}
            {onExit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onExit}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("exit")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
