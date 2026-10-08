/**
 * The fixed KPI list of the employee check and the KPI check (Jörg Endres,
 * 10/2026): month value with previous month (VM) and previous year (VJ),
 * plus the running calendar week (Mo–So). Pure functions over report rows,
 * no Convex imports — `checks.ts` reads the rows and freezes the result into
 * each saved check.
 *
 * The Salesforce figures in `performanceReports` are month-to-date counters
 * per upload day (`leadsCreated`, `workableCreated`, `wonMonth`), so a week
 * is the counter at its last day minus the counter the day before it
 * started — split at a month boundary, where the counter restarts.
 */
import { parseReasons } from "./kpi";
import { type ReportRow } from "./reports";
import { parseISODate, toISODate } from "./workdays";

/** Order and keys of the check's KPI rows. */
export const CHECK_KPIS = [
  { key: "leads", label: "Leads", unit: "count", week: true },
  { key: "workable", label: "Workable", unit: "count", week: true },
  { key: "unqualified", label: "Unqualified Reasons", unit: "count", week: true },
  { key: "workableRate", label: "Workable Rate", unit: "percent", week: true },
  { key: "won", label: "Closed Won", unit: "count", week: true },
  { key: "wonPerDay", label: "Closed Won Ø pro Tag", unit: "perDay", week: false },
  { key: "callsPerDay", label: "Calls Ø pro Tag", unit: "perDay", week: true },
  { key: "analysis30", label: "Leads Analyse > 30 Tage", unit: "count", week: false },
  { key: "opps30", label: "Opportunities > 30 Tage", unit: "count", week: false },
  { key: "randomFirstCall", label: "Stichprobe First Call", unit: "check", week: false },
  { key: "randomCallNotes", label: "Stichprobe Einträge in den Calls", unit: "check", week: false },
  { key: "randomContactChain", label: "Stichprobe Kontaktkette", unit: "check", week: false },
] as const;

export type CheckKpiKey = (typeof CHECK_KPIS)[number]["key"];
export const CHECK_KPI_KEYS: readonly string[] = CHECK_KPIS.map((k) => k.key);

export interface CheckKpiRow {
  key: string;
  month: number | null;
  vm: number | null;
  vj: number | null;
  week: number | null;
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface CheckKpis {
  /** Day the figures are as of (newest data, at most today). */
  asOf: string;
  ym: string;
  week: { start: string; end: string; missingDays: string[] };
  rows: CheckKpiRow[];
  reasons: { month: ReasonCount[]; week: ReasonCount[] };
}

const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + n * DAY_MS));
}

/** Monday of the calendar week containing `iso`. */
export function weekStart(iso: string): string {
  const d = parseISODate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(iso, -dow);
}

function lastDayOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

type CounterKey = "leadsCreated" | "workableCreated" | "wonMonth";

/** The month-to-date counter as of `date`: the newest row of `date`'s month
 * up to that day that measured it, 0 before the first one. */
function counterAt(rows: readonly ReportRow[], key: CounterKey, date: string): number | null {
  const ym = date.slice(0, 7);
  let best: ReportRow | undefined;
  for (const r of rows) {
    if (r[key] === undefined || r.reportDate > date || r.reportDate.slice(0, 7) !== ym) continue;
    if (!best || r.reportDate > best.reportDate) best = r;
  }
  return best ? (best[key] ?? 0) : null;
}

/** A month-to-date counter's increase over [start, end], summed per month
 * the range touches. Null when no row in range measured it at all. */
export function counterOverRange(
  rows: readonly ReportRow[],
  key: CounterKey,
  start: string,
  end: string,
): number | null {
  if (!rows.some((r) => r[key] !== undefined && r.reportDate >= start && r.reportDate <= end)) {
    return null;
  }
  let total = 0;
  let from = start;
  while (from <= end) {
    const monthEnd = lastDayOfMonth(from);
    const to = monthEnd < end ? monthEnd : end;
    const atEnd = counterAt(rows, key, to) ?? 0;
    const dayBefore = addDays(from, -1);
    const atStart =
      dayBefore.slice(0, 7) === from.slice(0, 7) ? (counterAt(rows, key, dayBefore) ?? 0) : 0;
    total += Math.max(0, atEnd - atStart);
    from = addDays(to, 1);
  }
  return total;
}

function reasonsAt(rows: readonly ReportRow[], date: string): Map<string, number> {
  const ym = date.slice(0, 7);
  let best: ReportRow | undefined;
  for (const r of rows) {
    if (r.unqualifiedReasons === undefined || r.reportDate > date) continue;
    if (r.reportDate.slice(0, 7) !== ym) continue;
    if (!best || r.reportDate > best.reportDate) best = r;
  }
  const out = new Map<string, number>();
  for (const { reason, count } of parseReasons(best?.unqualifiedReasons ?? "")) {
    out.set(reason, (out.get(reason) ?? 0) + count);
  }
  return out;
}

/** Unqualified reasons added over [start, end] (month-to-date texts diffed). */
export function reasonsOverRange(
  rows: readonly ReportRow[],
  start: string,
  end: string,
): ReasonCount[] {
  const sum = new Map<string, number>();
  let from = start;
  while (from <= end) {
    const monthEnd = lastDayOfMonth(from);
    const to = monthEnd < end ? monthEnd : end;
    const atEnd = reasonsAt(rows, to);
    const dayBefore = addDays(from, -1);
    const atStart =
      dayBefore.slice(0, 7) === from.slice(0, 7) ? reasonsAt(rows, dayBefore) : new Map();
    for (const [reason, count] of atEnd) {
      const diff = count - (atStart.get(reason) ?? 0);
      if (diff > 0) sum.set(reason, (sum.get(reason) ?? 0) + diff);
    }
    from = addDays(to, 1);
  }
  return sortReasons(sum);
}

export function sortReasons(counts: Map<string, number>): ReasonCount[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "de"));
}

export function reasonsTotal(reasons: readonly ReasonCount[]): number {
  return reasons.reduce((a, r) => a + r.count, 0);
}

/** Calls per day with calls over [start, end] (day values summed). */
export function callsPerDayOverRange(
  rows: readonly ReportRow[],
  start: string,
  end: string,
): number | null {
  let calls = 0;
  let days = 0;
  for (const r of rows) {
    if (r.reportDate < start || r.reportDate > end) continue;
    const c = r.callsToday ?? 0;
    if (c > 0) {
      calls += c;
      days++;
    }
  }
  return days ? Math.round((calls / days) * 10) / 10 : null;
}

export function percent(num: number | null, den: number | null): number | null {
  if (num === null || !den) return null;
  return Math.round((1000 * num) / den) / 10;
}

/** Traffic light of a check row. */
export type Rating = "green" | "yellow" | "red";

/** Due-date colour of an open action (Jörg: green ≤ 7 days, orange ≤ 2
 * days, red overdue; anything later or undated is neutral). */
export function dueTone(
  dueDate: string | undefined,
  today: string,
): "overdue" | "soon" | "week" | "later" | "none" {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  const days = Math.round(
    (parseISODate(dueDate).getTime() - parseISODate(today).getTime()) / DAY_MS,
  );
  if (days <= 2) return "soon";
  if (days <= 7) return "week";
  return "later";
}

/** A monthly employee check covers 4 weeks; the next one is due then. */
export const CHECK_INTERVAL_DAYS = 28;
