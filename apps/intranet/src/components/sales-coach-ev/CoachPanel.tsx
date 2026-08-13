"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { EV_CHECK_LABELS, PATH_LABELS } from "./constants";
import { type Hint, type Outcome } from "./types";

const HINT_STYLES: Record<Hint["type"], string> = {
  tip: "border-l-blue-500",
  good: "border-l-emerald-500",
  warn: "border-l-amber-500",
  miss: "border-l-orange-500",
  weak: "border-l-red-500",
};

const HINT_TAG_STYLES: Record<Hint["type"], string> = {
  tip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  miss: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  weak: "bg-red-500/10 text-red-600 dark:text-red-400",
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

  return (
    <div className="flex flex-col overflow-hidden border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{t("liveCoaching")}</span>
        <span className="font-normal normal-case tracking-normal">{hints.length}</span>
      </div>

      <div className="flex flex-wrap gap-2.5 border-b border-border px-3 py-2">
        {EV_CHECK_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full border border-border text-[9px] transition-colors",
                evChecks[i] && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {evChecks[i] ? <Check className="size-2.5" /> : i + 1}
            </span>
            <span className={cn(evChecks[i] && "text-muted-foreground/70")}>{label}</span>
          </div>
        ))}
      </div>

      {detectedPath > 0 && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] font-medium">
          <span className="text-muted-foreground">{t("pathLabel")}</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
            {PATH_LABELS[detectedPath]}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
        {thinking && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs italic text-muted-foreground">
            <span className="flex gap-0.5">
              <span className="size-1 animate-bounce rounded-full bg-amber-500 [animation-delay:0ms]" />
              <span className="size-1 animate-bounce rounded-full bg-amber-500 [animation-delay:180ms]" />
              <span className="size-1 animate-bounce rounded-full bg-amber-500 [animation-delay:360ms]" />
            </span>
            {t("aiAnalyzing")}
          </div>
        )}
        {hints.length === 0 && !thinking && (
          <div className="p-2.5 text-xs italic text-muted-foreground">{t("hintsEmpty")}</div>
        )}
        {hints.map((hint, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border border-border border-l-[3px] bg-muted/40 px-2.5 py-2 text-[13px] leading-relaxed",
              HINT_STYLES[hint.type],
            )}
          >
            <span className="float-right font-mono text-[10px] text-muted-foreground">
              {hint.time}
            </span>
            <div
              className={cn(
                "mb-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                HINT_TAG_STYLES[hint.type],
              )}
            >
              {hint.tag}
            </div>
            <div>{hint.text}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-muted/30 px-3.5 py-2.5">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("outcomeLabel")}
        </div>
        <div className="flex gap-1.5">
          {OUTCOME_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={outcome === opt.value ? "default" : "outline"}
              className="flex-1 text-[11px]"
              onClick={() => onOutcomeChange(opt.value)}
            >
              {t(opt.labelKey)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
