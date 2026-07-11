"use client";

import { useEffect } from "react";

import Link from "next/link";

import { type LucideIcon } from "lucide-react";

import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface RouteTab {
  value: string;
  href: string;
  label: string;
  icon: LucideIcon;
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
export function RouteTabs({
  tabs,
  activeValue,
}: {
  tabs: RouteTab[];
  activeValue: string;
}) {
  const isMobile = useIsMobile();
  const { setTabs } = useBottomNavTabs();

  useEffect(() => {
    if (!isMobile) return;
    setTabs(tabs, activeValue);
    return () => setTabs(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, tabs, activeValue]);

  if (isMobile) {
    return null;
  }

  return (
    <div className="inline-flex h-10 max-w-full items-center justify-center overflow-x-auto overscroll-x-contain rounded-lg border border-border/70 bg-muted/50 p-1 text-muted-foreground [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
      {tabs.map(tab => (
        <Link
          key={tab.value}
          href={tab.href}
          className={cn(
            "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.value === activeValue && "bg-card text-foreground shadow-sm"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
