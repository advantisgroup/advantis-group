"use client";

import { createContext, useContext, type ReactNode } from "react";

import { type TeamDashboardData } from "@/components/performance/TeamTable";

interface DashboardDataCtx {
  data: TeamDashboardData | undefined;
}

const DashboardDataContext = createContext<DashboardDataCtx | null>(null);

/** Shares the team dashboard's `teamDashboard` query result between
 * (dashboard)/layout.tsx (which already fetches it for the month picker and
 * top-of-page chart) and each tab page under it — ueberblick/team/calls all
 * asked for the exact same `{ token, ym }` query themselves, so the fetch
 * (and the badge/team-totals recomputation behind it — see
 * performanceQueries.ts's `allBadgesMap`) ran once per mounted tab instead of
 * once for the whole layout subtree. Convex dedupes identical live
 * subscriptions, so this wasn't a double network cost, but it's needless
 * duplicate query wiring. `interaktionen`'s own page keeps its own
 * `interactionsMonth` query — it filters by an independent period range, not
 * the layout's `ym`, so it's a genuinely different query, not a duplicate. */
export function PerformanceDashboardDataProvider({
  data,
  children,
}: {
  data: TeamDashboardData | undefined;
  children: ReactNode;
}) {
  return <DashboardDataContext.Provider value={{ data }}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData(): TeamDashboardData | undefined {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error("useDashboardData must be used within PerformanceDashboardDataProvider");
  }
  return ctx.data;
}
