"use client";

import type { ReactNode } from "react";

import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import {
  PerformanceSidebar,
  type PerformanceSidebarNavItem,
} from "@/components/performance/PerformanceSidebar";
import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * Performance's shell: a sidebar + slim top header, mirroring the main
 * intranet's `AppShell`/`Sidebar` look (same `@/components/ui/sidebar`
 * primitives) without actually nesting under `(app)/layout.tsx` — Performance
 * has its own password-based login (see `usePerformanceSession.ts`) that a
 * visitor with no Clerk session at all still needs to reach, and `AppGate`
 * has no bypass for that (it just spins forever waiting for a Clerk sign-in
 * that will never come). So this is a parallel shell built from the same
 * pieces, not a relocation into the real one — same idea as `/admin/activity`
 * getting its own sliding sidebar panel, just one level further out since
 * Performance can't share `(app)`'s `AppGate`/`SidebarProvider` at all.
 *
 * Replaces the old full-width `PerformanceHeader` (nav links + account menu
 * crammed into one bar, collapsing to a dropdown on mobile) — those same
 * nav links now live in the sidebar, and account/settings/logout sit in its
 * footer instead.
 */
export function PerformanceShell({
  navItems,
  onExit,
  children,
}: {
  navItems: PerformanceSidebarNavItem[];
  onExit?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar ariaLabel="Performance">
        <SidebarHeader>
          <PerformanceWordmark />
        </SidebarHeader>
        <PerformanceSidebar navItems={navItems} onExit={onExit} />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border/70 bg-background/70 px-2.5 backdrop-blur-xl print:hidden md:h-16 md:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-6 md:px-8 md:pt-8">
          {children}
        </main>
      </SidebarInset>
      <PerformanceBottomTabs />
    </SidebarProvider>
  );
}
