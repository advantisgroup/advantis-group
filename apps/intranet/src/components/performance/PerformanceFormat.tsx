import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

/** "–" for missing values, matching the reference script's placeholder for
 * "not measured". */
export function fmtNum(v: number | undefined | null): string {
  if (v === undefined || v === null) return "–";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(v);
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

/** Same as `fmtDuration`, but keeps seconds precision for values under a
 * minute — most individual interactions are shorter than that, and
 * "0m" would otherwise hide the actual duration. */
export function fmtDurationPrecise(totalSeconds: number | undefined | null): string {
  if (totalSeconds === undefined || totalSeconds === null) return "–";
  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

export interface CallActivityChartDay {
  label: string;
  answered: number;
  outbound: number;
  [key: string]: string | number;
}

/** Shapes a Calls-tab day list (`teamDashboard`/`employeeDetail`'s `days`)
 * into the "Call-Aktivität" chart's data — shared between the Calls page
 * body and the dashboard chrome's promoted top-of-page chart so both read
 * the same fields the same way. */
export function buildCallActivityChartData(
  days: {
    date: string;
    values: { callsAnswered?: number; callsOutbound?: number };
  }[],
  locale: string,
): CallActivityChartDay[] {
  return days.map((d) => ({
    label: fmtDayShort(d.date, locale),
    answered: d.values.callsAnswered ?? 0,
    outbound: d.values.callsOutbound ?? 0,
  }));
}

/** Epoch ms carrying a wall-clock time-of-day as UTC fields (see
 * `interactionImport.ts`'s timestamp parsing) -> "07:40". Uses the UTC
 * getters directly rather than a locale/timezone conversion, since the
 * value was never really UTC to begin with — just stamped that way to
 * avoid guessing a timezone the source data doesn't carry. */
export function fmtTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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

/** How a delta's magnitude is shown: a plain count, percentage points
 * (rates) or a duration (seconds in, "1h 5m" out). */
export type DeltaFormat = "num" | "pts" | "duration";

function fmtDeltaMagnitude(abs: number, format: DeltaFormat): string {
  if (format === "duration") return fmtDurationPrecise(abs);
  if (format === "pts") return `${fmtNum(abs)} Pkt.`;
  return fmtNum(abs);
}

/** Small colored delta indicator. `invert` flips which sign counts as
 * "good" — for metrics where lower is better (e.g. overdue counts). */
export function DeltaBadge({
  value,
  invert = false,
  format = "num",
}: {
  value: number | undefined | null;
  invert?: boolean;
  format?: DeltaFormat;
}) {
  if (value === undefined || value === null || value === 0) return null;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        good ? "text-ok" : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3" />
      {fmtDeltaMagnitude(Math.abs(value), format)}
    </span>
  );
}

/** "VM ↑X.X · VJ ↓Y.Y" pair — the standard month-over-month/year-over-year
 * comparison shown under most Performance KPI values. */
export function DeltaPair({
  dVm,
  dVj,
  format,
}: {
  dVm: number | undefined;
  dVj: number | undefined;
  format?: DeltaFormat;
}) {
  return <DeltaTriple dVm={dVm} dVj={dVj} dTeam={undefined} format={format} />;
}

/** "VM ↑X.X · VJ ↓Y.Y · Ø Team ↑Z.Z" — the employee detail's KPI cards
 * additionally compare against this month's team average, alongside the
 * usual VM/VJ. */
export function DeltaTriple({
  dVm,
  dVj,
  dTeam,
  format,
}: {
  dVm: number | undefined;
  dVj: number | undefined;
  dTeam: number | undefined;
  format?: DeltaFormat;
}) {
  if (dVm === undefined && dVj === undefined && dTeam === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {dVm !== undefined && (
        <span className="inline-flex items-center gap-1">
          VM <DeltaBadge value={dVm} format={format} />
        </span>
      )}
      {dVj !== undefined && (
        <span className="inline-flex items-center gap-1">
          VJ <DeltaBadge value={dVj} format={format} />
        </span>
      )}
      {dTeam !== undefined && (
        <span className="inline-flex items-center gap-1">
          Ø Team <DeltaBadge value={dTeam} format={format} />
        </span>
      )}
    </div>
  );
}
