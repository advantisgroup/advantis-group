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
  todayBerlin,
  toISODate,
  workdaysBetween,
  workdaysElapsed,
  type Forecast,
} from "./workdays";
import { METRIC_KEYS, type MetricFields } from "./types";

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
  // Added by `summarizeMonth`: days with calls / with Genesys login time.
  callDays?: number;
  loginDays?: number;
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

export function rate(num: number | undefined, den: number | undefined): number | undefined {
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

/** Team total of the month: every metric summed over the employees, the
 * call duration weighted (talk time ÷ calls) and the rates as Σ/Σ. The
 * hitrate deliberately counts *everyone*: someone above 100 % (closing
 * Workables from a prior month) is still part of the team's result, and
 * leaving them out made the card's percentage disagree with the
 * "won / workable" sums printed under it. */
export function sumTeam(snaps: Snapshot[]): Snapshot {
  const total: Snapshot = { employeeId: "team", name: "Team", reportDate: null };
  for (const k of METRIC_KEYS) total[k] = nsum(snaps.map((s) => s[k]));
  total.talkAvgSec =
    total.talkTotalSec && total.callsToday
      ? Math.round(total.talkTotalSec / total.callsToday)
      : undefined;
  total.reportDate = snaps.reduce<string | null>(
    (max, s) => (s.reportDate && (!max || s.reportDate > max) ? s.reportDate : max),
    null,
  );
  return enrich(total);
}

const DAY_MS = 86_400_000;

function addDaysISO(iso: string, n: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + n * DAY_MS));
}

/** Which days of a month the call reports cover. `through` is how far the
 * month counts as reported: the newest call-report day, or the day before
 * the newest report of any kind if that is later — a Lead report uploaded
 * in the morning shouldn't flag that same day's call report (not exported
 * until evening) as missing, but every earlier workday without one is. */
export interface CallCoverage {
  through: string;
  /** Workdays up to `through` without any call report (ISO dates). */
  missing: string[];
}

/** `rows` are the month's report rows of the counted employees (already
 * cut off where needed); null when the month has no call data at all. */
export function callCoverage(
  rows: readonly { reportDate: string; callsToday?: number }[],
  ym: string,
  latestReportDate: string | null,
  /** A finished month is judged up to its last day. */
  complete = false,
): CallCoverage | null {
  const callDates = new Set<string>();
  for (const r of rows) if (r.callsToday !== undefined) callDates.add(r.reportDate);
  if (callDates.size === 0) return null;
  const { start, end } = monthBoundsISO(ym);
  let through = [...callDates].reduce((a, b) => (b > a ? b : a));
  if (latestReportDate) {
    const dayBefore = addDaysISO(latestReportDate, -1);
    if (dayBefore > through) through = dayBefore;
  }
  if (complete || through > end) through = end;
  const missing: string[] = [];
  for (let d = start; d <= through; d = addDaysISO(d, 1)) {
    if (isWorkday(parseISODate(d)) && !callDates.has(d)) missing.push(d);
  }
  return { through, missing };
}

function formatDDMM(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

export interface EmployeeForecast extends Omit<Forecast, "perDay" | "fc1"> {
  perDay: number | undefined;
  fc1: number | undefined;
  /** "Arbeitstage": days this person actually worked (call activity).
   * "Werktage": the calendar's workdays (Mon–Fri without Nürnberg holidays). */
  basis: "Arbeitstage" | "Werktage";
  incomplete: boolean;
  missingDays: string[];
}

export interface ForecastBasis {
  /** Days this employee worked so far — days with calls plus workdays
   * without any call report (`missing`), which are counted as worked: a
   * missing upload must not shrink the divisor and inflate FC1. Absent or
   * 0 falls back to the calendar's workdays. */
  worked?: number;
  /** Last day the worked days cover (defaults to the snapshot's date). */
  through?: string;
  /** Workdays without any call report, shown as a warning. */
  missing?: string[];
}

/**
 * Adds the FC1 (Closed Won) forecast to a snapshot: Closed Won per day so
 * far × days in the month. Per employee the days are worked days
 * ("Arbeitstage"); for the team, or someone without call data, the
 * calendar's workdays ("Werktage"). Remaining days to month-end are always
 * workdays.
 */
export function addForecast(snap: Snapshot, ym: string, basis: ForecastBasis = {}): Snapshot {
  const asOfIso = basis.through ?? snap.reportDate;
  const asOf = asOfIso ? parseISODate(asOfIso) : todayBerlin();
  const value = snap.wonMonth;
  const missing = basis.missing ?? [];
  const warn = { incomplete: missing.length > 0, missingDays: missing.map(formatDDMM) };

  let fc: EmployeeForecast;
  if (basis.worked) {
    const worked = basis.worked;
    const endDate = parseISODate(monthBoundsISO(ym).end);
    const remaining =
      asOf.getTime() < endDate.getTime()
        ? workdaysBetween(new Date(asOf.getTime() + DAY_MS), endDate)
        : 0;
    const total = worked + remaining;
    const perDay = value !== undefined ? round2(value / worked) : undefined;
    let fc1: number | undefined;
    if (value === undefined) {
      fc1 = undefined;
    } else if (remaining === 0) {
      fc1 = value; // completed month: actual = forecast
    } else {
      fc1 = perDay !== undefined ? Math.round(perDay * total) : undefined;
    }
    fc = {
      total,
      elapsed: worked,
      remaining,
      perDay,
      fc1,
      isActual: remaining === 0,
      basis: "Arbeitstage",
      ...warn,
    };
  } else {
    const wt = workdayForecast(value ?? null, ym, asOf);
    fc = {
      ...wt,
      perDay: wt.perDay ?? undefined,
      fc1: wt.fc1 ?? undefined,
      basis: "Werktage",
      ...warn,
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

function numField(snap: DeltaSource | undefined, key: string): number | undefined {
  if (!snap) return undefined;
  const v = (snap as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

/** Per-KPI difference (undefined if either value is missing). */
export function computeDeltas(
  cur: DeltaSource | undefined,
  ref: DeltaSource | undefined,
): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const k of DELTA_KEYS) {
    const c = numField(cur, k);
    const r = numField(ref, k);
    out[k] = c !== undefined && r !== undefined ? round1(c - r) : undefined;
  }
  return out;
}

/** The `n`th workday (1-based) of month `ym`, or undefined if it has fewer. */
export function nthWorkday(ym: string, n: number): string | undefined {
  const { start, end } = monthBoundsISO(ym);
  let seen = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    if (isWorkday(parseISODate(d)) && ++seen === n) return d;
  }
  return undefined;
}

/**
 * Where to cut a comparison month (VM/VJ) so it is compared like for like.
 * A month still running is compared with the reference month as it stood
 * after the same number of workdays — month-to-date against a complete
 * month made everything red early in the month. A completed month is
 * compared full against full (returns undefined). `asOf` is the running
 * month's data date; no data yet means "as of today".
 */
export function comparisonCutoff(
  ym: string,
  refYm: string,
  asOf: string | null,
  today: Date = todayBerlin(),
): string | undefined {
  if (monthCompleted(ym, today)) return undefined;
  const asOfDate = asOf ? parseISODate(asOf) : today;
  const n = workdaysElapsed(ym, asOfDate);
  if (n === 0) return addDaysISO(monthBoundsISO(refYm).start, -1);
  return nthWorkday(refYm, n) ?? monthBoundsISO(refYm).end;
}

/** VM/VJ deltas of `cur` against a reference month. Everything is compared
 * with the reference as of the same point (`cut`, see `comparisonCutoff`)
 * — except FC1, which projects the month's end and is therefore compared
 * with the reference month's final result (`full`). */
export function comparisonDeltas(
  cur: DeltaSource | undefined,
  cut: DeltaSource | undefined,
  full: DeltaSource | undefined,
): Record<string, number | undefined> {
  const out = computeDeltas(cur, cut);
  if (full) {
    const c = numField(cur, "fc1");
    const r = numField(full, "fc1") ?? numField(full, "wonMonth");
    out.fc1 = c !== undefined && r !== undefined ? round1(c - r) : undefined;
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
const AGGREGATE_KEYS = new Set<keyof Snapshot>(["workableRate", "hitrate", "talkAvgSec"]);

/** Comparison baseline per KPI for the month: rates as the real team
 * value, quantities as the per-employee average. `total` must already be
 * `enrich`ed. */
export function computeTeamBenchmark(
  total: Snapshot,
  snaps: Snapshot[],
): Record<string, number | undefined> {
  const bench: Record<string, number | undefined> = {};
  for (const k of DELTA_KEYS) {
    if (AGGREGATE_KEYS.has(k)) {
      bench[k] = numField(total, k);
      continue;
    }
    const vals = snaps.map((s) => numField(s, k)).filter((v): v is number => v !== undefined);
    bench[k] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
  }
  return bench;
}

const COUNTED = /^(.+?)\s*[:=]\s*(\d+)\s*$/;

/** One reasons text -> its (reason, count) entries. The Salesforce import
 * writes "Preis: 3; Kein Bedarf, später: 2" (`mostCommonText`), so entries
 * are separated by ";" or a line break and a reason may itself contain
 * commas. The upload template is free text, though, and people separate
 * with commas too — so inside an entry a comma only splits where the text
 * before it ends in its own ": count". Anything without a count counts 1. */
export function parseReasons(text: string): { reason: string; count: number }[] {
  const out: { reason: string; count: number }[] = [];
  const push = (raw: string) => {
    const p = raw.trim();
    if (!p) return;
    const m = COUNTED.exec(p);
    out.push(m ? { reason: m[1].trim(), count: Number(m[2]) } : { reason: p, count: 1 });
  };
  for (const entry of text.split(/[;\n]+/)) {
    let buffer: string[] = [];
    for (const seg of entry.split(",")) {
      buffer.push(seg);
      if (COUNTED.test(seg.trim())) {
        push(buffer.join(","));
        buffer = [];
      }
    }
    push(buffer.join(","));
  }
  return out;
}

/** Reasons texts of several employees summed per reason, largest first. */
export function aggregateReasons(
  texts: (string | undefined)[],
): { reason: string; count: number }[] {
  const agg = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    for (const { reason, count } of parseReasons(t)) {
      agg.set(reason, (agg.get(reason) ?? 0) + count);
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
  const vals = snaps.map((s) => s.workableCreated ?? 0).filter((v) => v > 0);
  if (vals.length === 0) return MIN_BASE;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.max(MIN_BASE, Math.round(0.25 * median));
}

/** Comparison baseline per KPI: rates against the real team value
 * (sum/sum), quantities against the per-employee average. */
export function teamAverages(
  snaps: Snapshot[],
  total?: Snapshot,
): Record<string, number | undefined> {
  const avg: Record<string, number | undefined> = {};
  for (const def of SIGNAL_DEFS) {
    const totalVal = numField(total, def.key);
    if (def.kind === "pct" && totalVal !== undefined) {
      avg[def.key] = totalVal;
      continue;
    }
    const vals = snaps.map((s) => numField(s, def.key)).filter((v): v is number => v !== undefined);
    avg[def.key] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
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
  hrBase?: number,
): { alerts: Signal[]; highlights: Signal[] } {
  if (!cur) return { alerts: [], highlights: [] };
  const signals: Signal[] = [];

  for (const def of SIGNAL_DEFS) {
    const v = numField(cur, def.key);
    const t = avg[def.key];
    if (v === undefined || t === undefined) continue;

    let minBase = def.minBase;
    if (def.key === "hitrate" && hrBase) minBase = hrBase;
    if (def.baseField && (numField(cur, def.baseField) ?? 0) < minBase) continue;

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
    .filter((s) => s.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const highlights = signals
    .filter((s) => s.score > 0)
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

export function monthCompleted(ym: string, today: Date = todayBerlin()): boolean {
  const { end } = monthBoundsISO(ym);
  return parseISODate(end).getTime() < today.getTime();
}

export interface BadgeResult {
  value: number;
  winners: string[]; // employeeIds
}

/** Days after month end before a month's badges are frozen in the cache —
 * the last day's call report usually arrives a day or two later. */
export const BADGE_CACHE_DELAY_DAYS = 3;

export function badgeCacheReady(ym: string, today: Date = todayBerlin()): boolean {
  return addDaysISO(monthBoundsISO(ym).end, BADGE_CACHE_DELAY_DAYS) <= toISODate(today);
}

export interface UploadStamp {
  uploadedAt: number;
  reportDate?: string;
  reportKind?: string;
}

/** A cached month is stale once a report of that month was (re-)imported
 * after the badges were computed. Interactions don't feed badges; an
 * upload template carries its own per-row dates, so it counts for every
 * month. With `nextMonthSales`, Lead/Opportunity reports of the following
 * month count too: they also write the previous month's closings (Close
 * Date last month, filed at its last day), so a late correction shows up
 * there — the daily cron checks this, page views don't. */
export function badgeCacheStale(
  ym: string,
  computedAt: number,
  uploads: readonly UploadStamp[],
  opts: { nextMonthSales?: boolean } = {},
): boolean {
  const next = shiftYm(ym, 1);
  return uploads.some((u) => {
    if (u.uploadedAt <= computedAt || u.reportKind === "interactions") return false;
    if (u.reportDate === undefined) return true;
    const uploadYm = u.reportDate.slice(0, 7);
    if (uploadYm === ym) return true;
    return (
      !!opts.nextMonthSales &&
      uploadYm === next &&
      (u.reportKind === "lead" || u.reportKind === "opp")
    );
  });
}

/** Winner(s) per badge for a month. Ties award the badge multiple times.
 * Everyone in `snaps` takes part — hiding someone from awards means hiding
 * them from the dashboard (Einstellungen), which drops them before this. */
export function awardBadges(snaps: Snapshot[]): Record<string, BadgeResult> {
  const res: Record<string, BadgeResult> = {};
  // Hitrate only with a solid basis — otherwise whoever works the fewest
  // leads wins.
  const hrBase = hitrateMinBase(snaps);
  const participants = snaps;

  const hrCand = participants.filter(
    (s) => s.hitrate !== undefined && (s.workableCreated ?? 0) >= hrBase,
  );
  if (hrCand.length) {
    const best = Math.max(...hrCand.map((s) => s.hitrate!));
    if (best > 0) {
      res.hitrate = {
        value: best,
        winners: hrCand.filter((s) => s.hitrate === best).map((s) => s.employeeId),
      };
    }
  }
  for (const [key, field] of [
    ["won", "wonMonth"],
    ["calls", "callsToday"],
  ] as const) {
    const cand = participants.filter((s) => (s[field] ?? 0) > 0);
    if (cand.length) {
      const best = Math.max(...cand.map((s) => s[field] ?? 0));
      res[key] = {
        value: best,
        winners: cand.filter((s) => (s[field] ?? 0) === best).map((s) => s.employeeId),
      };
    }
  }
  return res;
}

export interface PerformanceMark {
  level: "low" | "high";
  score: number;
}

/** Marks need at least this many employees with a solid basis… */
export const MARKS_MIN_EMPLOYEES = 6;
/** …and, in a running month, this many workdays behind it. */
export const MARKS_MIN_WORKDAYS = 5;

/** `performanceMarks`, but only once a month says something: completed, or
 * at least `MARKS_MIN_WORKDAYS` workdays in. Day 2's numbers labelled
 * people "Braucht Aufmerksamkeit" on noise. */
export function marksForMonth(
  snaps: Snapshot[],
  month: { completed: boolean; workdaysElapsed: number },
): Record<string, PerformanceMark> {
  if (!month.completed && month.workdaysElapsed < MARKS_MIN_WORKDAYS) return {};
  return performanceMarks(snaps);
}

/**
 * High-/low-performer marks from the combination of hitrate and Closed
 * Won. Both metrics are normalized 0–1 within the month and averaged with
 * equal weight — a strong rate counts as much as a strong volume. Only
 * evaluated for employees with a solid basis on both.
 */
export function performanceMarks(snaps: Snapshot[]): Record<string, PerformanceMark> {
  const hrBase = hitrateMinBase(snaps);
  const cand = snaps.filter(
    (s) =>
      s.hitrate !== undefined && s.wonMonth !== undefined && (s.workableCreated ?? 0) >= hrBase,
  );
  // With few people the top and bottom three are almost everyone.
  if (cand.length < MARKS_MIN_EMPLOYEES) return {};

  const normalizer = (vals: number[]): ((v: number) => number) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return hi === lo ? () => 0.5 : (v) => (v - lo) / (hi - lo);
  };
  const nHr = normalizer(cand.map((s) => s.hitrate!));
  const nWon = normalizer(cand.map((s) => s.wonMonth!));
  const scored = cand
    .map((s) => ({
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
