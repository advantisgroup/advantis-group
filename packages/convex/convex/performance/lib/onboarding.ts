/**
 * Onboarding-Cockpit: pure helpers shared by the Convex functions
 * (`performance/onboarding.ts`) and the browser import (exported as
 * `@advantis/convex/performance/onboarding`). No Convex imports here.
 *
 * A case is one UTA new customer after signing, keyed by its customer
 * number. The status is kept in the intranet (decision 10/2026): a re-import
 * refreshes name and report columns but never the status or assignee.
 */

// ------------------------------------------------------------ status tree
//
// Decision 28.10.2026 (Vahan): a case moves through stages (Fresh (no
// call), Progress Step 1–3). In each stage the team records an *outcome*
// from a tree the admins can extend: result → reason → sub-reason, some
// with free text. Each stage also has one milestone tick ("Zwischenstatus":
// cards ordered, first fuelling, two-month check). The outcome kind drives
// what happens next:
//   success  → the case moves on to the next stage (after the last: done)
//   cancel   → the case is closed and lands on the winback list
//   others   → stay in the stage (follow up, not reached, case opened …)

/** Closed states beside the configurable stages. */
export const CLOSED_STATUSES = ["done", "winback"] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

/** Closed cases drop out of open counts, prio and follow-ups. */
export function isClosedStatus(status: string): boolean {
  return status === "done" || status === "winback";
}

export const OUTCOME_KINDS = [
  "success",
  "followUp",
  "notReached",
  "cancel",
  "case",
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
export interface StatusStage {
  id: string;
  label: string;
  /** The stage's milestone tick ("Zwischenstatus"), e.g. cards ordered. */
  milestone?: string;
  archived?: boolean;
  options: OutcomeTop[];
}
export interface StatusConfig {
  stages: StatusStage[];
}

type AnyNode = OutcomeLeaf & { kind?: OutcomeKind; children?: AnyNode[] };

const leaf = (id: string, label: string, freetext?: boolean): OutcomeLeaf =>
  freetext ? { id, label, freetext } : { id, label };

const credit = (p: string): OutcomeMid => ({
  id: `${p}.credit`,
  label: "credit problem",
  children: [
    leaf(`${p}.credit.prepaid`, "Prepaid"),
    leaf(`${p}.credit.limit`, "Credit Limit"),
    leaf(`${p}.credit.deposit`, "Deposit"),
  ],
});

/** Step 2 and 3 share their outcomes (list from 28.10.2026). */
function laterStep(p: string, label: string): OutcomeTop[] {
  return [
    { id: `${p}.success`, label, kind: "success" },
    { id: `${p}.followUp`, label: "follow up", kind: "followUp" },
    { id: `${p}.notReached`, label: "not reached", kind: "notReached" },
    {
      id: `${p}.cancel`,
      label: "will cancel",
      kind: "cancel",
      children: [
        {
          id: `${p}.cancel.unsatisfied`,
          label: "not satisfied",
          children: [
            leaf(`${p}.cancel.unsatisfied.credit`, "credit"),
            leaf(`${p}.cancel.unsatisfied.network`, "network"),
            leaf(`${p}.cancel.unsatisfied.discount`, "discount"),
            leaf(`${p}.cancel.unsatisfied.service`, "service"),
            leaf(`${p}.cancel.unsatisfied.other`, "other (freetext)", true),
          ],
        },
        {
          id: `${p}.cancel.competition`,
          label: "better offer from competition",
          freetext: true,
        },
      ],
    },
    { id: `${p}.case`, label: "case opened", kind: "case" },
    { ...credit(p), kind: "case" },
    { id: `${p}.bundle`, label: "wrong bundle", kind: "case" },
    { id: `${p}.delivery`, label: "card delivery problems", kind: "case" },
    { id: `${p}.it`, label: "IT other problems", kind: "case" },
    { id: `${p}.care`, label: "customer care problem", kind: "case" },
  ];
}

/** The stages and outcomes as handed over on 28.10.2026. Admins can rename,
 * extend and hide entries in the cockpit (`onboardingStatusConfig`). */
export const DEFAULT_STATUS_CONFIG: StatusConfig = {
  stages: [
    { id: "fresh", label: "Fresh (no call)", options: [] },
    {
      id: "step1",
      label: "Progress Step 1",
      milestone: "Karten bestellt",
      options: [
        { id: "s1.success", label: "Step 1 successful reached (final)", kind: "success" },
        { id: "s1.followUp", label: "follow up", kind: "followUp" },
        { id: "s1.notReached", label: "not reached", kind: "notReached" },
        { id: "s1.cancel", label: "will cancel", kind: "cancel" },
        {
          id: "s1.case",
          label: "case opened",
          kind: "case",
          children: [
            {
              id: "s1.case.login",
              label: "login problem",
              children: [
                leaf("s1.case.login.welcome", "no welcome mail"),
                leaf("s1.case.login.problems", "problems with login"),
              ],
            },
            credit("s1.case"),
            { id: "s1.case.bundle", label: "wrong bundle" },
            { id: "s1.case.delivery", label: "card delivery problem" },
            { id: "s1.case.it", label: "IT other problems" },
          ],
        },
      ],
    },
    {
      id: "step2",
      label: "Progress Step 2",
      milestone: "Erste Tankung",
      options: laterStep("s2", "Step 2 successful reached (final)"),
    },
    {
      id: "step3",
      label: "Progress Step 3",
      milestone: "2-Monats-Check",
      options: laterStep("s3", "Step 3 successful reached (final)"),
    },
  ],
};

export function findStage(config: StatusConfig, id: string): StatusStage | undefined {
  return config.stages.find((s) => s.id === id);
}

export function isStageId(config: StatusConfig, id: string): boolean {
  return config.stages.some((s) => s.id === id);
}

/** A stage id or one of the closed states. */
export function isValidStatus(config: StatusConfig, status: string): boolean {
  return isStageId(config, status) || (CLOSED_STATUSES as readonly string[]).includes(status);
}

/** The stage after `id` (skipping hidden ones), or "done" after the last. */
export function nextStatus(config: StatusConfig, id: string): string {
  const i = config.stages.findIndex((s) => s.id === id);
  for (let k = i + 1; k < config.stages.length; k++) {
    if (!config.stages[k].archived) return config.stages[k].id;
  }
  return "done";
}

/** The nodes along `path` in `stageId`, or null when the path doesn't exist. */
export function resolvePath(
  config: StatusConfig,
  stageId: string,
  path: string[],
): AnyNode[] | null {
  const stage = findStage(config, stageId);
  if (!stage || path.length === 0) return null;
  const nodes: AnyNode[] = [];
  let level: AnyNode[] = stage.options;
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

/** "case opened › login problem › no welcome mail" (with stored labels as
 * fallback when an id no longer resolves). */
export function pathLabel(config: StatusConfig, stageId: string, path: string[]): string {
  const nodes = resolvePath(config, stageId, path);
  return nodes ? nodes.map((n) => n.label).join(" › ") : path.join(" › ");
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
  for (const s of config.stages) walk(s.options);
  return ids;
}

/** Problems with an edited config (empty = fine). */
export function validateStatusConfig(next: StatusConfig, previous: StatusConfig): string[] {
  const errors: string[] = [];
  if (next.stages[0]?.id !== "fresh") errors.push("Die erste Stufe muss „fresh“ bleiben.");
  const stageIds = next.stages.map((s) => s.id);
  if (new Set(stageIds).size !== stageIds.length) errors.push("Stufen-IDs doppelt.");
  if (stageIds.some((id) => (CLOSED_STATUSES as readonly string[]).includes(id))) {
    errors.push("„done“ und „winback“ sind keine Stufen.");
  }
  for (const s of previous.stages) {
    if (!stageIds.includes(s.id))
      errors.push(`Stufe „${s.label}“ fehlt – ausblenden statt löschen.`);
  }
  const ids = allNodeIds(next);
  if (new Set(ids).size !== ids.length) errors.push("Ergebnis-IDs doppelt.");
  const kept = new Set(ids);
  for (const id of allNodeIds(previous)) {
    if (!kept.has(id)) errors.push(`Eintrag ${id} fehlt – ausblenden statt löschen.`);
  }
  const labels = (nodes: AnyNode[]): boolean =>
    nodes.every((n) => n.label.trim() !== "" && labels(n.children ?? []));
  if (!next.stages.every((s) => s.label.trim() !== "" && labels(s.options))) {
    errors.push("Jeder Eintrag braucht eine Bezeichnung.");
  }
  if (ids.length > 600) errors.push("Zu viele Einträge.");
  return errors;
}

/** Milestones ticked on a case: the stage ids. Rows from before the status
 * tree fall back to their old step timestamps. */
export function milestonesOf(row: {
  milestonesDone?: string[];
  cardsOrderedAt?: number;
  fuelledAt?: number;
  twoMonthCheckAt?: number;
}): string[] {
  if (row.milestonesDone) return row.milestonesDone;
  const out: string[] = [];
  if (row.cardsOrderedAt !== undefined) out.push("step1");
  if (row.fuelledAt !== undefined) out.push("step2");
  if (row.twoMonthCheckAt !== undefined) out.push("step3");
  return out;
}

/** What a contact-log entry records. `status`/`milestone`/`outcome`/
 * `assign`/`created`/`followUp` (moved) are written by the system when
 * someone changes the case, the rest by people. `step` is from before the
 * status tree. */
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
