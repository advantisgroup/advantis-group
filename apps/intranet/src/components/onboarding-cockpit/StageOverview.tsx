"use client";

import { inPrePool } from "@advantis/convex/performance/onboarding";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type CaseRow, itOpen, LADDER, useStatusName } from "./shared";

const BAR = ["prePool", ...LADDER, "winback"] as const;

/** Bar key of a case: "prePool" for new uploads not yet released. */
export function barKey(c: CaseRow, now: number): string {
  return c.status === "fresh" && inPrePool(c, now) ? "prePool" : c.status;
}

/**
 * The phases as one bar: Neu → In Kontakt → Karten bestellt → Getankt →
 * Abgeschlossen, plus Winback – with the counts. Under "In Kontakt" a small
 * "IT: n" (always shown) for open cases waiting on the IT, whatever their
 * phase. Clicking a phase (or the
 * IT count) filters the list below; clicking it again clears it. `large`
 * makes big tiles (consultants' "Meine Fälle", feedback 03.11.).
 * `showPrePool` (managers) adds "Pre-Pool" in front: new uploads that the
 * consultants only see from the third day on (13.11.).
 */
export function PhaseBar({
  cases,
  active,
  onPick,
  itActive = false,
  onPickIt,
  large = false,
  showPrePool = false,
}: {
  cases: CaseRow[];
  active: string | null;
  onPick: (phase: string | null) => void;
  itActive?: boolean;
  onPickIt?: (on: boolean) => void;
  large?: boolean;
  showPrePool?: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const statusName = useStatusName();
  const itCount = cases.filter(itOpen).length;
  const now = Date.now();
  const bar = BAR.filter((s) => s !== "prePool" || showPrePool);
  return (
    <div
      className={cn(
        "flex flex-wrap items-stretch gap-1 rounded-xl border border-border/70 bg-card p-1",
        large && "gap-1.5 p-1.5",
      )}
      role="group"
      aria-label={t("phase.barLabel")}
    >
      {bar.map((s, i) => {
        const count = cases.filter((c) => barKey(c, now) === s).length;
        const on = active === s;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            {s === "winback" && <span className="mx-1 h-6 w-px bg-border" aria-hidden />}
            <div
              className={cn(
                "flex min-w-[110px] flex-1 items-center gap-1 rounded-lg transition-colors",
                on && "bg-muted",
                s === "prePool" && "border border-dashed border-border",
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : s)}
                className={cn(
                  "flex flex-1 items-baseline justify-between gap-2 self-stretch rounded-lg px-3 py-2 text-left hover:bg-muted/60",
                  large && "flex-col items-start gap-1 px-4 py-3",
                )}
              >
                <span
                  className={cn(
                    "text-[12.5px] font-medium text-muted-foreground",
                    large && "text-sm",
                  )}
                >
                  {s === "prePool" ? t("prePool.label") : statusName(s)}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    large && "text-3xl",
                    s === "done" && count > 0 && "text-ok",
                    s === "winback" && count > 0 && "text-destructive",
                    (s === "step3" || s === "prePool") && "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
              {s === "step1" && onPickIt && (
                <button
                  type="button"
                  aria-pressed={itActive}
                  title={t("phase.itHint")}
                  onClick={() => onPickIt(!itActive)}
                  className={cn(
                    "mr-2 shrink-0 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10",
                    itCount === 0 && "border-border/70 bg-transparent text-muted-foreground",
                    itActive &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {t("phase.itCount", { count: itCount })}
                </button>
              )}
            </div>
            {i < bar.length - 2 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
