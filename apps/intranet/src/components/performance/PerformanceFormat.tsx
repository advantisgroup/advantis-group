import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

/** "–" for missing values, matching the reference script's placeholder for
 * "not measured". */
export function fmtNum(v: number | undefined | null): string {
  if (v === undefined || v === null) return "–";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    v
  );
}

export function fmtPct(v: number | undefined | null): string {
  if (v === undefined || v === null) return "–";
  return `${fmtNum(v)}%`;
}

export function fmtDuration(totalSeconds: number | undefined | null): string {
  if (!totalSeconds) return "–";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** "2026-07-16" -> "16.07" (locale-aware day/month, no year — for chart
 * axis labels where space is tight). */
export function fmtDayShort(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/** "2026-07" -> "July 2026" (locale-aware, UTC so it never shifts a day
 * across the month boundary). */
export function fmtYm(ym: string, locale: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Small colored delta indicator. `invert` flips which sign counts as
 * "good" — for metrics where lower is better (e.g. overdue counts). */
export function DeltaBadge({
  value,
  invert = false,
}: {
  value: number | undefined | null;
  invert?: boolean;
}) {
  if (value === undefined || value === null || value === 0) return null;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      )}
    >
      <Icon className="h-3 w-3" />
      {fmtNum(Math.abs(value))}
    </span>
  );
}
