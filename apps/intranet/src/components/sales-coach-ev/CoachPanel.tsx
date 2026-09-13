"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiThinking } from "@/components/ai/AiThinking";
import { cn } from "@/lib/utils";

import { EV_CHECK_LABELS, PATH_LABELS } from "./constants";
import { type Hint, type Outcome } from "./types";

const HINT_DOT: Record<Hint["type"], string> = {
  tip: "bg-info",
  good: "bg-success",
  warn: "bg-warning",
  miss: "bg-warning",
  weak: "bg-destructive",
};

const OUTCOME_OPTIONS: { value: Outcome; labelKey: string }[] = [
  { value: "termin", labelKey: "outcomeTermin" },
  { value: "wiedervorlage", labelKey: "outcomeWiedervorlage" },
  { value: "kein_ergebnis", labelKey: "outcomeKeinErgebnis" },
];

export function CoachPanel({
  evChecks,
  detectedPath,
  hints,
  thinking,
  outcome,
  onOutcomeChange,
}: {
  evChecks: boolean[];
  detectedPath: number;
  hints: Hint[];
  thinking: boolean;
  outcome: Outcome | null;
  onOutcomeChange: (o: Outcome) => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const done = evChecks.filter(Boolean).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border/70 px-4 py-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("checklistTitle")}</span>
            <span className="tabular-nums">
              {done}/{EV_CHECK_LABELS.length}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {EV_CHECK_LABELS.map((label, i) => (
              <li key={label} className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border border-border transition-colors",
                    evChecks[i] && "border-success bg-success text-white",
                  )}
                >
                  {evChecks[i] && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span className={cn("truncate", evChecks[i] && "text-muted-foreground")}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {detectedPath > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {t("pathLabel")}{" "}
            <span className="font-medium text-foreground">{PATH_LABELS[detectedPath]}</span>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {thinking && <AiThinking label={t("aiAnalyzing")} className="px-1 py-1 text-xs" />}
        {hints.length === 0 && !thinking && (
          <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
            {t("hintsEmpty")}
          </p>
        )}
        {hints.map((hint, i) => (
          <article
            key={`${hint.time}-${i}`}
            className="rounded-xl border border-border/70 bg-card px-3.5 py-2.5"
          >
            <header className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("size-1.5 shrink-0 rounded-full", HINT_DOT[hint.type])} />
              <span className="font-medium text-foreground">{hint.tag}</span>
              <span className="ml-auto font-mono tabular-nums">{hint.time}</span>
            </header>
            <p className="text-[13.5px] leading-relaxed">{hint.text}</p>
          </article>
        ))}
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <p className="mb-2 text-xs text-muted-foreground">{t("outcomeLabel")}</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={outcome === opt.value}
              onClick={() => onOutcomeChange(opt.value)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                outcome === opt.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
