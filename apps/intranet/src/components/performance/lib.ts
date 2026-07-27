/**
 * Pure date-range math for the Interaktionen tab's day/week/month period
 * filter — kept separate from `PeriodFilter.tsx` so it's trivially testable
 * and has no React dependency. All dates are UTC-midnight, same convention
 * as `PerformanceFormat.tsx`'s `fmtDayShort`/`fmtYm`.
 */

export type PeriodGranularity = "day" | "week" | "month";

export interface PeriodRange {
  start: string; // ISO "YYYY-MM-DD"
  end: string; // ISO "YYYY-MM-DD", inclusive
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayIso(): string {
  const now = new Date();
  return toIso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const sinceMonday = (day + 6) % 7;
  return new Date(d.getTime() - sinceMonday * 86_400_000);
}

/** Resolves an anchor date + granularity into the inclusive date range it
 * covers — a single day, its Mon–Sun week, or its calendar month. */
export function computePeriodRange(anchorIso: string, granularity: PeriodGranularity): PeriodRange {
  const anchor = parseIso(anchorIso);
  if (granularity === "day") {
    return { start: anchorIso, end: anchorIso };
  }
  if (granularity === "week") {
    const start = startOfWeek(anchor);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return { start: toIso(start), end: toIso(end) };
  }
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { start: toIso(start), end: toIso(end) };
}

/** Moves the anchor one day/week/month forward or back. */
export function shiftAnchor(
  anchorIso: string,
  granularity: PeriodGranularity,
  direction: 1 | -1,
): string {
  const anchor = parseIso(anchorIso);
  if (granularity === "day") {
    return toIso(new Date(anchor.getTime() + direction * 86_400_000));
  }
  if (granularity === "week") {
    return toIso(new Date(anchor.getTime() + direction * 7 * 86_400_000));
  }
  return toIso(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1)));
}
