"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type CaseRow, STATUS_ORDER, useStatusName } from "./shared";

/**
 * The phases as one slim bar on the start page: Neu → In Kontakt → Karten
 * bestellt → Getankt → Abgeschlossen, plus Winback – just the counts.
 * Clicking a phase filters the list below; clicking it again clears it.
 */
export function PhaseBar({
  cases,
  active,
  onPick,
}: {
  cases: CaseRow[];
  active: string | null;
  onPick: (phase: string | null) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const statusName = useStatusName();
  return (
    <div
      className="flex flex-wrap items-stretch gap-1 rounded-xl border border-border/70 bg-card p-1"
      role="group"
      aria-label={t("phase.barLabel")}
    >
      {STATUS_ORDER.map((s, i) => {
        const count = cases.filter((c) => c.status === s).length;
        const on = active === s;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            {s === "winback" && <span className="mx-1 h-6 w-px bg-border" aria-hidden />}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : s)}
              className={cn(
                "flex min-w-[110px] flex-1 items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60",
                on && "bg-muted",
              )}
            >
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {statusName(s)}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  s === "done" && count > 0 && "text-ok",
                  s === "winback" && count > 0 && "text-destructive",
                  s === "step3" && "text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
            {i < STATUS_ORDER.length - 2 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
