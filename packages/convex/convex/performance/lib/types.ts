/**
 * Shared types for the Performance report-import pipeline
 * (`salesforceImport.ts`, `callImport.ts`, `performanceImport.ts`).
 */

/**
 * A single Excel/CSV cell as read by the parsing layer (`apps/api`'s
 * upload route). Date cells must already be normalized to UTC-midnight
 * `Date` objects by the time they reach this layer — configure the sheet
 * reader (`cellDates: true`, UTC) accordingly at the call site.
 */
export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetRow = CellValue[];

/** Mirrors `METRIC_KEYS` / the `reports` table columns in the reference
 * script, camelCased to match `performanceReports`. */
export interface MetricFields {
  leadsCreated: number;
  workableCreated: number;
  leadsAnalysis: number;
  leadsDetailsIdent: number;
  oppsOpen: number;
  oppsClose7d: number;
  oppsPending: number;
  wonMonth: number;
  callsToday: number;
  overduesAnalysis: number;
  overduesOpps: number;
  oppsOver30: number;
  leadsNoAction14: number;
  oppsNoAction14: number;
  callsAnswered: number;
  callsOutbound: number;
  talkTotalSec: number;
  talkAvgSec: number;
  loginSec: number;
}

/** Canonical field order, matching the reference script's `METRICS` list
 * (`sales_team_monitor.py`, "METRICS ="). Also the daily-value subset
 * (`DAILY_KEYS`) that gets summed over a date range rather than read as a
 * latest-snapshot, per call-report metrics. */
export const METRIC_KEYS: (keyof MetricFields)[] = [
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
];

export const DAILY_KEYS: (keyof MetricFields)[] = [
  "callsToday",
  "callsAnswered",
  "callsOutbound",
  "talkTotalSec",
  "loginSec",
];

/** A snapshot's fields are always partial — a snapshot only ever carries
 * the metrics its source report actually measured (see
 * `performanceReports` in `schema.ts`: null means "not measured", not
 * zero). */
export type SnapshotFields = Partial<MetricFields> & {
  unqualifiedReasons?: string;
};

export interface EmployeeSnapshot {
  employeeName: string;
  reportDate: string; // ISO "YYYY-MM-DD"
  fields: SnapshotFields;
}

/**
 * Accumulates partial per-(employee, day) field updates the same way the
 * reference script's `out.setdefault(key, {}).update(vals)` does: a later
 * merge for the same key overwrites only the fields it mentions, leaving
 * any fields written by an earlier merge for that same key untouched.
 *
 * Nested by employee then date rather than a joined string key, since an
 * employee name can contain arbitrary characters and no string separator
 * is provably safe to split back apart.
 */
export class SnapshotMap {
  private readonly byEmployee = new Map<string, Map<string, SnapshotFields>>();

  merge(employeeName: string, reportDate: string, fields: SnapshotFields): void {
    let byDate = this.byEmployee.get(employeeName);
    if (!byDate) {
      byDate = new Map();
      this.byEmployee.set(employeeName, byDate);
    }
    const existing = byDate.get(reportDate);
    if (existing) {
      Object.assign(existing, fields);
    } else {
      byDate.set(reportDate, { ...fields });
    }
  }

  toArray(): EmployeeSnapshot[] {
    const out: EmployeeSnapshot[] = [];
    for (const [employeeName, byDate] of this.byEmployee) {
      for (const [reportDate, fields] of byDate) {
        out.push({ employeeName, reportDate, fields });
      }
    }
    return out;
  }
}

/** `Counter.most_common()`-equivalent formatting: sorted by count
 * descending, ties broken by insertion order (`Array#sort` is stable, same
 * as Python's). */
export function mostCommonText(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}
