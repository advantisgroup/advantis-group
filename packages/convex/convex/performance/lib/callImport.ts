/**
 * Import of call/telephony reports (agent statistics), ported from the
 * reference script's `call_import.py`.
 *
 * Expects one row per employee per day. Recognizes the telephony system's
 * columns tolerantly (German/English column names). Durations are stored
 * as seconds; source cells may be 'HH:MM:SS', 'MM:SS', an Excel time
 * value, or a decimal.
 */
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
  // "Bearbeitet" is the total count of handled calls (inbound + outbound),
  // "Outbound" only the outgoing ones. See OUTBOUND_SOURCE below.
  callsHandled: ["bearbeitet", "behandelt", "handled", "bearbeitetecalls"],
  callsOutbound: ["outbound", "ausgehend", "ausgehendeanrufe", "gewaehlt"],
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

  const f = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(f)) return null;
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

// ---------------------------------------------------------------- detection

function toInt(v: CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  const f = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(f) ? Math.round(f) : 0;
}

type DateParser = (s: string) => Date | null;

/** Matches the reference script's 5-format list for this module (includes
 * the day.month.-only format, using `fallback`'s year). */
function toDateWithFallback(v: CellValue, fallback: Date | null): Date | null {
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (v === null || v === undefined || v === "") return fallback;
  // Genesys interval columns ("Intervallstart"/"Intervallende") are a
  // date *and* time, e.g. "01.07.26 00:00" — every parser below matches a
  // bare date only (anchored start-to-end), so without this the time
  // suffix makes all of them fail and every row silently falls back to
  // `fallback` (today's date, for the CSV import path). That collapsed
  // many different days' call reports onto a single day on import, each
  // overwriting the last. The date is always the first whitespace-
  // delimited token in every format this function supports.
  const s = String(v).trim().split(/\s+/)[0];
  const parsers: DateParser[] = [
    (str) => {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str);
      return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
    },
    (str) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    },
    (str) => {
      const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(str);
      return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null;
    },
    (str) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
      return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
    },
    (str) => {
      const m = /^(\d{2})\.(\d{2})\.$/.exec(str); // day.month. only
      if (!m || !fallback) return null;
      return new Date(Date.UTC(fallback.getUTCFullYear(), +m[2] - 1, +m[1]));
    },
  ];
  for (const parse of parsers) {
    const d = parse(s);
    if (d) return d;
  }
  return fallback;
}

export interface CallRow {
  employee: string;
  date: Date;
  callsToday: number | null;
  callsAnswered: number | null;
  callsOutbound: number | null;
  talkAvgSec: number | null;
  talkTotalSec: number | null;
  loginSec: number | null;
  // Present only when one of the three duration fields above failed the
  // plausibility check and got dropped — see `parseDurationField`.
  flags?: DurationFlag[];
}

const DATE_IN_TEXT_RE = /(\d{4}-\d{2}-\d{2})/;

/** Detects an Excel/xlsx call report and returns `{reportDate, rows}`, or
 * null. */
export function readCallExport(wsRows: SheetRow[]): { reportDate: Date; rows: CallRow[] } | null {
  let reportDate: Date | null = null;
  let headerIdx: number | null = null;
  let colmap: Record<string, number> = {};

  for (let i = 0; i < Math.min(wsRows.length, 40); i++) {
    const row = wsRows[i];
    if (!row) continue;
    for (const c of row) {
      if (c === null || c === undefined || c === "") continue;
      const m = DATE_IN_TEXT_RE.exec(String(c));
      if (m && reportDate === null) {
        const [y, mo, d] = m[1].split("-").map(Number);
        reportDate = new Date(Date.UTC(y, mo - 1, d));
      }
    }
    const found: Record<string, number> = {};
    row.forEach((c, idx) => {
      const f = ALIAS_LOOKUP.get(normHeader(c));
      if (f && !(f in found)) found[f] = idx;
    });
    const callCols = [
      "callsAnswered",
      "callsOutbound",
      "talkTotalSec",
      "talkAvgSec",
      "loginSec",
    ].filter((f) => f in found);
    // A call report needs an employee column and at least two typical call
    // columns — otherwise it's a different kind of report.
    if ("employee" in found && callCols.length >= 2) {
      headerIdx = i;
      colmap = found;
      break;
    }
  }
  if (headerIdx === null) return null;
  if (reportDate === null) reportDate = todayFallback();

  const rows: CallRow[] = [];
  for (const r of wsRows.slice(headerIdx + 1)) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const empIdx = colmap.employee;
    const nameRaw = empIdx < r.length ? r[empIdx] : null;
    if (nameRaw === null || nameRaw === undefined || nameRaw === "") continue;
    const name = String(nameRaw).trim();
    if (SUMMARY_NAMES.has(normHeader(name))) continue;

    const date =
      "date" in colmap && colmap.date < r.length
        ? (toDateWithFallback(r[colmap.date], reportDate) ?? reportDate)
        : reportDate;

    const callsAnswered = "callsAnswered" in colmap ? toInt(r[colmap.callsAnswered]) : 0;
    const callsOutbound = "callsOutbound" in colmap ? toInt(r[colmap.callsOutbound]) : 0;
    const talkAvgSecR =
      "talkAvgSec" in colmap
        ? parseDurationField("talkAvgSec", r[colmap.talkAvgSec])
        : { value: null };
    const talkTotalSecR =
      "talkTotalSec" in colmap
        ? parseDurationField("talkTotalSec", r[colmap.talkTotalSec])
        : { value: null };
    const loginSecR =
      "loginSec" in colmap ? parseDurationField("loginSec", r[colmap.loginSec]) : { value: null };
    let talkAvgSec = talkAvgSecR.value;
    let talkTotalSec = talkTotalSecR.value;
    const loginSec = loginSecR.value;

    const calls = (callsAnswered || 0) + (callsOutbound || 0);
    if (talkTotalSec === null && talkAvgSec && calls) talkTotalSec = talkAvgSec * calls;
    if (talkAvgSec === null && talkTotalSec && calls) talkAvgSec = Math.round(talkTotalSec / calls);

    const flags = [talkAvgSecR.flag, talkTotalSecR.flag, loginSecR.flag].filter(
      (f): f is DurationFlag => f !== undefined,
    );

    rows.push({
      employee: name,
      date,
      callsAnswered,
      callsOutbound,
      talkAvgSec,
      talkTotalSec,
      loginSec,
      callsToday: calls,
      flags: flags.length > 0 ? flags : undefined,
    });
  }
  if (rows.length === 0) return null;
  return { reportDate, rows };
}

function todayFallback(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// --------------------------------------------- outbound source (configurable)
// The Genesys agent report contains BOTH columns: "Bearbeitet" (all handled
// interactions) and "Outbound" (outgoing only). Per agreement: Outbound =
// Bearbeitet. Switch to "outbound" to use the report's "Outbound" column
// instead.
const OUTBOUND_SOURCE: "bearbeitet" | "outbound" = "bearbeitet";

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

interface CsvWorkingRow {
  employee: string;
  date: Date | null;
  callsAnswered: number | null;
  callsOutbound: number | null;
  callsHandled: number | null;
  talkAvgSec: number | null;
  talkTotalSec: number | null;
  loginSec: number | null;
  flags?: DurationFlag[];
}

function finalizeCsvRow(rec: CsvWorkingRow): CallRow {
  const ans = rec.callsAnswered;
  const handled = rec.callsHandled;
  const outCol = rec.callsOutbound;
  const callsOutbound = OUTBOUND_SOURCE === "bearbeitet" && handled !== null ? handled : outCol;

  let callsToday: number | null;
  if (handled !== null) {
    callsToday = handled;
  } else {
    // Matches the reference script's `(ans or 0) + (outbound or 0) or None`:
    // a sum of exactly 0 becomes null, not zero.
    const sum = (ans ?? 0) + (callsOutbound ?? 0);
    callsToday = sum || null;
  }
  const calls = callsToday ?? 0;
  let talkTotalSec = rec.talkTotalSec;
  let talkAvgSec = rec.talkAvgSec;
  if (talkTotalSec === null && talkAvgSec && calls) talkTotalSec = talkAvgSec * calls;
  if (talkAvgSec === null && talkTotalSec && calls) talkAvgSec = Math.round(talkTotalSec / calls);

  return {
    employee: rec.employee,
    date: rec.date ?? todayFallback(),
    callsAnswered: ans,
    callsOutbound,
    talkAvgSec,
    talkTotalSec,
    loginSec: rec.loginSec,
    callsToday,
    flags: rec.flags,
  };
}

/** Reads a call report in CSV format (e.g. Genesys agent report or agent
 * status). `text` should already have any BOM stripped. Returns
 * `{reportDate, rows}`, or null when the file isn't recognized as a call
 * report at all (as opposed to recognized-but-empty, e.g. a weekend with
 * no agents on duty, which returns an empty `rows` array). */
export function readCallCsv(text: string): { reportDate: Date; rows: CallRow[] } | null {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = sniffDelimiter(firstLine);
  const table = parseCsvText(text, delimiter);
  if (table.length === 0) return null;

  const headers = table[0].filter((h) => h !== "");
  const colmap: Record<string, string> = {};
  for (const h of headers) {
    const f = ALIAS_LOOKUP.get(normHeader(h));
    if (f && !(f in colmap)) colmap[f] = h;
  }
  const callCols = [
    "callsAnswered",
    "callsOutbound",
    "callsHandled",
    "talkTotalSec",
    "talkAvgSec",
    "loginSec",
  ].filter((f) => f in colmap);
  if (!("employee" in colmap) || callCols.length === 0) return null;

  const dataRows = table.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    table[0].forEach((h, idx) => {
      if (h !== "") rec[h] = cells[idx] ?? "";
    });
    return rec;
  });

  const rows: CsvWorkingRow[] = [];
  const dates: Date[] = [];
  let emptyCount = 0;

  for (const r of dataRows) {
    const name = (r[colmap.employee] ?? "").trim();
    if (!name) continue;
    if (SUMMARY_NAMES.has(normHeader(name))) continue;

    const date = "date" in colmap ? toDateWithFallback(r[colmap.date], null) : null;
    if (date) dates.push(date);

    const talkAvgSecR =
      "talkAvgSec" in colmap
        ? parseDurationField("talkAvgSec", r[colmap.talkAvgSec])
        : { value: null };
    const talkTotalSecR =
      "talkTotalSec" in colmap
        ? parseDurationField("talkTotalSec", r[colmap.talkTotalSec])
        : { value: null };
    const loginSecR =
      "loginSec" in colmap ? parseDurationField("loginSec", r[colmap.loginSec]) : { value: null };
    const flags = [talkAvgSecR.flag, talkTotalSecR.flag, loginSecR.flag].filter(
      (f): f is DurationFlag => f !== undefined,
    );

    const rec: CsvWorkingRow = {
      employee: name,
      date,
      callsAnswered: "callsAnswered" in colmap ? toInt(r[colmap.callsAnswered]) : null,
      callsOutbound: "callsOutbound" in colmap ? toInt(r[colmap.callsOutbound]) : null,
      callsHandled: "callsHandled" in colmap ? toInt(r[colmap.callsHandled]) : null,
      talkAvgSec: talkAvgSecR.value,
      talkTotalSec: talkTotalSecR.value,
      loginSec: loginSecR.value,
      flags: flags.length > 0 ? flags : undefined,
    };
    // Skip a row with no value at all (agent wasn't on duty) — a row that
    // only ever had a rejected implausible value still has something worth
    // surfacing, so a pending flag keeps it out of this "empty" path.
    if (
      !rec.callsAnswered &&
      !rec.callsOutbound &&
      !rec.callsHandled &&
      !rec.talkTotalSec &&
      !rec.loginSec &&
      !rec.flags
    ) {
      emptyCount++;
      continue;
    }
    rows.push(rec);
  }
  // Recognized, but nobody on duty (e.g. weekend): empty result, not an
  // error. Only a report with no agent rows at all counts as unreadable.
  if (rows.length === 0 && emptyCount === 0) return null;

  const reportDate =
    dates.length > 0
      ? dates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max))
      : todayFallback();
  for (const rec of rows) {
    if (rec.date === null) rec.date = reportDate;
  }
  return { reportDate, rows: rows.map(finalizeCsvRow) };
}
