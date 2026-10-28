/**
 * Onboarding-Cockpit: pure helpers shared by the Convex functions
 * (`performance/onboarding.ts`) and the browser import (exported as
 * `@advantis/convex/performance/onboarding`). No Convex imports here.
 *
 * A case is one UTA new customer after signing, keyed by its customer
 * number. The status is kept in the intranet (decision 10/2026): a re-import
 * refreshes name and report columns but never the status or assignee.
 */

// ------------------------------------------------------- phase and status
//
// Decision 28.10.2026 (Vahan), two separate things:
//
// 1. The *phase*: a fixed ladder, driven by three milestone ticks.
//      fresh  Neu            – never contacted
//      step1  In Kontakt     – contacted, cards not ordered yet
//      step2  Karten bestellt – first fuelling still open
//      step3  Getankt        – only the two-month check left (low priority)
//      done   Abgeschlossen  – two-month check done
//      winback               – will cancel; closed, on the winback list
//    (The ids step1–3 are kept from the first version so stored cases keep
//    their place.)
//
// 2. The *situation* ("Lage") of the last contact: not reached, follow up,
//    case opened › reason, will cancel › reason … – a tree the admins can
//    extend. It is a label, not a stage; only "will cancel" changes the
//    phase (→ winback).

export const PHASES = ["fresh", "step1", "step2", "step3"] as const;
export type Phase = (typeof PHASES)[number];

/** Closed states after the phases. */
export const CLOSED_STATUSES = ["done", "winback"] as const;

/** Closed cases drop out of open counts, prio and follow-ups. */
export function isClosedStatus(status: string): boolean {
  return status === "done" || status === "winback";
}

export function isValidStatus(status: string): boolean {
  return (
    (PHASES as readonly string[]).includes(status) ||
    (CLOSED_STATUSES as readonly string[]).includes(status)
  );
}

/** Sort rank of a phase: earlier phases first, "Getankt" (only the
 * two-month check left) last among the open ones. */
export function phaseRank(status: string): number {
  const i = (PHASES as readonly string[]).indexOf(status);
  return i >= 0 ? i : 9;
}

/** The three milestone ticks, in order, with the phase each one reaches. */
export const MILESTONES = ["cards", "fuel", "twoMonth"] as const;
export type Milestone = (typeof MILESTONES)[number];

const MILESTONE_PHASE: Record<Milestone, string> = {
  cards: "step2",
  fuel: "step3",
  twoMonth: "done",
};

/** Milestones of a case. Understands the first versions too: stage ids
 * ("step1" = cards …) and the old step timestamps. */
export function milestonesOf(row: {
  milestonesDone?: string[];
  cardsOrderedAt?: number;
  fuelledAt?: number;
  twoMonthCheckAt?: number;
}): Milestone[] {
  const legacy: Record<string, Milestone> = { step1: "cards", step2: "fuel", step3: "twoMonth" };
  const out = new Set<Milestone>();
  if (row.milestonesDone) {
    for (const m of row.milestonesDone) {
      const key = (MILESTONES as readonly string[]).includes(m) ? (m as Milestone) : legacy[m];
      if (key) out.add(key);
    }
  } else {
    if (row.cardsOrderedAt !== undefined) out.add("cards");
    if (row.fuelledAt !== undefined) out.add("fuel");
    if (row.twoMonthCheckAt !== undefined) out.add("twoMonth");
  }
  return MILESTONES.filter((m) => out.has(m));
}

/** Ticking a milestone also ticks the ones before it; unticking one also
 * unticks the ones after it (the ladder only goes one way). */
export function setMilestone(current: Milestone[], key: Milestone, done: boolean): Milestone[] {
  const i = MILESTONES.indexOf(key);
  if (done) return MILESTONES.filter((m, k) => k <= i || current.includes(m));
  return MILESTONES.filter((m, k) => k < i && current.includes(m));
}

/** The phase that follows from the milestones; without any, a contacted
 * case is "In Kontakt", an untouched one "Neu". */
export function phaseFor(milestones: Milestone[], contacted: boolean): string {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (milestones.includes(MILESTONES[i])) return MILESTONE_PHASE[MILESTONES[i]];
  }
  return contacted ? "step1" : "fresh";
}

/** Milestones implied by a report status, for new cases from an import. */
export function milestonesForStatus(status: string): Milestone[] {
  if (status === "step2") return ["cards"];
  if (status === "step3") return ["cards", "fuel"];
  if (status === "done") return ["cards", "fuel", "twoMonth"];
  return [];
}

// ------------------------------------------------------------- situation

export const OUTCOME_KINDS = [
  "reached",
  "notReached",
  "followUp",
  "case",
  "cancel",
  "other",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export interface OutcomeLeaf {
  id: string;
  label: string;
  /** Asks for free text when picked (e.g. "other (freetext)"). */
  freetext?: boolean;
  /** Hidden for new picks; old cases still show it. */
  archived?: boolean;
}
export interface OutcomeMid extends OutcomeLeaf {
  children?: OutcomeLeaf[];
}
export interface OutcomeTop extends OutcomeLeaf {
  kind: OutcomeKind;
  children?: OutcomeMid[];
}
export interface StatusConfig {
  outcomes: OutcomeTop[];
}

type AnyNode = OutcomeLeaf & { kind?: OutcomeKind; children?: AnyNode[] };

const leaf = (id: string, label: string, freetext?: boolean): OutcomeLeaf =>
  freetext ? { id, label, freetext } : { id, label };

/** The situations and reasons from the list of 28.10.2026, merged across
 * the former steps. Admins can rename, extend and hide entries. */
export const DEFAULT_STATUS_CONFIG: StatusConfig = {
  outcomes: [
    { id: "reached", label: "erreicht – alles ok", kind: "reached" },
    { id: "notReached", label: "nicht erreicht", kind: "notReached" },
    { id: "followUp", label: "Follow-up", kind: "followUp" },
    {
      id: "case",
      label: "Case eröffnet",
      kind: "case",
      children: [
        {
          id: "case.login",
          label: "login problem",
          children: [
            leaf("case.login.welcome", "no welcome mail"),
            leaf("case.login.problems", "problems with login"),
          ],
        },
        {
          id: "case.credit",
          label: "credit problem",
          children: [
            leaf("case.credit.prepaid", "Prepaid"),
            leaf("case.credit.limit", "Credit Limit"),
            leaf("case.credit.deposit", "Deposit"),
          ],
        },
        { id: "case.bundle", label: "wrong bundle" },
        { id: "case.delivery", label: "card delivery problem" },
        { id: "case.it", label: "IT other problems" },
        { id: "case.care", label: "customer care problem" },
      ],
    },
    {
      id: "cancel",
      label: "wird kündigen",
      kind: "cancel",
      children: [
        {
          id: "cancel.unsatisfied",
          label: "not satisfied",
          children: [
            leaf("cancel.unsatisfied.credit", "credit"),
            leaf("cancel.unsatisfied.network", "network"),
            leaf("cancel.unsatisfied.discount", "discount"),
            leaf("cancel.unsatisfied.service", "service"),
            leaf("cancel.unsatisfied.other", "other (freetext)", true),
          ],
        },
        { id: "cancel.competition", label: "better offer from competition", freetext: true },
        { id: "cancel.other", label: "other (freetext)", freetext: true },
      ],
    },
  ],
};

/** The nodes along `path`, or null when the path doesn't exist. */
export function resolvePath(config: StatusConfig, path: string[]): AnyNode[] | null {
  if (path.length === 0) return null;
  const nodes: AnyNode[] = [];
  let level: AnyNode[] = config.outcomes;
  for (const id of path) {
    const node = level.find((n) => n.id === id);
    if (!node) return null;
    nodes.push(node);
    level = node.children ?? [];
  }
  return nodes;
}

/** Children someone can still pick (hidden ones left out). */
export function activeChildren(node: { children?: AnyNode[] }): AnyNode[] {
  return (node.children ?? []).filter((c) => !c.archived);
}

/** "Case eröffnet › login problem › no welcome mail" (null when the path
 * doesn't resolve, e.g. from the first version of the tree). */
export function pathLabel(config: StatusConfig, path: string[]): string | null {
  const nodes = resolvePath(config, path);
  return nodes ? nodes.map((n) => n.label).join(" › ") : null;
}

/** Every node id of a config, for "nothing was deleted" checks. */
export function allNodeIds(config: StatusConfig): string[] {
  const ids: string[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const n of nodes) {
      ids.push(n.id);
      walk(n.children ?? []);
    }
  };
  walk(config.outcomes);
  return ids;
}

/** Problems with an edited tree (empty = fine). */
export function validateStatusConfig(next: StatusConfig, previous: StatusConfig): string[] {
  const errors: string[] = [];
  const ids = allNodeIds(next);
  if (new Set(ids).size !== ids.length) errors.push("Einträge doppelt.");
  const kept = new Set(ids);
  for (const id of allNodeIds(previous)) {
    if (!kept.has(id)) errors.push(`Eintrag ${id} fehlt – ausblenden statt löschen.`);
  }
  const labels = (nodes: AnyNode[]): boolean =>
    nodes.every((n) => n.label.trim() !== "" && labels(n.children ?? []));
  if (!labels(next.outcomes)) errors.push("Jeder Eintrag braucht eine Bezeichnung.");
  if (ids.length > 600) errors.push("Zu viele Einträge.");
  return errors;
}

// -------------------------------------------------------------- follow-up

/** Follow-up times are on the quarter hour. */
export function isQuarterHour(time: string): boolean {
  return /^([01]\d|2[0-3]):(00|15|30|45)$/.test(time);
}

/** Slots the time picker offers. */
export const FOLLOW_UP_FIRST_SLOT = "06:00";
export const FOLLOW_UP_LAST_SLOT = "21:45";

export function quarterSlots(): string[] {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 21 * 60 + 45; m += 15) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** What a follow-up is suggested for: after a contact (2 days), after
 * cards were ordered (1 week, to check the first fuelling) or after the
 * first fuelling (2 months, the two-month check). */
export type FollowUpReason = "contact" | "cards" | "fuel";

/**
 * The suggested follow-up (Vahan, 28.10.): 2 days / 1 week / 2 months from
 * now at the current Berlin time rounded up to the next quarter hour; a
 * Saturday or Sunday moves to Monday. Example: Wednesday 15:37 → Friday
 * 15:45; Thursday or Friday → Monday.
 */
export function suggestFollowUp(now: Date, reason: FollowUpReason): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  let minutes = Number(parts.hour) * 60 + Number(parts.minute);
  minutes = Math.ceil(minutes / 15) * 15;
  minutes = Math.min(Math.max(minutes, 6 * 60), 21 * 60 + 45);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (reason === "contact") d.setUTCDate(d.getUTCDate() + 2);
  else if (reason === "cards") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 2);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  const weekday = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (weekday === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (weekday === 0) d.setUTCDate(d.getUTCDate() + 1);
  return { date: d.toISOString().slice(0, 10), time };
}

/** What a contact-log entry records. `status`/`milestone`/`outcome`/
 * `assign`/`created`/`followUp` (moved) are written by the system when
 * someone changes the case, the rest by people. `step` is from the first
 * version. */
export const ONBOARDING_CONTACT_KINDS = [
  "reached",
  "not_reached",
  "email",
  "note",
  "status",
  "outcome",
  "milestone",
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
export function statusFromReport(text: string | undefined): string {
  const t = (text ?? "").toLowerCase();
  if (/done|abgeschlossen|closed|erledigt|complete/.test(t)) return "done";
  if (/(step|schritt)\s*3/.test(t)) return "step3";
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
