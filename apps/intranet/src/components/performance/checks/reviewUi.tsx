"use client";

import {
  DeltaBadge,
  fmtDuration,
  fmtNum,
  fmtPct,
} from "@/components/performance/PerformanceFormat";

const PERCENT = new Set(["workableRate", "hitrate"]);
const LOWER_IS_BETTER = new Set(["overduesSum", "oppsOver30", "leadsNoAction14", "oppsNoAction14"]);

export function fmtReviewValue(key: string, v: number | null): string {
  if (key === "talkAvgSec") return fmtDuration(v);
  return PERCENT.has(key) ? fmtPct(v) : fmtNum(v);
}

/** Business-review cell: value, and its change against VM and VJ. */
export function ReviewCell({
  col,
  cur,
  vm,
  vj,
  plain = false,
}: {
  col: string;
  cur: number | null;
  vm: number | null;
  vj: number | null;
  /** Print: text deltas instead of coloured badges. */
  plain?: boolean;
}) {
  const d = (ref: number | null) =>
    cur !== null && ref !== null ? Math.round((cur - ref) * 10) / 10 : null;
  const format = PERCENT.has(col) ? "pts" : col === "talkAvgSec" ? "duration" : "num";
  const invert = LOWER_IS_BETTER.has(col);
  if (plain) {
    const txt = (v: number | null) =>
      v === null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNum(Math.abs(v))}`;
    return (
      <div className="text-right tabular-nums">
        <div className="font-semibold">{fmtReviewValue(col, cur)}</div>
        <div className="text-[9px] text-neutral-500">
          {txt(d(vm))} / {txt(d(vj))}
        </div>
      </div>
    );
  }
  return (
    <div className="text-right tabular-nums">
      <div className="font-medium">{fmtReviewValue(col, cur)}</div>
      <div className="flex justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          VM <DeltaBadge value={d(vm)} invert={invert} format={format} />
        </span>
        <span className="inline-flex items-center gap-0.5">
          VJ <DeltaBadge value={d(vj)} invert={invert} format={format} />
        </span>
      </div>
    </div>
  );
}
