/**
 * KPI math for the Performance dashboards, ported from the reference
 * script's KPI section (rates, forecast, deltas, benchmarks, alert/
 * highlight scoring, badges, high/low-performer marks).
 *
 * Pure functions only — no `ctx.db` access. The reports are day snapshots
 * with month-cumulative values ("Monatswert = jüngster Snapshot des
 * Mitarbeiters in diesem Monat", per the source); fetching the right rows
 * for a month and turning them into `Snapshot`s is `performanceQueries.ts`'s
 * job, which then calls into this file for the arithmetic.
 */
import {
  forecast as workdayForecast,
  isWorkday,
  parseISODate,
  todayUTC,
  toISODate,
  workdaysBetween,
  type Forecast,
} from "./workdays";
import { type MetricFields } from "./types";

export interface Snapshot extends Partial<MetricFields> {
  employeeId: string;
  name: string;
  reportDate: string | null;
  unqualifiedReasons?: string;
  // Added by `enrich`.
  workableRate?: number;
  hitrate?: number;
  overduesSum?: number;
  // Added by `addForecast`.
  fc?: EmployeeForecast;
  fc1?: number;
  wonPerDay?: number;
  // Set only by `employeeHistory`-style callers.
  ym?: string;
}

export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
  return { start: toISODate(start), end: toISODate(end) };
}
const monthBoundsISO = monthBounds;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function rate(
  num: number | undefined,
  den: number | undefined
): number | undefined {
  if (num === undefined || !den) return undefined;
  return round1((100 * num) / den);
}

/** Sum ignoring undefined ("not measured"); undefined if nothing present. */
function nsum(values: (number | undefined)[]): number | undefined {
  const vals = values.filter((v): v is number => v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
}

/** Adds computed rates/sums to a snapshot. */
export function enrich(snap: Snapshot): Snapshot {
  return {
    ...snap,
    workableRate: rate(snap.workableCreated, snap.leadsCreated),
    hitrate: rate(snap.wonMonth, snap.workableCreated),
    overduesSum: nsum([snap.overduesAnalysis, snap.overduesOpps]),
  };
}

/** Workdays of the month up to `asOf` with no call report at all —
 * `presentDates` is the set of report dates that *do* have `callsToday`
 * measured (fetched by the caller). Distinguishes a missing report from
 * an individual employee's day off. */
export function missingCallDays(
  ym: string,
  asOf: Date,
  presentDates: ReadonlySet<string>
): Date[] {
  const { start, end } = monthBoundsISO(ym);
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);
  const last = asOf.getTime() < endDate.getTime() ? asOf : endDate;
  const missing: Date[] = [];
  for (
    let d = startDate;
    d.getTime() <= last.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    if (isWorkday(d) && !presentDates.has(toISODate(d))) missing.push(d);
  }
  return missing;
}

function formatDDMM(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
}

export interface EmployeeForecast extends Omit<Forecast, "perDay" | "fc1"> {
  perDay: number | undefined;
  fc1: number | undefined;
  basis: "Arbeitstage" | "Werktage";
  incomplete: boolean;
  missingDays: string[];
}

/**
 * Adds the FC1 (Closed Won) forecast to a snapshot.
 *
 * Employee (`workedDays` set): basis is worked days — days call activity
 * actually happened. A day with no call counts as off; remaining days to
 * month-end are assumed to be workdays (Mon–Fri, no nationwide holiday).
 *
 * Team, or a month with no call data: basis is the month's workdays.
 */
export function addForecast(
  snap: Snapshot,
  ym: string,
  workedDays?: number,
  missingDays?: Date[]
): Snapshot {
  const asOf = snap.reportDate ? parseISODate(snap.reportDate) : todayUTC();
  const value = snap.wonMonth;

  let fc: EmployeeForecast;
  if (workedDays) {
    const { end } = monthBoundsISO(ym);
    const endDate = parseISODate(end);
    const remaining =
      asOf.getTime() < endDate.getTime()
        ? workdaysBetween(new Date(asOf.getTime() + 86_400_000), endDate)
        : 0;
    const total = workedDays + remaining;
    const perDay = value !== undefined ? round2(value / workedDays) : undefined;
    let fc1: number | undefined;
    if (value === undefined) {
      fc1 = undefined;
    } else if (remaining === 0) {
      fc1 = value; // completed month: actual = forecast
    } else {
      fc1 = perDay !== undefined ? Math.round(perDay * total) : undefined;
    }
    // A hint only when a workday has no report at all — an individual's
    // day off isn't a data problem.
    const missing = missingDays ?? [];
    fc = {
      total,
      elapsed: workedDays,
      remaining,
      perDay,
      fc1,
      isActual: remaining === 0,
      basis: "Arbeitstage",
      incomplete: missing.length > 0,
      missingDays: missing.map(formatDDMM),
    };
  } else {
    const wt = workdayForecast(value ?? null, ym, asOf);
    fc = {
      ...wt,
      perDay: wt.perDay ?? undefined,
      fc1: wt.fc1 ?? undefined,
      basis: "Werktage",
      incomplete: false,
      missingDays: [],
    };
  }
  return { ...snap, fc, fc1: fc.fc1, wonPerDay: fc.perDay };
}

/** Keys deltas/benchmarks are computed over: every metric plus the
 * computed rates. */
const DELTA_KEYS: (keyof Snapshot)[] = [
  "leadsCreated",
  "workableCreated",
  "leadsAnalysis",
  "leadsDetailsIdent",
  "oppsOpen",
  "oppsClose7d",
  "oppsPending",
  "wonMonth",
  "callsToday",
  "overduesAnalysis",
  "overduesOpps",
  "oppsOver30",
  "leadsNoAction14",
  "oppsNoAction14",
  "callsAnswered",
  "callsOutbound",
  "talkTotalSec",
  "talkAvgSec",
  "loginSec",
  "workableRate",
  "hitrate",
  "fc1",
  "wonPerDay",
];

/** Anything deltas/benchmarks can be computed over: a full `Snapshot`, or a
 * plain per-KPI record like `computeTeamBenchmark`'s return value. */
export type DeltaSource = Snapshot | Record<string, number | undefined>;

function numField(
  snap: DeltaSource | undefined,
  key: string
): number | undefined {
  if (!snap) return undefined;
  const v = (snap as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

/** Per-KPI difference (undefined if either value is missing). */
export function computeDeltas(
  cur: DeltaSource | undefined,
  ref: DeltaSource | undefined
): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const k of DELTA_KEYS) {
    const c = numField(cur, k);
    const r = numField(ref, k);
    out[k] = c !== undefined && r !== undefined ? round1(c - r) : undefined;
  }
  return out;
}

export function shiftYm(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** KPIs compared as a real team value (sum/sum) rather than a per-employee
 * average — for rates, an average of individual rates would be skewed by
 * small denominators. */
const AGGREGATE_KEYS = new Set<keyof Snapshot>([
  "workableRate",
  "hitrate",
  "talkAvgSec",
]);

/** Comparison baseline per KPI for the month: rates as the real team
 * value, quantities as the per-employee average. `total` must already be
 * `enrich`ed. */
export function computeTeamBenchmark(
  total: Snapshot,
  snaps: Snapshot[]
): Record<string, number | undefined> {
  const bench: Record<string, number | undefined> = {};
  for (const k of DELTA_KEYS) {
    if (AGGREGATE_KEYS.has(k)) {
      bench[k] = numField(total, k);
      continue;
    }
    const vals = snaps
      .map(s => numField(s, k))
      .filter((v): v is number => v !== undefined);
    bench[k] = vals.length
      ? round2(vals.reduce((a, b) => a + b, 0) / vals.length)
      : undefined;
  }
  return bench;
}

/** 'Preis: 3; Kein Bedarf: 2' -> [{reason: 'Preis', count: 3}, ...],
 * summed across employees and sorted by count descending. */
export function aggregateReasons(
  texts: (string | undefined)[]
): { reason: string; count: number }[] {
  const agg = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    for (const part of t.split(/[;,\n]+/)) {
      const p = part.trim();
      if (!p) continue;
      const m = /^(.+?)[:=]\s*(\d+)\s*$/.exec(p);
      if (m) {
        const key = m[1].trim();
        agg.set(key, (agg.get(key) ?? 0) + Number(m[2]));
      } else {
        agg.set(p, (agg.get(p) ?? 0) + 1);
      }
    }
  }
  return [...agg.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));
}

// --------------------------------------------------- alerts & highlights
// Every employee is compared against the month's team average and their
// own previous month. The strongest deviations surface as alerts
// (negative) or highlights (positive).

interface SignalDef {
  key: keyof Snapshot;
  label: string;
  kind: "pct" | "count";
  invert: boolean;
  weight: number;
  baseField: keyof Snapshot | null;
  minBase: number;
}

// The base field guards against false signals: someone with no
// opportunities trivially has no overdues either — that's a missing basis,
// not a highlight.
const SIGNAL_DEFS: SignalDef[] = [
  {
    key: "workableRate",
    label: "Workable Rate",
    kind: "pct",
    invert: false,
    weight: 1.4,
    baseField: "leadsCreated",
    minBase: 5,
  },
  {
    key: "hitrate",
    label: "Hitrate",
    kind: "pct",
    invert: false,
    weight: 1.4,
    baseField: "workableCreated",
    minBase: 5,
  },
  {
    key: "wonMonth",
    label: "Closed Won",
    kind: "count",
    invert: false,
    weight: 1.2,
    baseField: "workableCreated",
    minBase: 1,
  },
  {
    key: "wonPerDay",
    label: "Won je Werktag",
    kind: "count",
    invert: false,
    weight: 1.0,
    baseField: "workableCreated",
    minBase: 1,
  },
  {
    key: "leadsCreated",
    label: "Leads erstellt",
    kind: "count",
    invert: false,
    weight: 0.9,
    baseField: null,
    minBase: 0,
  },
  {
    key: "workableCreated",
    label: "Workable erstellt",
    kind: "count",
    invert: false,
    weight: 0.9,
    baseField: null,
    minBase: 0,
  },
  {
    key: "callsToday",
    label: "Calls",
    kind: "count",
    invert: false,
    weight: 0.8,
    baseField: null,
    minBase: 0,
  },
  {
    key: "oppsOpen",
    label: "Opportunities offen",
    kind: "count",
    invert: false,
    weight: 0.6,
    baseField: null,
    minBase: 0,
  },
  {
    key: "overduesAnalysis",
    label: "Analysis >30 Tage",
    kind: "count",
    invert: true,
    weight: 1.2,
    baseField: "leadsAnalysis",
    minBase: 1,
  },
  {
    key: "overduesOpps",
    label: "Overdue Opportunities",
    kind: "count",
    invert: true,
    weight: 1.3,
    baseField: "oppsOpen",
    minBase: 1,
  },
  {
    key: "oppsOver30",
    label: "Opportunities >30 Tage",
    kind: "count",
    invert: true,
    weight: 1.0,
    baseField: "oppsOpen",
    minBase: 1,
  },
  {
    key: "leadsNoAction14",
    label: "Leads: Last Activity >2 Wo.",
    kind: "count",
    invert: true,
    weight: 1.1,
    baseField: "leadsAnalysis",
    minBase: 1,
  },
  {
    key: "oppsNoAction14",
    label: "Opps: Last Activity >2 Wo.",
    kind: "count",
    invert: true,
    weight: 1.1,
    baseField: "oppsOpen",
    minBase: 1,
  },
  {
    key: "oppsPending",
    label: "Opps: Pending Credit/Docs",
    kind: "count",
    invert: true,
    weight: 0.7,
    baseField: "oppsOpen",
    minBase: 1,
  },
];

const MIN_BASE = 5; // absolute floor for rates
const SIGNAL_THRESHOLD = 0.3; // a value below this score doesn't stand out

/** Minimum Workables for a hitrate to be meaningful — quarter of the
 * team's median for the month (so it scales with the month's size), floor
 * `MIN_BASE`. Guards against someone with few Workables but closes from
 * prior months' leads hitting an absurd rate (e.g. 6 Workables, 28 Won =
 * 467%). */
export function hitrateMinBase(snaps: Snapshot[]): number {
  const vals = snaps.map(s => s.workableCreated ?? 0).filter(v => v > 0);
  if (vals.length === 0) return MIN_BASE;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.max(MIN_BASE, Math.round(0.25 * median));
}

/** Comparison baseline per KPI: rates against the real team value
 * (sum/sum), quantities against the per-employee average. */
export function teamAverages(
  snaps: Snapshot[],
  total?: Snapshot
): Record<string, number | undefined> {
  const avg: Record<string, number | undefined> = {};
  for (const def of SIGNAL_DEFS) {
    const totalVal = numField(total, def.key);
    if (def.kind === "pct" && totalVal !== undefined) {
      avg[def.key] = totalVal;
      continue;
    }
    const vals = snaps
      .map(s => numField(s, def.key))
      .filter((v): v is number => v !== undefined);
    avg[def.key] = vals.length
      ? round2(vals.reduce((a, b) => a + b, 0) / vals.length)
      : undefined;
  }
  return avg;
}

function fmtNum(v: number | undefined): string {
  return v === undefined ? "–" : trimG(v);
}
/** Python's `f"{v:g}"` — general format, trailing zeros stripped. */
function trimG(v: number): string {
  return String(Number(v.toPrecision(6)));
}
function signedFixed1(v: number): string {
  const s = v.toFixed(1);
  return v >= 0 ? `+${s}` : s;
}
function signedG(v: number): string {
  return v >= 0 ? `+${trimG(v)}` : `-${trimG(-v)}`;
}

export interface Signal {
  key: string;
  label: string;
  value: number;
  unit: string;
  cmp: string;
  trend: { text: string; dir: "good" | "bad" } | null;
  score: number;
  invert: boolean;
}

/** Up to 3 alerts and 3 highlights, strongest first. */
export function employeeSignals(
  cur: Snapshot | undefined,
  avg: Record<string, number | undefined>,
  vm: Snapshot | undefined,
  hrBase?: number
): { alerts: Signal[]; highlights: Signal[] } {
  if (!cur) return { alerts: [], highlights: [] };
  const signals: Signal[] = [];

  for (const def of SIGNAL_DEFS) {
    const v = numField(cur, def.key);
    const t = avg[def.key];
    if (v === undefined || t === undefined) continue;

    let minBase = def.minBase;
    if (def.key === "hitrate" && hrBase) minBase = hrBase;
    if (def.baseField && (numField(cur, def.baseField) ?? 0) < minBase)
      continue;

    let diff: number;
    let rel: number;
    let cmpTxt: string;
    if (def.kind === "pct") {
      diff = v - t;
      rel = diff / 10.0; // 10 percentage points = 1 unit
      cmpTxt = `${fmtNum(v)} % · ${signedFixed1(diff)} Pkt. ggü. Team ${fmtNum(t)} %`;
    } else {
      diff = v - t;
      rel = diff / Math.max(t, 1.0);
      cmpTxt =
        t >= 1
          ? `${fmtNum(v)} vs. ${fmtNum(t)} im Teamschnitt (${(v / t).toFixed(1)}× · ${signedG(diff)})`
          : `${fmtNum(v)} vs. ${fmtNum(t)} im Teamschnitt`;
    }
    let score = Math.max(Math.min(rel, 3.0), -3.0) * def.weight;
    if (def.invert) score = -score;
    if (Math.abs(score) < SIGNAL_THRESHOLD) continue;

    // Trend to the previous month is extra context (nudges the score
    // slightly).
    let trend: Signal["trend"] = null;
    const vmVal = numField(vm, def.key);
    if (vmVal !== undefined) {
      const d = round1(v - vmVal);
      if (d) {
        const unit = def.kind === "pct" ? " Pkt." : "";
        const besser = def.invert ? d < 0 : d > 0;
        trend = {
          text: `${signedG(d)}${unit} ggü. Vormonat`,
          dir: besser ? "good" : "bad",
        };
        score += (besser ? 0.25 : -0.25) * def.weight;
      }
    }
    signals.push({
      key: def.key,
      label: def.label,
      value: v,
      unit: def.kind === "pct" ? "%" : "",
      cmp: cmpTxt,
      trend,
      score: Math.round(score * 1000) / 1000,
      invert: def.invert,
    });
  }
  const alerts = signals
    .filter(s => s.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const highlights = signals
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return { alerts, highlights };
}

// ------------------------------------------------------------------ badges
// Three awards per completed month. The current month never gets badges —
// awarding waits until the month is over.

export const BADGES = [
  {
    key: "hitrate",
    label: "Beste Hitrate",
    description: "Höchste Hitrate des Monats",
    unit: "%",
  },
  {
    key: "won",
    label: "Meiste Closed Won",
    description: "Meiste Abschlüsse des Monats",
    unit: "",
  },
  {
    key: "calls",
    label: "Meiste Calls",
    description: "Meiste Calls des Monats",
    unit: "",
  },
] as const;

/** These employees don't participate in badge awarding. They still appear
 * in every other view — only awards are withheld. */
export const BADGE_EXCLUDED = new Set(["andrea weber", "diana kaiser"]);

export function badgeEligible(name: string | undefined): boolean {
  return !BADGE_EXCLUDED.has((name ?? "").trim().toLowerCase());
}

export function monthCompleted(ym: string, today: Date = todayUTC()): boolean {
  const { end } = monthBoundsISO(ym);
  return parseISODate(end).getTime() < today.getTime();
}

export interface BadgeResult {
  value: number;
  winners: string[]; // employeeIds
}

/** Winner(s) per badge for a month. Ties award the badge multiple times. */
export function awardBadges(snaps: Snapshot[]): Record<string, BadgeResult> {
  const res: Record<string, BadgeResult> = {};
  // Hitrate only with a solid basis — otherwise whoever works the fewest
  // leads wins. The basis is scoped to the whole team, even though some
  // employees are excluded from winning.
  const hrBase = hitrateMinBase(snaps);
  const participants = snaps.filter(s => badgeEligible(s.name));

  const hrCand = participants.filter(
    s => s.hitrate !== undefined && (s.workableCreated ?? 0) >= hrBase
  );
  if (hrCand.length) {
    const best = Math.max(...hrCand.map(s => s.hitrate!));
    if (best > 0) {
      res.hitrate = {
        value: best,
        winners: hrCand.filter(s => s.hitrate === best).map(s => s.employeeId),
      };
    }
  }
  for (const [key, field] of [
    ["won", "wonMonth"],
    ["calls", "callsToday"],
  ] as const) {
    const cand = participants.filter(s => (s[field] ?? 0) > 0);
    if (cand.length) {
      const best = Math.max(...cand.map(s => s[field] ?? 0));
      res[key] = {
        value: best,
        winners: cand
          .filter(s => (s[field] ?? 0) === best)
          .map(s => s.employeeId),
      };
    }
  }
  return res;
}

export interface PerformanceMark {
  level: "low" | "high";
  score: number;
}

/**
 * High-/low-performer marks from the combination of hitrate and Closed
 * Won. Both metrics are normalized 0–1 within the month and averaged with
 * equal weight — a strong rate counts as much as a strong volume. Only
 * evaluated for employees with a solid basis on both.
 */
export function performanceMarks(
  snaps: Snapshot[]
): Record<string, PerformanceMark> {
  const hrBase = hitrateMinBase(snaps);
  const cand = snaps.filter(
    s =>
      s.hitrate !== undefined &&
      s.wonMonth !== undefined &&
      (s.workableCreated ?? 0) >= hrBase
  );
  if (cand.length < 4) return {};

  const normalizer = (vals: number[]): ((v: number) => number) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return hi === lo ? () => 0.5 : v => (v - lo) / (hi - lo);
  };
  const nHr = normalizer(cand.map(s => s.hitrate!));
  const nWon = normalizer(cand.map(s => s.wonMonth!));
  const scored = cand
    .map(s => ({
      score: (nHr(s.hitrate!) + nWon(s.wonMonth!)) / 2,
      employeeId: s.employeeId,
    }))
    .sort((a, b) => a.score - b.score);

  const k = Math.min(3, Math.floor(scored.length / 2));
  const marks: Record<string, PerformanceMark> = {};
  for (const { score, employeeId } of scored.slice(0, k)) {
    marks[employeeId] = { level: "low", score: round2(score) };
  }
  for (const { score, employeeId } of scored.slice(-k)) {
    marks[employeeId] = { level: "high", score: round2(score) };
  }
  return marks;
}
