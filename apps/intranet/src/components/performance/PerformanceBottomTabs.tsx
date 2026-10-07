"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowLeft, Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { BottomNavTabButtons, useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { usePerformanceNav } from "@/components/performance/usePerformanceNav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ROW = "flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent";

/**
 * Mobile tab switcher for Performance's RouteTabs pages, plus the Menu sheet
 * holding everything `PerformanceHeader` hides on mobile. Same pill+Menu look
 * as the intranet's `BottomNav`, but self-contained: Performance lives
 * outside the `(app)` shell, so it can't reuse that or its Sidebar sheet.
 */
export function PerformanceBottomTabs() {
  const t = useTranslations("Performance");
  const { tabs, activeValue } = useBottomNavTabs();
  const { items } = usePerformanceNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] print:hidden md:hidden">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background/90 p-1 shadow-lg shadow-black/30 backdrop-blur-xl [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <BottomNavTabButtons
            tabs={tabs ?? []}
            activeValue={activeValue}
            layoutId="performance-bottom-nav-active-tab"
          />
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
          {items.length > 0 && (
            <nav className="mt-3 flex flex-col border-b pb-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(ROW, item.active && "bg-muted font-medium")}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex flex-col py-2">
            <Link href="/" onClick={close} className={ROW}>
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              {t("backToIntranet")}
            </Link>
          </div>
          <div className="flex items-center gap-1 border-t pt-3">
            <PerformanceAccountMenu />
            <SettingsMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
