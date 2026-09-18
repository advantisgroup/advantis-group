"use client";

import { createContext, useContext, type ReactNode } from "react";

import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";

export type EmployeeDetailData = FunctionReturnType<typeof api.performance.queries.employeeDetail>;

interface EmployeeDetailCtx {
  data: EmployeeDetailData | undefined;
}

const EmployeeDetailContext = createContext<EmployeeDetailCtx | null>(null);

/** Shares the `employeeDetail` query result between
 * mitarbeiter/[id]/(tabs)/layout.tsx (which already fetches it for the
 * header/month picker) and each tab page under it — ueberblick/entwicklung/
 * calls/topics all asked for the exact same `{ token, employeeId, ym }`
 * query themselves. Same rationale as `PerformanceDashboardContext`. */
export function PerformanceEmployeeDetailProvider({
  data,
  children,
}: {
  data: EmployeeDetailData | undefined;
  children: ReactNode;
}) {
  return (
    <EmployeeDetailContext.Provider value={{ data }}>{children}</EmployeeDetailContext.Provider>
  );
}

export function useEmployeeDetailData(): EmployeeDetailData | undefined {
  const ctx = useContext(EmployeeDetailContext);
  if (!ctx) {
    throw new Error("useEmployeeDetailData must be used within PerformanceEmployeeDetailProvider");
  }
  return ctx.data;
}
