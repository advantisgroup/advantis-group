"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { getLastPerformanceYm, setLastPerformanceYm } from "@/lib/performance";

type YmState = [ym: string | undefined, setYm: (ym: string) => void];

const YmContext = createContext<YmState | null>(null);

/** Shares the selected month between a RouteTabs layout's header (the
 * Select control) and each tab's page — Next.js layouts can't pass extra
 * props to `children`, so the month picker can't just be lifted state.
 * Falls back to the last month persisted via `getLastPerformanceYm` so a
 * direct link to one tab still shows the same month as the others. */
export function PerformanceYmProvider({ children }: { children: ReactNode }) {
  const [ym, setYmState] = useState<string | undefined>(() => getLastPerformanceYm());
  function setYm(v: string) {
    setYmState(v);
    setLastPerformanceYm(v);
  }
  return <YmContext.Provider value={[ym, setYm]}>{children}</YmContext.Provider>;
}

export function usePerformanceYm(): YmState {
  const ctx = useContext(YmContext);
  if (!ctx) {
    throw new Error("usePerformanceYm must be used within PerformanceYmProvider");
  }
  return ctx;
}
