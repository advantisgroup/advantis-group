"use client";

import { useSyncExternalStore } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Data basis of the Onboarding dashboard: every action of the month, or
 * only those on customers won (Close Won) in that month. Kept for the
 * browser session and shared by every tab. */
export type OnboardingBasis = "all" | "won";

const KEY = "performance_onboarding_basis";
const listeners = new Set<() => void>();

function read(): OnboardingBasis {
  try {
    return window.sessionStorage.getItem(KEY) === "won" ? "won" : "all";
  } catch {
    return "all";
  }
}

let current: OnboardingBasis | null = null;

function snapshot(): OnboardingBasis {
  if (current === null) current = typeof window === "undefined" ? "all" : read();
  return current;
}

function setBasis(next: OnboardingBasis) {
  current = next;
  try {
    window.sessionStorage.setItem(KEY, next);
  } catch {
    // Not persisted — harmless.
  }
  for (const l of listeners) l();
}

export function useOnboardingBasis(): [OnboardingBasis, (b: OnboardingBasis) => void] {
  const basis = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "all" as const,
  );
  return [basis, setBasis];
}

/** "Alle Aktionen im Monat | Nur Kunden gewonnen im Monat". */
export function OnboardingBasisToggle() {
  const t = useTranslations("Performance.onboarding");
  const [basis, set] = useOnboardingBasis();
  const option = (value: OnboardingBasis, label: string) => (
    <button
      type="button"
      onClick={() => set(value)}
      aria-pressed={basis === value}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        basis === value
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("basis.label")}</span>
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        {option("all", t("basis.all"))}
        {option("won", t("basis.won"))}
      </div>
    </div>
  );
}
