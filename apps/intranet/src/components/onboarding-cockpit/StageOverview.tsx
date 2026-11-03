"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type CaseRow, itOpen, LADDER, useStatusName } from "./shared";

const BAR = [...LADDER, "winback"] as const;

/**
 * The phases as one bar: Neu → In Kontakt → Karten bestellt → Getankt →
 * Abgeschlossen, plus Winback – with the counts. Under "In Kontakt" a small
 * "davon IT: n" for open cases waiting on the IT. Clicking a phase (or the
 * IT count) filters the list below; clicking it again clears it. `large`
 * makes big tiles (consultants' "Meine Fälle", feedback 03.11.).
 */
export function PhaseBar({
  cases,
  active,
  onPick,
  itActive = false,
  onPickIt,
  large = false,
}: {
  cases: CaseRow[];
  active: string | null;
  onPick: (phase: string | null) => void;
  itActive?: boolean;
  onPickIt?: (on: boolean) => void;
  large?: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const statusName = useStatusName();
  const itCount = cases.filter(itOpen).length;
  return (
    <div
      className={cn(
        "flex flex-wrap items-stretch gap-1 rounded-xl border border-border/70 bg-card p-1",
        large && "gap-1.5 p-1.5",
      )}
      role="group"
      aria-label={t("phase.barLabel")}
    >
      {BAR.map((s, i) => {
        const count = cases.filter((c) => c.status === s).length;
        const on = active === s;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            {s === "winback" && <span className="mx-1 h-6 w-px bg-border" aria-hidden />}
            <div
              className={cn(
                "flex min-w-[110px] flex-1 flex-col rounded-lg transition-colors",
                on && "bg-muted",
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : s)}
                className={cn(
                  "flex flex-1 items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/60",
                  large && "flex-col items-start gap-1 px-4 py-3",
                )}
              >
                <span
                  className={cn(
                    "text-[12.5px] font-medium text-muted-foreground",
                    large && "text-sm",
                  )}
                >
                  {statusName(s)}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    large && "text-3xl",
                    s === "done" && count > 0 && "text-ok",
                    s === "winback" && count > 0 && "text-destructive",
                    s === "step3" && "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
              {s === "step1" && onPickIt && itCount > 0 && (
                <button
                  type="button"
                  aria-pressed={itActive}
                  onClick={() => onPickIt(!itActive)}
                  className={cn(
                    "mx-2 mb-1.5 self-start rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10",
                    itActive &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {t("phase.itCount", { count: itCount })}
                </button>
              )}
            </div>
            {i < BAR.length - 2 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
