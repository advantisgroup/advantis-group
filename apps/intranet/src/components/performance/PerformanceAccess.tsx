"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";

export type PerformanceMe = FunctionReturnType<typeof api.performance.access.me>;
export type PerformanceDashboard = PerformanceMe["dashboards"][number];

interface PerformanceAccessValue {
  /** `undefined` while loading. */
  me: PerformanceMe | undefined;
  /** The dashboard currently shown — the one picked in the header, or the
   * viewer's default. `null` once loaded when they have none. */
  dashboard: PerformanceDashboard | null;
  selectDashboard: (companyId: Id<"companies">) => void;
}

const STORAGE_KEY = "performance_dashboard";

function readStored(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const PerformanceAccessContext = createContext<PerformanceAccessValue | null>(null);

/**
 * Who is looking and which dashboard they're on. Access is the intranet
 * sign-in itself — admins see every dashboard, a team lead their team's
 * view, everyone else only their own numbers (rules in Convex,
 * `performance/lib/access.ts`).
 */
export function PerformanceAccessProvider({ children }: { children: ReactNode }) {
  const me = useQuery(api.performance.access.me, {});
  const [selected, setSelected] = useState<string | null>(readStored);

  const selectDashboard = useCallback((companyId: Id<"companies">) => {
    setSelected(companyId);
    try {
      window.localStorage.setItem(STORAGE_KEY, companyId);
    } catch {
      // Private mode etc. — the choice just won't survive a reload.
    }
  }, []);

  const value = useMemo<PerformanceAccessValue>(() => {
    const dashboards = me?.dashboards ?? [];
    const dashboard =
      dashboards.find((d) => d.companyId === selected) ??
      dashboards.find((d) => d.canViewTeam) ??
      dashboards.find((d) => d.employeeId) ??
      dashboards[0] ??
      null;
    return { me, dashboard, selectDashboard };
  }, [me, selected, selectDashboard]);

  return (
    <PerformanceAccessContext.Provider value={value}>{children}</PerformanceAccessContext.Provider>
  );
}

export function usePerformanceAccess(): PerformanceAccessValue {
  const value = useContext(PerformanceAccessContext);
  if (!value) throw new Error("usePerformanceAccess must be used inside PerformanceAccessProvider");
  return value;
}

export type PerformanceDashboardKind = PerformanceDashboard["kind"];

/** The team view's first tab: a calls-only dashboard has no Überblick. */
export function teamHome(kind: PerformanceDashboardKind): string {
  return kind === "calls" ? "/performance/calls" : "/performance/ueberblick";
}

/** An employee page's first tab for the kind of dashboard they're on. */
export function employeeHome(employeeId: string, kind: PerformanceDashboardKind): string {
  const tab = kind === "wallbox" ? "wallbox" : kind === "calls" ? "calls" : "ueberblick";
  return `/performance/mitarbeiter/${employeeId}/${tab}`;
}

/** Where "Dashboard" leads for this viewer on the current dashboard. */
export function dashboardHome(dashboard: PerformanceDashboard | null): string {
  if (dashboard?.canViewTeam) return teamHome(dashboard.kind);
  if (dashboard?.employeeId) return employeeHome(dashboard.employeeId, dashboard.kind);
  return "/performance";
}
