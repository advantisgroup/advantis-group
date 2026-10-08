"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { DeltaBadge, fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Rating = "green" | "yellow" | "red";
export type DueTone = "overdue" | "soon" | "week" | "later" | "none";

/** The check's KPI rows (order and units match `lib/checkKpis.ts`). */
export const CHECK_KPI_META: Record<
  string,
  { unit: "count" | "percent" | "perDay" | "check"; lowerIsBetter?: boolean; week: boolean }
> = {
  leads: { unit: "count", week: true },
  workable: { unit: "count", week: true },
  unqualified: { unit: "count", lowerIsBetter: true, week: true },
  workableRate: { unit: "percent", week: true },
  won: { unit: "count", week: true },
  wonPerDay: { unit: "perDay", week: false },
  callsPerDay: { unit: "perDay", week: true },
  analysis30: { unit: "count", lowerIsBetter: true, week: false },
  opps30: { unit: "count", lowerIsBetter: true, week: false },
  randomFirstCall: { unit: "check", week: false },
  randomCallNotes: { unit: "check", week: false },
  randomContactChain: { unit: "check", week: false },
};

export function fmtKpi(value: number | null | undefined, key: string): string {
  const unit = CHECK_KPI_META[key]?.unit ?? "count";
  if (unit === "check") return "";
  return unit === "percent" ? fmtPct(value) : fmtNum(value);
}

/** "06.10." from an ISO day. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

/** Value with its change against a reference (VM/VJ). */
export function KpiCompare({
  value,
  reference,
  kpiKey,
}: {
  value: number | null;
  reference: number | null;
  kpiKey: string;
}) {
  const meta = CHECK_KPI_META[kpiKey];
  if (meta?.unit === "check") return null;
  const delta =
    value !== null && reference !== null ? Math.round((value - reference) * 10) / 10 : null;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="text-muted-foreground">{fmtKpi(reference, kpiKey)}</span>
      <DeltaBadge
        value={delta}
        invert={meta?.lowerIsBetter}
        format={meta?.unit === "percent" ? "pts" : "num"}
      />
    </span>
  );
}

const RATING_STYLE: Record<Rating, { on: string; off: string }> = {
  green: { on: "bg-ok text-white border-ok", off: "border-ok/40 text-ok" },
  yellow: { on: "bg-warn text-white border-warn", off: "border-warn/40 text-warn" },
  red: {
    on: "bg-destructive text-white border-destructive",
    off: "border-destructive/40 text-destructive",
  },
};

/** Traffic light: three round toggles, clicking the active one clears it. */
export function RatingPicker({
  value,
  onChange,
}: {
  value: Rating | undefined;
  onChange: (next: Rating | undefined) => void;
}) {
  const t = useTranslations("Performance.checks");
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t("colRating")}>
      {(["green", "yellow", "red"] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          aria-label={t(`rating.${r}`)}
          title={t(`rating.${r}`)}
          onClick={() => onChange(value === r ? undefined : r)}
          className={cn(
            "h-6 w-6 rounded-full border-2 transition-colors",
            value === r
              ? RATING_STYLE[r].on
              : cn("bg-transparent opacity-60 hover:opacity-100", RATING_STYLE[r].off),
          )}
        />
      ))}
    </div>
  );
}

/** Read-only dot for print and lists. */
export function RatingDot({ rating }: { rating: Rating | undefined }) {
  if (!rating) return <span className="text-muted-foreground">–</span>;
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 rounded-full",
        rating === "green" ? "bg-ok" : rating === "yellow" ? "bg-warn" : "bg-destructive",
      )}
    />
  );
}

export function RatingCounts({ counts }: { counts: Record<Rating, number> }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums">
      {(["green", "yellow", "red"] as const).map((r) =>
        counts[r] ? (
          <span key={r} className="inline-flex items-center gap-1">
            <RatingDot rating={r} />
            {counts[r]}
          </span>
        ) : null,
      )}
    </span>
  );
}

const TONE_STYLE: Record<DueTone, string> = {
  overdue: "bg-destructive/15 text-destructive",
  soon: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  week: "bg-ok/15 text-ok",
  later: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

/** Due date coloured like Jörg asked: red overdue, orange ≤ 2 days, green
 * ≤ 7 days, neutral otherwise. */
export function DueBadge({ dueDate, tone }: { dueDate: string | null; tone: DueTone }) {
  const t = useTranslations("Performance.checks");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        TONE_STYLE[tone],
      )}
      title={t(`tone.${tone}`)}
    >
      {dueDate ? fmtDay(dueDate) : t("tone.none")}
    </span>
  );
}

export interface ActionDraft {
  id?: string;
  kpiKey?: string;
  text: string;
  dueDate?: string;
  done: boolean;
}

/** Editable list of agreements/measures: text, due date, done. */
export function ActionListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
}: {
  items: ActionDraft[];
  onChange: (next: ActionDraft[]) => void;
  addLabel: string;
  placeholder?: string;
}) {
  const t = useTranslations("Performance.checks");
  const update = (i: number, patch: Partial<ActionDraft>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
          <Checkbox
            checked={item.done}
            onCheckedChange={(v) => update(i, { done: v === true })}
            aria-label={t("done")}
          />
          <Input
            value={item.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder={placeholder}
            className={cn("min-w-48 flex-1", item.done && "text-muted-foreground line-through")}
          />
          <span className="text-xs text-muted-foreground">{t("due")}</span>
          <Input
            type="date"
            value={item.dueDate ?? ""}
            onChange={(e) => update(i, { dueDate: e.target.value || undefined })}
            className="w-40"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={t("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { text: "", done: false }])}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
