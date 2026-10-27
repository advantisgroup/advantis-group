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
 * `OnboardingCockpit` translations. The stage follows from how many of the
 * three onboarding steps are done (decision 10/2026): none = fresh,
 * 1 = step1, 2 = step2, all three = done. */
export const ONBOARDING_STATUSES = ["fresh", "step1", "step2", "done"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/** The three onboarding steps of a new customer, in order: cards ordered
 * (KAR), first fuelling (TAN), two-month check (2M). */
export const ONBOARDING_STEPS = ["cards", "fuel", "twoMonth"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type StepState = Record<OnboardingStep, boolean>;

/** Short codes the team uses for the steps (substatus suggestions). */
export const STEP_CODES: Record<OnboardingStep, string> = {
  cards: "KAR",
  fuel: "TAN",
  twoMonth: "2M",
};

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Stage from the steps: how many of the three are done. */
export function statusFromSteps(steps: StepState): OnboardingStatus {
  const done = ONBOARDING_STEPS.filter((s) => steps[s]).length;
  return ONBOARDING_STATUSES[done];
}

/** Steps implied by a stage (for cases from before the steps existed, and
 * for new cases from the report's status). */
export function stepsFromStatus(status: string): StepState {
  const n = Math.max(0, ONBOARDING_STATUSES.indexOf(status as OnboardingStatus));
  return { cards: n >= 1, fuel: n >= 2, twoMonth: n >= 3 };
}

/** The step fields of a case row: a timestamp when done. */
export interface StepFields {
  status: string;
  cardsOrderedAt?: number;
  fuelledAt?: number;
  twoMonthCheckAt?: number;
}

export const STEP_FIELD: Record<
  OnboardingStep,
  "cardsOrderedAt" | "fuelledAt" | "twoMonthCheckAt"
> = {
  cards: "cardsOrderedAt",
  fuel: "fuelledAt",
  twoMonth: "twoMonthCheckAt",
};

/** Which steps a case has done. Rows without any step timestamp (created
 * before the steps existed) fall back to their stage. */
export function stepsOf(row: StepFields): StepState {
  const any = ONBOARDING_STEPS.some((s) => row[STEP_FIELD[s]] !== undefined);
  if (!any) return stepsFromStatus(row.status);
  return {
    cards: row.cardsOrderedAt !== undefined,
    fuel: row.fuelledAt !== undefined,
    twoMonth: row.twoMonthCheckAt !== undefined,
  };
}

export function isOnboardingStatus(value: string): value is OnboardingStatus {
  return (ONBOARDING_STATUSES as readonly string[]).includes(value);
}

/** Closed cases drop out of open counts, prio and follow-ups. */
export function isClosedStatus(status: string): boolean {
  return status === "done";
}

/** What a contact-log entry records. `status`/`step`/`assign`/`created`/
 * `followUp` (moved) are written by the system when someone changes the case, the rest by
 * people. */
export const ONBOARDING_CONTACT_KINDS = [
  "reached",
  "not_reached",
  "email",
  "note",
  "status",
  "step",
  "assign",
  "created",
  "followUp",
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
export const REPORT_COLUMNS = [
  "number",
  "name",
  "status",
  "accountStatus",
  "closeDate",
  "owner",
  "date",
] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];
export type ColumnMap = Record<ReportColumn, number>;

const COLUMN_PATTERNS: Record<ReportColumn, RegExp> = {
  number: /customer.?(number|no|nr)|kunden.?(nummer|nr)|account.?(number|nr)|debitor/i,
  name: /account.?name|kunden.?name|firmen.?name|company|^kunde$|^account$|^name$|firma/i,
  accountStatus: /account.?status|konto.?status|kunden.?status/i,
  closeDate: /close.?date|abschluss.?datum|vertrags.?datum|closed.?on/i,
  status: /onboarding.?status|^status|stage|phase|substatus|status/i,
  owner: /owner|zugewiesen|consultant|bearbeiter|assigned|verantwortlich|inhaber/i,
  date: /created|erstellt|datum|date/i,
};

/** Guessing order: the specific columns (account status, close date) go
 * before the general ones that would also match them. */
const GUESS_ORDER: ReportColumn[] = [
  "number",
  "name",
  "accountStatus",
  "closeDate",
  "status",
  "owner",
  "date",
];

/** Column index per known field, -1 when nothing matches. Each column is
 * used for at most one field. */
export function guessColumns(headers: string[]): ColumnMap {
  const taken = new Set<number>();
  const map = {} as ColumnMap;
  for (const key of GUESS_ORDER) {
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
  accountStatus?: string;
  closeDate?: string;
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
      accountStatus: at(row, map.accountStatus).slice(0, 120) || undefined,
      closeDate: map.closeDate >= 0 ? toIsoDate(row[map.closeDate]) || undefined : undefined,
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

/**
 * Balanced split of `total` new cases: fills the people with the fewest
 * open new cases first, so everyone ends up as level as possible ("water
 * filling"). Example: 100 to split, A has 100 new, B has 50 → B gets 75,
 * A gets 25 (both end at 125). Returns the number of cases per person, in
 * the order given; the counts always add up to `total`.
 */
export function balancedSplit(current: number[], total: number): number[] {
  const n = current.length;
  if (n === 0 || total <= 0) return current.map(() => 0);
  // Find the fill level L (real) where sum(max(0, L - c)) = total.
  const sorted = [...current].sort((a, b) => a - b);
  let level = sorted[0];
  let remaining = total;
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? sorted[i + 1] : Infinity;
    const width = i + 1; // people at or below the current level
    const room = (next - level) * width;
    if (remaining <= room) {
      level += remaining / width;
      remaining = 0;
      break;
    }
    remaining -= room;
    level = next;
  }
  // Integer shares; the leftover units go to whoever is lowest after flooring.
  const share = current.map((c) => Math.max(0, Math.floor(level - c)));
  let left = total - share.reduce((a, b) => a + b, 0);
  const order = current
    .map((c, i) => ({ i, after: c + share[i], c }))
    .sort((a, b) => a.after - b.after || a.c - b.c || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) share[order[k].i]++;
  return share;
}
