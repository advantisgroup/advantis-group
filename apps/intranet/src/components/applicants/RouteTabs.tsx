"use client";

import { useEffect } from "react";

import Link from "next/link";

import { type LucideIcon } from "lucide-react";

import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { useSetPageHeaderTabs } from "@/components/layout/PageHeaderBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDesignPreview } from "@/lib/design-preview";
import { cn } from "@/lib/utils";

export interface RouteTab {
  value: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count badge next to the label (e.g. open appointments). */
  count?: number;
}

/**
 * URL-driven equivalent of `Tabs`/`TabsList`/`TabsTrigger` — each "tab" is a
 * real link to its own route rather than client-only state, so the active
 * tab is bookmarkable/shareable. Below the mobile breakpoint it renders
 * nothing itself and instead hands its tabs to the global `BottomNav`
 * (`useBottomNavTabs`), which shows them as icon-only entries in its
 * floating pill — the bottom nav becomes the tab switcher rather than a
 * separate dropdown.
 */
export function RouteTabs({ tabs, activeValue }: { tabs: RouteTab[]; activeValue: string }) {
  const isMobile = useIsMobile();
  const { setTabs } = useBottomNavTabs();
  const setHeaderTabs = useSetPageHeaderTabs();
  const inHeader = useDesignPreview() === "refreshed" && !isMobile;

  // Refreshed design: on desktop the tabs sit as pills beside the page title.
  useEffect(() => {
    if (!inHeader) return;
    setHeaderTabs({ tabs, activeValue });
    return () => setHeaderTabs(null);
  }, [inHeader, setHeaderTabs, tabs, activeValue]);

  useEffect(() => {
    if (!isMobile) return;
    // BottomNav only ever reads `label` as an aria-label (it renders icons
    // only), so folding the count into it here keeps that contract exactly
    // as it was before tabs could carry a separate `count` field.
    const mobileTabs = tabs.map((tab) => ({
      ...tab,
      label: tab.count !== undefined ? `${tab.label} (${tab.count})` : tab.label,
    }));
    setTabs(mobileTabs, activeValue);
    return () => setTabs(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, tabs, activeValue]);

  if (isMobile || inHeader) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-border/70 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.value === activeValue;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            className={cn(
              "relative flex shrink-0 select-none items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                  active
                    ? "bg-primary/10 text-primary refreshed:bg-foreground refreshed:text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
            <span
              className={cn(
                "absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors",
                active ? "bg-primary refreshed:bg-foreground" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}
