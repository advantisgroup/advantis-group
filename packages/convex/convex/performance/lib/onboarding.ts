/**
 * Onboarding-Cockpit: pure helpers shared by the Convex functions
 * (`performance/onboarding.ts`) and the browser import (exported as
 * `@advantis/convex/performance/onboarding`). No Convex imports here.
 *
 * A case is one UTA new customer after signing, keyed by its customer
 * number. The status is kept in the intranet (decision 10/2026): a re-import
 * refreshes name and report columns but never the status or assignee.
 */

/** Working stages of a case, in order. The labels live in the
 * `OnboardingCockpit` translations. Placeholder set from the boss's
 * prototype until the team says what the steps mean. */
export const ONBOARDING_STATUSES = ["fresh", "step1", "step2", "done"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export function isOnboardingStatus(value: string): value is OnboardingStatus {
  return (ONBOARDING_STATUSES as readonly string[]).includes(value);
}

/** Closed cases drop out of open counts, prio and follow-ups. */
export function isClosedStatus(status: string): boolean {
  return status === "done";
}

/** What a contact-log entry records. `status`/`assign`/`prio` are written
 * by the system when someone changes the case, the rest by people. */
export const ONBOARDING_CONTACT_KINDS = [
  "reached",
  "not_reached",
  "email",
  "note",
  "status",
  "assign",
] as const;
export type OnboardingContactKind = (typeof ONBOARDING_CONTACT_KINDS)[number];

/** The kinds a person logs by hand (the rest are system entries). */
export const MANUAL_CONTACT_KINDS = ["reached", "not_reached", "email", "note"] as const;
export type ManualContactKind = (typeof MANUAL_CONTACT_KINDS)[number];

/** Kinds that count as an attempt to reach the customer. */
export function isContactAttempt(kind: string): boolean {
  return kind === "reached" || kind === "not_reached" || kind === "email";
}

/**
 * Match key for a customer number: digits only without leading zeros, so
 * "000663470", "663470" and Excel's "663470.0" are the same customer.
 * Numbers without any digit fall back to their letters, upper-cased.
 */
export function customerKey(value: unknown): string {
  const text = String(value ?? "")
    .trim()
    .replace(/\.0+$/, "");
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  if (digits) return digits;
  return text.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Best guess of the intranet stage for a brand-new case from the
 * report's own status column. Only used when a case is first created. */
export function statusFromReport(text: string | undefined): OnboardingStatus {
  const t = (text ?? "").toLowerCase();
  if (/done|abgeschlossen|closed|erledigt|complete/.test(t)) return "done";
  if (/(step|schritt)\s*2/.test(t)) return "step2";
  if (/progress|step|schritt|bearbeitung/.test(t)) return "step1";
  return "fresh";
}

/** The report columns the cockpit knows. Everything else is kept as
 * "further report columns" on the case. */
export const REPORT_COLUMNS = ["number", "name", "status", "owner", "date"] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];
export type ColumnMap = Record<ReportColumn, number>;

const COLUMN_PATTERNS: Record<ReportColumn, RegExp> = {
  number: /customer.?(number|no|nr)|kunden.?(nummer|nr)|account.?(number|nr)|debitor/i,
  name: /account.?name|kunden.?name|firmen.?name|company|^kunde$|^account$|^name$|firma/i,
  status: /onboarding.?status|^status|stage|phase|substatus|status/i,
  owner: /owner|zugewiesen|consultant|bearbeiter|assigned|verantwortlich|inhaber/i,
  date: /created|erstellt|close.?date|datum|date/i,
};

/** Column index per known field, -1 when nothing matches. Each column is
 * used for at most one field, in the order of `REPORT_COLUMNS`. */
export function guessColumns(headers: string[]): ColumnMap {
  const taken = new Set<number>();
  const map = {} as ColumnMap;
  for (const key of REPORT_COLUMNS) {
    const index = headers.findIndex((h, i) => !taken.has(i) && COLUMN_PATTERNS[key].test(h));
    map[key] = index;
    if (index >= 0) taken.add(index);
  }
  return map;
}

/** Salesforce exports often start with title lines: the header is the
 * first of the top rows with at least two text cells. */
export function findHeaderRow(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const texts = (rows[r] ?? []).filter((v) => typeof v === "string" && v.trim()).length;
    if (texts >= 2) return r;
  }
  return 0;
}

/** "2026-10-27" from an ISO, German (27.10.2026) or US (10/27/2026) date,
 * or a JS Date; "" when it isn't one. */
export function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const year = (y: string) => (y.length === 2 ? `20${y}` : y);
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (de) return `${year(de[3])}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return `${year(us[3])}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return "";
}

/** One report row as the import sends it to Convex. */
export interface ReportRowInput {
  customerNumber: string;
  name?: string;
  reportStatus?: string;
  reportOwner?: string;
  reportDate?: string;
  fields?: { label: string; value: string }[];
}

/** Most further columns a case keeps from the report. */
export const MAX_REPORT_FIELDS = 30;

function cellText(value: unknown): string {
  if (value instanceof Date) return toIsoDate(value);
  return String(value ?? "").trim();
}

/**
 * Turns the sheet rows below the header into import rows, using `map` for
 * the known columns and keeping the others as label/value pairs. Rows
 * without a customer number are skipped, a number seen twice counts once
 * (first row wins).
 */
export function reportRows(
  headers: string[],
  rows: unknown[][],
  map: ColumnMap,
): { rows: ReportRowInput[]; skipped: number; duplicates: number } {
  const known = new Set(Object.values(map).filter((i) => i >= 0));
  const seen = new Set<string>();
  const out: ReportRowInput[] = [];
  let skipped = 0;
  let duplicates = 0;
  const at = (row: unknown[], i: number) => (i >= 0 ? cellText(row[i]) : "");
  for (const row of rows) {
    if (!row.some((v) => cellText(v) !== "")) continue;
    const number = at(row, map.number).replace(/\.0+$/, "");
    const key = customerKey(number);
    if (!key) {
      skipped++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    const fields: { label: string; value: string }[] = [];
    headers.forEach((label, i) => {
      if (known.has(i) || fields.length >= MAX_REPORT_FIELDS) return;
      const value = cellText(row[i]);
      if (value) fields.push({ label: label.slice(0, 80), value: value.slice(0, 500) });
    });
    out.push({
      customerNumber: number.slice(0, 60),
      name: at(row, map.name).slice(0, 200) || undefined,
      reportStatus: at(row, map.status).slice(0, 120) || undefined,
      reportOwner: at(row, map.owner).slice(0, 120) || undefined,
      reportDate: map.date >= 0 ? toIsoDate(row[map.date]) || undefined : undefined,
      fields,
    });
  }
  return { rows: out, skipped, duplicates };
}

/** Follow-up buckets relative to `today` (both "YYYY-MM-DD"). */
export function followUpBucket(
  date: string | undefined,
  today: string,
): "none" | "overdue" | "today" | "week" | "later" {
  if (!date) return "none";
  if (date < today) return "overdue";
  if (date === today) return "today";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return date <= d.toISOString().slice(0, 10) ? "week" : "later";
}
