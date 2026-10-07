"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type YmState = [ym: string | undefined, setYm: (ym: string) => void];

const YmContext = createContext<YmState | null>(null);

// The picked month is remembered for this browser session only, so moving
// between the team dashboard and employee pages keeps it, but the next day
// starts on the server's default (the current month, or the previous one
// until the current has data) instead of a month picked last week.
const SESSION_KEY = "performance_ym";

function readSessionYm(): string | undefined {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Shares the selected month between a RouteTabs layout's header (the
 * Select control) and each tab's page — Next.js layouts can't pass extra
 * props to `children`, so the month picker can't just be lifted state. */
export function PerformanceYmProvider({ children }: { children: ReactNode }) {
  const [ym, setYmState] = useState<string | undefined>(() =>
    typeof window === "undefined" ? undefined : readSessionYm(),
  );
  function setYm(v: string) {
    setYmState(v);
    try {
      window.sessionStorage.setItem(SESSION_KEY, v);
    } catch {
      // Not persisted — harmless.
    }
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
