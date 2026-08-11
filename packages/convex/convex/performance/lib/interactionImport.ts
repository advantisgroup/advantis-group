/**
 * Import of the Genesys "Interaktionen" export — one row per individual
 * interaction, distinct from `callImport.ts`'s aggregated daily agent
 * report (which already feeds `performanceReports.callsToday`/etc.). Feeds
 * the "Interaktionen" evaluation (first/last interaction, count, total and
 * average duration per day) shown on the dashboard and employee detail
 * pages.
 *
 * `Benutzer` can list several agents on one interaction (transfer/
 * conference) — every matched name gets its own row, since each of them
 * genuinely handled it.
 */
import {
  cleanAgentName,
  normHeader,
  parseCsvText,
  parseDuration,
  sniffDelimiter,
} from "./callImport";
import { type CellValue } from "./types";
import { toISODate } from "./workdays";

const INTERACTION_ALIASES: Record<string, string[]> = {
  employee: ["benutzer", "agent", "agentenname", "mitarbeiter"],
  date: ["datum"],
  duration: ["dauer"],
  direction: ["richtung"],
  complete: ["vollstaendigerexportabgeschlossen"],
};

const ALIAS_LOOKUP = new Map<string, string>();
for (const [field, aliases] of Object.entries(INTERACTION_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP.set(alias, field);
}

/** 'JA'/'YES' -> true. Only rows from a fully-completed export are
 * imported — a row still in progress when the export ran (`NEIN`) may
 * reappear complete in a later export of the same period. */
function isComplete(v: CellValue): boolean {
  const s = normHeader(v);
  return s === "ja" || s === "yes";
}

// A single interaction here is one call or chat, which never plausibly
// runs anywhere near callImport.ts's day-sized fields — so its bare-number
// ms-vs-seconds decision can't reuse that module's full-day ceiling (a
// millisecond-encoded short interaction, e.g. an unanswered/quickly-
// dropped outbound dial at ~18780ms, never crosses a day-sized threshold
// and gets stored as that many literal seconds: 5h13m). But a *per-row*
// ceiling here still misreads a short-enough millisecond value (e.g.
// 2500ms, comfortably under any sane per-row ceiling) as that many
// literal seconds. So this is used only to decide the unit once for the
// whole file (see `detectMillisEncoding` below): any bare number that's
// implausible as one interaction's literal seconds-count can only be
// milliseconds, and once one row in the file proves that, every bare
// number in the same column is milliseconds too.
const MAX_PLAUSIBLE_INTERACTION_SECONDS = 3_600;

/** Bare `Dauer` cells (no unit suffix) are ambiguous per row — decide the
 * whole file's unit once, from the strongest evidence across every row,
 * rather than converting (or not) based on each row's own magnitude.
 * Cells with an explicit unit (`HH:MM:SS`, `1h 20m 15s`, …) already state
 * their own unit and are excluded from both the detection and the
 * resulting conversion. */
function detectMillisEncoding(table: string[][], durationCol: number): boolean {
  for (const r of table.slice(1)) {
    let isMillis = false;
    parseDuration(r[durationCol] ?? "", undefined, Number.POSITIVE_INFINITY, (raw) => {
      if (raw > MAX_PLAUSIBLE_INTERACTION_SECONDS) isMillis = true;
    });
    if (isMillis) return true;
  }
  return false;
}

/** '01.07.26 07:40' -> a Date carrying that wall-clock value directly as
 * UTC fields. The source has no timezone of its own; treating the literal
 * digits as UTC (rather than guessing a zone) keeps day/ordering
 * arithmetic simple and matches `workdays.ts`'s UTC-midnight convention
 * for date-only values, extended here with time-of-day. */
function parseTimestamp(v: CellValue): Date | null {
  if (v instanceof Date) return v;
  if (v === null || v === undefined || v === "") return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  return new Date(Date.UTC(2000 + +y, +mo - 1, +d, +h, +mi));
}

export interface InteractionRow {
  /** Cleaned ('(Consulting For Edenred)' stripped) but not yet matched
   * against the team roster — matching happens in
   * `performanceUploadParse.ts`, same split as `callImport.ts`'s `CallRow`
   * vs. `matchEmployee`. */
  names: string[];
  startedAt: number;
  date: string;
  durationSec: number;
  direction: string | undefined;
}

/** Detects and parses the "Interaktionen" CSV export. Returns null when the
 * file isn't recognized as this report type at all (missing the
 * employee/date/duration columns this format requires) — as opposed to
 * recognized-but-empty, which returns an empty array. */
export function readInteractionsCsv(text: string): InteractionRow[] | null {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = sniffDelimiter(firstLine);
  const table = parseCsvText(text, delimiter);
  if (table.length === 0) return null;

  const headers = table[0];
  const colmap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const f = ALIAS_LOOKUP.get(normHeader(h));
    if (f && !(f in colmap)) colmap[f] = idx;
  });
  if (!("employee" in colmap) || !("date" in colmap) || !("duration" in colmap)) {
    return null;
  }

  const millisEncoded = detectMillisEncoding(table, colmap.duration);

  const rows: InteractionRow[] = [];
  for (const r of table.slice(1)) {
    if (r.every((v) => v === null || v === undefined || v === "")) continue;

    if ("complete" in colmap && !isComplete(r[colmap.complete] ?? "")) continue;

    const namesRaw = r[colmap.employee] ?? "";
    if (!namesRaw.trim()) continue; // no agent attributed (e.g. unanswered/queued)

    const started = parseTimestamp(r[colmap.date] ?? "");
    if (!started) continue;

    let bareRawSeconds: number | undefined;
    const parsed = parseDuration(
      r[colmap.duration] ?? "",
      undefined,
      Number.POSITIVE_INFINITY,
      (raw) => {
        bareRawSeconds = raw;
      },
    );
    const durationSec =
      bareRawSeconds !== undefined && millisEncoded ? Math.round(bareRawSeconds / 1000) : parsed;
    if (durationSec === null) continue;

    const names = namesRaw
      .split(";")
      .map((n) => cleanAgentName(n))
      .filter((n) => n.length > 0);
    if (names.length === 0) continue;

    rows.push({
      names,
      startedAt: started.getTime(),
      date: toISODate(started),
      durationSec,
      direction: "direction" in colmap ? r[colmap.direction] || undefined : undefined,
    });
  }
  return rows;
}
