"use client";

import { useState } from "react";

import Link from "next/link";

import { motion } from "framer-motion";
import { ArrowLeft, LogOut, Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { usePerformanceCompany } from "@/components/performance/PerformanceCompanyProvider";
import { type PerformanceHeaderNavItem } from "@/components/performance/PerformanceHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Mobile tab switcher for Performance's RouteTabs pages, plus the mobile
 * equivalent of `PerformanceHeader`'s desktop-only nav/account/exit cluster
 * (the header shows only the wordmark on mobile — see its own comment).
 * Same visual pattern as the intranet's global `BottomNav`'s pill+Menu
 * button, but self-contained: Performance lives outside the Clerk-gated
 * `(app)` shell (own auth, own header, no sidebar/chat/announcements), so it
 * can't reuse `BottomNav` or the `Sidebar` sheet the main app's Menu button
 * opens — this owns its own `Sheet` instead.
 */
export function PerformanceBottomTabs({
  navItems = [],
  onExit,
}: {
  navItems?: PerformanceHeaderNavItem[];
  onExit?: () => void;
}) {
  const t = useTranslations("Performance");
  const { tabs, activeValue } = useBottomNavTabs();
  const [menuOpen, setMenuOpen] = useState(false);
  // "Back to intranet" only makes sense on Advantis's own grandfathered
  // host — a client's own domain (e.g. salespirates.de) never has a
  // Clerk-gated intranet to go back to; `/` there just re-resolves to their
  // own Performance dashboard via proxy.ts, which is confusing, not useful.
  const onAdvantisHost = usePerformanceCompany() === null;

  if ((!tabs || tabs.length === 0) && navItems.length === 0 && !onExit) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] print:hidden md:hidden">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background/90 p-1 shadow-lg shadow-black/30 backdrop-blur-xl [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs?.map((tab) => {
            const Icon = tab.icon;
            const active = tab.value === activeValue;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-label={tab.label}
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="performance-bottom-nav-active-tab"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 size-4" />
              </Link>
            );
          })}
          {tabs && tabs.length > 0 && (
            <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("menuLabel")}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl p-4">
          <SheetTitle>{t("menuLabel")}</SheetTitle>
          <div className="mt-4 flex items-center gap-1 border-b pb-3">
            <PerformanceAccountMenu />
            <SettingsMenu />
          </div>
          <nav className="flex flex-col py-2">
            {onAdvantisHost && (
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                {t("backToIntranet")}
              </Link>
            )}
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent"
              >
                {item.icon && <item.icon className="h-4 w-4 text-muted-foreground" />}
                {item.label}
              </Link>
            ))}
          </nav>
          {onExit && (
            <Button
              variant="ghost"
              className="justify-start gap-3 px-2 text-destructive hover:text-destructive"
              onClick={() => {
                setMenuOpen(false);
                onExit();
              }}
            >
              <LogOut className="h-4 w-4" />
              {t("exit")}
            </Button>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
