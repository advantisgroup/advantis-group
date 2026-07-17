"use client";

import Link from "next/link";

import { motion } from "framer-motion";

import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { cn } from "@/lib/utils";

/**
 * Mobile tab switcher for Performance's RouteTabs pages — the same visual
 * pattern as the intranet's global `BottomNav`, but self-contained.
 * Performance lives outside the Clerk-gated `(app)` shell (own auth, own
 * header, no sidebar/chat/announcements), so it can't reuse `BottomNav`
 * itself; it mounts its own `BottomNavTabsProvider` instance instead and
 * only ever renders the tab icons `RouteTabs` hands it.
 */
export function PerformanceBottomTabs() {
  const { tabs, activeValue } = useBottomNavTabs();
  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] print:hidden md:hidden">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background/90 p-1 shadow-lg shadow-black/30 backdrop-blur-xl [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.value === activeValue;
          return (
            <Link
              key={tab.value}
              href={tab.href}
              aria-label={tab.label}
              className={cn(
                "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
      </div>
    </div>
  );
}
