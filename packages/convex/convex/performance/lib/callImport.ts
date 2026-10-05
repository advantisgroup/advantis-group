/**
 * Import of call/telephony reports (agent statistics), ported from the
 * reference script's `call_import.py`.
 *
 * Rows are per agent and day, or per agent and interval (several rows per
 * day, summed on import). Recognizes the telephony system's columns
 * tolerantly (German/English column names). Durations are stored as
 * seconds; source cells may be 'HH:MM:SS', 'MM:SS', an Excel time value,
 * or a bare number in seconds or milliseconds (decided once per file).
 *
 * Imported by the browser too (`@advantis/convex/performance/callImport`),
 * so nothing here may depend on Convex or Node.
 */
import { berlinDate } from "../../time/lib/berlin";
import { type CellValue, type SheetRow } from "./types";

// Header normalization -> field
const CALL_ALIASES: Record<string, string[]> = {
  employee: [
    "agent",
    "agentenname",
    "mitarbeiter",
    "benutzer",
    "name",
    "nebenstelle",
    "durchwahl",
    "agentname",
    "user",
  ],
  date: ["datum", "tag", "date", "day", "intervallstart", "intervalstart"],
  callsAnswered: [
    "antwort",
    "angenommen",
    "answered",
    "beantwortet",
    "eingehendangenommen",
    "inbound",
    "angenommeneanrufe",
  ],
  // "Bearbeitet" is the total count of handled calls (inbound + outbound) and
  // becomes `callsToday`; "Outbound" only the outgoing ones and is the only
  // source of `callsOutbound`.
  callsHandled: ["bearbeitet", "behandelt", "handled", "bearbeitetecalls"],
  callsOutbound: [
    "outbound",
    "ausgehend",
    "ausgehendeanrufe",
    "gewaehlt",
    "outboundcalls",
    "abgehend",
  ],
  talkAvgSec: [
    "gespraechdurchschnitt",
    "gespraechsdurchschnitt",
    "schnittgespraechszeit",
    "schnittgesprachszeit",
    "durchschnittlichegespraechszeit",
    "schnittcalldauer",
    "avgtalktime",
    "durchschnittgespraechszeit",
    "mittleregespraechszeit",
    "gespraechszeitschnitt",
  ],
  talkTotalSec: [
    "gespraechgesamt",
    "gesprachgesamt",
    "gesamtgespraechszeit",
    "gespraechszeitgesamt",
    "totaltalktime",
    "gespraechszeit",
    "gesamtgesprachszeit",
    "summegespraechszeit",
  ],
  loginSec: [
    "angemeldet",
    "anmeldezeit",
    "loginzeit",
    "loggedin",
    "angemeldetzeit",
    "verfuegbarkeit",
    "logintime",
  ],
};

/** Header normalization: lowercase, umlauts folded, non-alphanumerics
 * stripped. */
export function normHeader(v: CellValue): string {
  if (v === null || v === undefined) return "";
  let s = String(v).trim().toLowerCase();
  for (const [a, b] of [
    ["ä", "ae"],
    ["ö", "oe"],
    ["ü", "ue"],
    ["ß", "ss"],
  ]) {
    s = s.split(a).join(b);
  }
  return s.replace(/[^a-z0-9]/g, "");
}

const ALIAS_LOOKUP = new Map<string, string>();
for (const [field, aliases] of Object.entries(CALL_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP.set(alias, field);
}

const SUMMARY_NAMES = new Set(["summe", "total", "gesamt", "durchschnitt", "average"]);

// ------------------------------------------------------------ duration parsing

// A duration cell here is always either a single interaction or a single
// employee's single-day total/average — none of which can physically
// exceed 24h. Some vendor exports (confirmed against real Genesys
// call-report CSVs: an agent's avg-handling-time cell times their handled
// count reproduces the file's own "total" cell exactly once both are
// read as milliseconds, e.g. 216587.3125 * 64 = 13861588) encode a bare
// numeric cell in milliseconds instead of seconds, with nothing in the
// file itself flagging which unit it's in. A value past the physical
// ceiling can only be milliseconds, so reinterpret it rather than store
// an impossible day-count of seconds.
export const MAX_PLAUSIBLE_DAY_SECONDS = 86_400;

// The ms-vs-seconds ceiling is a separate knob from `MAX_PLAUSIBLE_DAY_SECONDS`
// below: callers reading a single value that can't plausibly exceed a full
// day (this module's day/aggregate fields) pass the default, but a caller
// whose value is a single, much-shorter thing (e.g. interactionImport.ts's
// one-interaction duration) passes a tighter ceiling — otherwise a
// millisecond-encoded short value never crosses the day-sized threshold and
// is stored as that many literal (and wildly implausible) seconds instead.
function capMillisToSeconds(seconds: number, msThresholdSeconds: number): number {
  return seconds > msThresholdSeconds ? Math.round(seconds / 1000) : seconds;
}

// Unlike a bare number, HH:MM:SS/MM:SS/"1h 20m 15s" text already states its
// own unit — there's no alternate unit to reinterpret it as. A result past
// the physical ceiling here means the cell itself is bad (e.g. a
// month-to-date running total exported into what should be a single day's
// column, seen in the wild as a literal "51583:08:14"-style string), so it
// gets dropped rather than trusted — `onImplausible` lets a caller that
// cares (see `parseDurationField`) capture the rejected value instead of it
// silently vanishing.
function capExplicitDuration(
  seconds: number,
  onImplausible?: (rawSeconds: number) => void,
): number | null {
  if (seconds > MAX_PLAUSIBLE_DAY_SECONDS) {
    onImplausible?.(seconds);
    return null;
  }
  return seconds;
}

/** Parses a cell into seconds, or null. Accepts 'HH:MM:SS', 'MM:SS',
 * '1h 20m 15s', an Excel time value, and decimals (day fraction or
 * seconds — or milliseconds, see `capMillisToSeconds`). A `Date` is read
 * as a time-of-day via its UTC hour/min/sec — see `types.ts`'s note on
 * `CellValue` for the UTC contract. Any parsed result past
 * `MAX_PLAUSIBLE_DAY_SECONDS` becomes null (explicit-unit formats, via
 * `capExplicitDuration` — `onImplausible` is called with the rejected
 * value first, always checked against the fixed day ceiling since an
 * explicit format states its own unit and this is only a corrupt-data
 * catch-all) or gets reinterpreted as milliseconds (bare numbers, via
 * `capMillisToSeconds` — a confirmed vendor quirk, not surfaced as a
 * rejection, checked against `msThresholdSeconds` since a bare number's
 * plausible ceiling depends on what the value represents — see that
 * param). `onBareNumber`, if given, is called with the raw (unconverted,
 * assume-seconds) reading whenever a bare number is the path taken — a
 * per-row magnitude check alone still misreads a genuinely short
 * millisecond value (e.g. 2500ms, comfortably under any sane per-row
 * ceiling) as that many literal seconds, so a caller needing full
 * accuracy (interactionImport.ts) uses this to decide the unit once for
 * every bare number in the file, from the strongest evidence across all
 * of them, rather than trusting each row's own magnitude. */
export function parseDuration(
  v: CellValue,
  onImplausible?: (rawSeconds: number) => void,
  /** Ceiling used only for the bare-number ms-vs-seconds heuristic.
   * Defaults to a full day for this module's day/aggregate fields;
   * interactionImport.ts passes a much tighter one since a single
   * interaction can't plausibly run anywhere near that long. */
  msThresholdSeconds: number = MAX_PLAUSIBLE_DAY_SECONDS,
  onBareNumber?: (rawSeconds: number) => void,
): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
  }
  if (typeof v === "number") {
    // Excel stores times as a day fraction (0.25 = 6 hours).
    if (v > 0 && v < 1) return Math.round(v * 86_400);
    const raw = Math.round(v);
    onBareNumber?.(raw);
    return capMillisToSeconds(raw, msThresholdSeconds);
  }
  const s = String(v).trim();
  if (!s || s === "-" || s === "–") return null;

  let m = /^(\d+):([0-5]?\d):([0-5]?\d)(?:[.,]\d+)?$/.exec(s); // HH:MM:SS
  if (m) return capExplicitDuration(+m[1] * 3600 + +m[2] * 60 + +m[3], onImplausible);

  m = /^(\d+):([0-5]?\d)$/.exec(s); // MM:SS
  if (m) return capExplicitDuration(+m[1] * 60 + +m[2], onImplausible);

  m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?$/i.exec(s); // 1h 20m 15s
  if (m && (m[1] || m[2] || m[3])) {
    return capExplicitDuration(
      +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0),
      onImplausible,
    );
  }

  const f = parseLocaleNumber(s);
  if (f === null) return null;
  const raw = Math.round(f);
  onBareNumber?.(raw);
  return capMillisToSeconds(raw, msThresholdSeconds);
}

export type FlaggableDurationField = "talkTotalSec" | "talkAvgSec" | "loginSec";

export interface DurationFlag {
  field: FlaggableDurationField;
  rawSeconds: number;
  rawText: string;
}

/** Parses one of the three call-duration fields and, if the cell's value
 * failed the plausibility check, also returns a `DurationFlag` describing
 * what was rejected — so the row-building loops in `readCallExport`/
 * `readCallCsv` can surface it instead of just losing the value silently. */
function parseDurationField(
  field: FlaggableDurationField,
  v: CellValue,
): { value: number | null; flag?: DurationFlag } {
  let rejected: number | undefined;
  const value = parseDuration(v, (raw) => {
    rejected = raw;
  });
  if (rejected === undefined) return { value };
  return { value, flag: { field, rawSeconds: rejected, rawText: String(v) } };
}

/** Seconds as H:MM:SS or M:SS. */
export function fmtDuration(sec: number | null): string {
  if (sec === null) return "–";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Compact: "12h 34m" or "4m 20s". */
export function fmtDurationShort(sec: number | null): string {
  if (sec === null) return "–";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// ----------------------------------------------------------------- numbers

/** Reads a numeric cell the way a German export writes it: "1.234" and
 * "1.234,5" use the dot as thousands separator, "12,5" the comma as
 * decimal. A plain "1.5" (one or two digits after the dot, or a leading
 * "0.") stays a decimal, so point-decimal exports keep working. */
export function parseLocaleNumber(v: CellValue): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  let s = String(v)
    .trim()
    .replace(/[\s ']/g, "");
  if (!s || s === "-" || s === "–") return null;
  if (s.endsWith("%")) s = s.slice(0, -1);
  if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------- dates

type DateParser = (s: string) => Date | null;

function utcDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Parses a date cell into a UTC-midnight `Date`. Accepts a `Date` from the
 * sheet reader, dd.mm.yyyy, dd.mm.yy, yyyy-mm-dd and m/d/yyyy — each also
 * with a time part ("01.07.26 00:00", "2026-07-01T08:00"), since Genesys
 * interval columns carry one — and "dd.mm." with `fallback`'s year. */
export function parseDateCell(v: CellValue, fallback: Date | null = null): Date | null {
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (v === null || v === undefined || v === "" || typeof v !== "string") return fallback;
  const s = v.trim().split(/[\sT]/)[0];
  const parsers: DateParser[] = [
    (str) => {
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(str);
      return m ? utcDate(+m[3], +m[2], +m[1]) : null;
    },
    (str) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      return m ? utcDate(+m[1], +m[2], +m[3]) : null;
    },
    (str) => {
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(str);
      return m ? utcDate(2000 + +m[3], +m[2], +m[1]) : null;
    },
    (str) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
      return m ? utcDate(+m[3], +m[1], +m[2]) : null;
    },
    (str) => {
      const m = /^(\d{1,2})\.(\d{1,2})\.$/.exec(str);
      return m && fallback ? utcDate(fallback.getUTCFullYear(), +m[2], +m[1]) : null;
    },
  ];
  for (const parse of parsers) {
    const d = parse(s);
    if (d) return d;
  }
  return fallback;
}

const ISO_IN_TEXT_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const GERMAN_IN_TEXT_RE = /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/;

/** The first date written into a free-text cell above the table ("Bericht
 * vom 01.10.2026", "As of 2026-10-01 08:00", "Zeitraum: 01.10.26 – …"). */
export function findDateInText(v: CellValue): Date | null {
  if (v instanceof Date) return parseDateCell(v);
  if (typeof v !== "string") return null;
  const iso = ISO_IN_TEXT_RE.exec(v);
  if (iso) return utcDate(+iso[1], +iso[2], +iso[3]);
  const de = GERMAN_IN_TEXT_RE.exec(v);
  if (de) {
    const y = de[3].length === 2 ? 2000 + +de[3] : +de[3];
    return utcDate(y, +de[2], +de[1]);
  }
  return null;
}

/** Today in Berlin as a UTC-midnight `Date` — what a report without any
 * date of its own is filed under. */
export function todayBerlinDate(): Date {
  const [y, m, d] = berlinDate(Date.now()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- call reports

export interface CallRow {
  employee: string;
  date: Date;
  callsToday: number | null;
  callsAnswered: number | null;
  /** Only from a real outbound column ("Outbound"/"Ausgehend") — never
   * derived from "Bearbeitet", which counts inbound calls too. */
  callsOutbound: number | null;
  talkAvgSec: number | null;
  talkTotalSec: number | null;
  loginSec: number | null;
  // Present only when one of the three duration fields above failed the
  // plausibility check and got dropped.
  flags?: DurationFlag[];
}

export interface CallReport {
  reportDate: Date;
  /** One row per agent and day — interval rows already summed up. Empty
   * when the report is recognised but nobody had activity (a weekend). */
  rows: CallRow[];
}

type CallField = keyof typeof CALL_ALIASES;
const DURATION_FIELDS: FlaggableDurationField[] = ["talkAvgSec", "talkTotalSec", "loginSec"];
const COUNT_FIELDS = ["callsAnswered", "callsOutbound", "callsHandled"] as const;
type CountField = (typeof COUNT_FIELDS)[number];

// A bare number in a duration column is seconds or milliseconds, and the
// file doesn't say which (confirmed against real Genesys exports). The unit
// is decided once per file: if any bare number in any duration column is
// impossible as seconds — an average call over 3 h, a day total over 24 h —
// every bare duration in the file is milliseconds. A per-cell check missed
// short values: a 45 000 ms average stayed 45 000 s (12.5 h).
const MS_EVIDENCE_SECONDS: Record<FlaggableDurationField, number> = {
  talkAvgSec: 3 * 3600,
  talkTotalSec: MAX_PLAUSIBLE_DAY_SECONDS,
  loginSec: MAX_PLAUSIBLE_DAY_SECONDS,
};

const MS_HEADER_RE = /\((?:ms|millisek[^)]*|millisecond[^)]*)\)|\[ms\]|\bin ms\b/i;

function headerField(cell: CellValue): { field: CallField; ms: boolean } | null {
  if (cell === null || cell === undefined || cell === "") return null;
  const raw = String(cell);
  const stripped = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const field = (ALIAS_LOOKUP.get(normHeader(stripped)) ?? ALIAS_LOOKUP.get(normHeader(raw))) as
    | CallField
    | undefined;
  return field ? { field, ms: MS_HEADER_RE.test(raw) } : null;
}

function readCount(v: CellValue): number | null {
  const n = parseLocaleNumber(v);
  return n === null ? null : Math.round(n);
}

interface ParsedDuration {
  /** Seconds from an explicit-unit cell ("01:02:03", "1h 2m"). */
  explicit: number | null;
  /** The bare number as written — unit decided per file. */
  bare: number | null;
  rejected?: number;
}

function readDuration(v: CellValue): ParsedDuration {
  let bare: number | null = null;
  let rejected: number | undefined;
  const parsed = parseDuration(
    v,
    (raw) => {
      rejected = raw;
    },
    Number.POSITIVE_INFINITY,
    (raw) => {
      bare = raw;
    },
  );
  if (bare !== null) return { explicit: null, bare };
  return { explicit: parsed, bare: null, rejected };
}

interface WorkingRow {
  employee: string;
  date: Date | null;
  counts: Record<CountField, number | null>;
  durations: Record<FlaggableDurationField, ParsedDuration>;
  rawText: Record<FlaggableDurationField, string>;
}

function emptyAccumulator(employee: string, date: Date) {
  return {
    employee,
    date,
    callsAnswered: null as number | null,
    callsOutbound: null as number | null,
    callsHandled: null as number | null,
    talkTotalSec: null as number | null,
    loginSec: null as number | null,
    // Weighted average of the rows' own averages, for rows that state one.
    avgWeighted: 0,
    avgWeight: 0,
    avgSingle: null as number | null,
    rowCount: 0,
    flags: [] as DurationFlag[],
  };
}

const addNullable = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : a + b;

/** Recognises a call report in an already-read table (xlsx rows or a
 * parsed CSV) and returns one row per agent and day. `minCallColumns` is
 * how many call columns besides the agent column the header must have. */
function readCallTable(table: SheetRow[], minCallColumns: number): CallReport | null {
  let headerIdx = -1;
  let colmap: Partial<Record<CallField, number>> = {};
  const msColumns = new Set<CallField>();
  let headerDate: Date | null = null;

  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const row = table[i] ?? [];
    const found: Partial<Record<CallField, number>> = {};
    const foundMs = new Set<CallField>();
    row.forEach((c, idx) => {
      const hit = headerField(c);
      if (hit && found[hit.field] === undefined) {
        found[hit.field] = idx;
        if (hit.ms) foundMs.add(hit.field);
      }
    });
    const callCols = [...COUNT_FIELDS, ...DURATION_FIELDS].filter((f) => found[f] !== undefined);
    if (found.employee !== undefined && callCols.length >= minCallColumns) {
      headerIdx = i;
      colmap = found;
      for (const f of foundMs) msColumns.add(f);
      break;
    }
    if (headerDate === null) {
      for (const c of row) {
        headerDate = findDateInText(c);
        if (headerDate) break;
      }
    }
  }
  if (headerIdx === -1 || colmap.employee === undefined) return null;
  const employeeCol = colmap.employee;

  const working: WorkingRow[] = [];
  let millis = DURATION_FIELDS.some((f) => msColumns.has(f));
  for (const r of table.slice(headerIdx + 1)) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const nameRaw = r[employeeCol];
    if (nameRaw === null || nameRaw === undefined || nameRaw === "") continue;
    const employee = String(nameRaw).trim();
    if (!employee || SUMMARY_NAMES.has(normHeader(employee))) continue;

    const cell = (f: CallField): CellValue => {
      const idx = colmap[f];
      return idx === undefined ? null : r[idx];
    };
    const counts = {} as Record<CountField, number | null>;
    for (const f of COUNT_FIELDS) counts[f] = readCount(cell(f));
    const durations = {} as Record<FlaggableDurationField, ParsedDuration>;
    const rawText = {} as Record<FlaggableDurationField, string>;
    for (const f of DURATION_FIELDS) {
      durations[f] = readDuration(cell(f));
      rawText[f] = String(cell(f) ?? "");
      const bare = durations[f].bare;
      if (bare !== null && bare > MS_EVIDENCE_SECONDS[f]) millis = true;
    }
    working.push({
      employee,
      date: colmap.date !== undefined ? parseDateCell(r[colmap.date]) : null,
      counts,
      durations,
      rawText,
    });
  }

  const rowDates = working.map((w) => w.date).filter((d): d is Date => d !== null);
  const fallbackDate =
    headerDate ??
    (rowDates.length > 0
      ? rowDates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max))
      : todayBerlinDate());

  const merged = new Map<string, ReturnType<typeof emptyAccumulator>>();
  for (const w of working) {
    const date = w.date ?? fallbackDate;
    const seconds = {} as Record<FlaggableDurationField, number | null>;
    const flags: DurationFlag[] = [];
    for (const f of DURATION_FIELDS) {
      const d = w.durations[f];
      let value = d.bare !== null ? (millis ? Math.round(d.bare / 1000) : d.bare) : d.explicit;
      let rejected = d.rejected;
      if (value !== null && value > MAX_PLAUSIBLE_DAY_SECONDS) {
        rejected = value;
        value = null;
      }
      seconds[f] = value;
      if (rejected !== undefined)
        flags.push({ field: f, rawSeconds: rejected, rawText: w.rawText[f] });
    }
    const hasActivity =
      COUNT_FIELDS.some((f) => (w.counts[f] ?? 0) > 0) ||
      DURATION_FIELDS.some((f) => (seconds[f] ?? 0) > 0) ||
      flags.length > 0;
    // An agent who wasn't on duty (or an empty interval) adds nothing.
    if (!hasActivity) continue;

    const key = `${cleanAgentName(w.employee).toLowerCase()}\n${isoDay(date)}`;
    const acc = merged.get(key) ?? emptyAccumulator(w.employee, date);
    merged.set(key, acc);
    acc.rowCount++;
    acc.callsAnswered = addNullable(acc.callsAnswered, w.counts.callsAnswered);
    acc.callsOutbound = addNullable(acc.callsOutbound, w.counts.callsOutbound);
    acc.callsHandled = addNullable(acc.callsHandled, w.counts.callsHandled);
    acc.loginSec = addNullable(acc.loginSec, seconds.loginSec);
    const calls = rowCalls(w.counts);
    let total = seconds.talkTotalSec;
    if (total === null && seconds.talkAvgSec !== null && calls) total = seconds.talkAvgSec * calls;
    acc.talkTotalSec = addNullable(acc.talkTotalSec, total);
    if (seconds.talkAvgSec !== null) {
      acc.avgSingle = seconds.talkAvgSec;
      if (calls) {
        acc.avgWeighted += seconds.talkAvgSec * calls;
        acc.avgWeight += calls;
      }
    }
    acc.flags.push(...flags);
  }

  const rows: CallRow[] = [];
  for (const acc of merged.values()) {
    const callsToday = rowCalls({
      callsAnswered: acc.callsAnswered,
      callsOutbound: acc.callsOutbound,
      callsHandled: acc.callsHandled,
    });
    let talkAvgSec: number | null;
    if (acc.rowCount === 1) talkAvgSec = acc.avgSingle;
    else if (acc.avgWeight > 0) talkAvgSec = Math.round(acc.avgWeighted / acc.avgWeight);
    else talkAvgSec = null;
    if (talkAvgSec === null && acc.talkTotalSec && callsToday) {
      talkAvgSec = Math.round(acc.talkTotalSec / callsToday);
    }
    rows.push({
      employee: acc.employee,
      date: acc.date,
      callsToday,
      callsAnswered: acc.callsAnswered,
      callsOutbound: acc.callsOutbound,
      talkAvgSec,
      talkTotalSec: acc.talkTotalSec,
      loginSec: acc.loginSec,
      flags: acc.flags.length > 0 ? acc.flags : undefined,
    });
  }

  const reportDate =
    rows.length > 0
      ? rows.reduce((max, r) => (r.date.getTime() > max.getTime() ? r.date : max), rows[0].date)
      : fallbackDate;
  return { reportDate, rows };
}

/** Calls of a row: "Bearbeitet" (all handled calls) when the report has
 * it, otherwise answered + outbound. Null when neither is in the file. */
function rowCalls(counts: Record<CountField, number | null>): number | null {
  if (counts.callsHandled !== null) return counts.callsHandled;
  if (counts.callsAnswered === null && counts.callsOutbound === null) return null;
  return (counts.callsAnswered ?? 0) + (counts.callsOutbound ?? 0);
}

/** Detects an Excel/xlsx call report, or returns null. */
export function readCallExport(wsRows: SheetRow[]): CallReport | null {
  return readCallTable(wsRows, 2);
}

/** Reads a call report in CSV format (e.g. Genesys agent report or agent
 * status). `text` should already be decoded (see `decodeCsvBytes`). Null
 * when the file isn't a call report at all; an empty `rows` array when it
 * is one but nobody had activity (e.g. a weekend). */
export function readCallCsv(text: string): CallReport | null {
  const table = parseCsvText(stripBom(text), sniffDelimiter(firstLine(text)));
  if (table.length === 0) return null;
  return readCallTable(table, 1);
}

// ------------------------------------------------------ name matching to team

/** 'BLUME Jessica (Consulting For Edenred)' -> 'BLUME Jessica' */
export function cleanAgentName(name: CellValue): string {
  const s = String(name ?? "").replace(/\([^)]*\)/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function tokens(name: CellValue): string[] {
  let s = cleanAgentName(name).toLowerCase();
  for (const [a, b] of [
    ["ä", "ae"],
    ["ö", "oe"],
    ["ü", "ue"],
    ["ß", "ss"],
  ]) {
    s = s.split(a).join(b);
  }
  return s.split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/** Two name parts count as equal when one is a prefix of the other (>= 4
 * chars) — catches truncations in CRM data ('Fische' <-> 'Fischer'). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/** Maps an agent name to a team member. Name-part order doesn't matter
 * ('BLUME Jessica' = 'Jessica Blume'). Returns the employee name, or null
 * if there's no unambiguous match in the team. */
export function matchEmployee(agentName: CellValue, employeeNames: string[]): string | null {
  const at = tokens(agentName);
  if (at.length === 0) return null;
  const hits: string[] = [];
  for (const emp of employeeNames) {
    const et = tokens(emp);
    if (et.length === 0 || et.length !== at.length) continue;
    const free = [...at];
    let ok = true;
    for (const token of et) {
      const idx = free.findIndex((x) => tokensMatch(token, x));
      if (idx === -1) {
        ok = false;
        break;
      }
      free.splice(idx, 1);
    }
    if (ok) hits.push(emp);
  }
  return hits.length === 1 ? hits[0] : null;
}

// ------------------------------------------------------------- CSV reports

export function sniffDelimiter(sample: string): string {
  for (const d of [";", ",", "\t"]) {
    if (sample.split(d).length - 1 >= 3) return d;
  }
  return ";";
}

/** Minimal RFC4180-ish CSV parser (quoted fields, "" escaping, CRLF/LF) —
 * intentionally hand-rolled rather than a Node CSV library, so this module
 * has no dependency that wouldn't run in Convex's isolate. */
export function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      push();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Windows-1252 differs from Latin-1 only in 0x80–0x9F; spelled out so
// decoding never depends on which encodings the runtime's TextDecoder
// ships with.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, i + 8192);
    out += String.fromCharCode(
      ...Array.from(chunk, (b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b)),
    );
  }
  return out;
}

/** Decodes an uploaded CSV. UTF-8 (with or without BOM) and UTF-16 (BOM,
 * Excel's "Unicode text") are read as such; anything that isn't valid
 * UTF-8 is a Windows export in Windows-1252 — read as UTF-8 its umlauts
 * turn into "�" and the agent names stop matching the team. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return stripBom(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return decodeWindows1252(bytes);
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function firstLine(text: string): string {
  const nl = text.indexOf("\n");
  return nl === -1 ? text : text.slice(0, nl);
}
