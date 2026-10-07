/**
 * Import of raw Salesforce exports (KI_Lead_Report / KI_Opp_Report), ported
 * from the reference script's `salesforce_import.py`.
 *
 * The reports contain one row per lead or opportunity. This module detects
 * the report type automatically, aggregates the KPIs per employee, and
 * also returns the relevant raw rows for the drill-down lists. Historical
 * months are backfilled from the Create/Close Date.
 */
import { todayUTC, toISODate } from "./workdays";
import {
  mostCommonText,
  SnapshotMap,
  type CellValue,
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
} from "./types";

// ------------------------------------------------------------ CONFIGURATION
// Adjust these to match your own process definitions if needed.

/** "Workable": leads that turned out to be valid/actionable (everything
 * except Unqualified and untouched Open leads). */
export const WORKABLE_STATUS = new Set(["analysis", "converted", "not interested"]);

/** Leads actively being worked (basis for the inactivity check). */
export const ACTIVE_LEAD_STATUS = new Set(["open", "analysis"]);

/** Open opportunity = stage not closed. */
export const CLOSED_STAGES = new Set(["closed won", "closed lost"]);

/** Stage details counted as "Pending Credit / Pending Documents". */
export const PENDING_DETAILS = ["pending credit", "pending documents"];

export const ANALYSIS_AGE_DAYS = 30; // Analysis >30: lead in Analysis, older than 30 days
export const OPP_AGE_DAYS = 30; // Opportunity >30: open opp, older than 30 days
export const NO_ACTION_DAYS = 14; // Last Activity >2 weeks

/** Owners that aren't employees (queues) are skipped. */
const QUEUE_PREFIX = "sales -";

/** These owners are never imported or shown (case-insensitive match on the
 * full name; partial names don't count). */
export const EXCLUDED_OWNERS = new Set(["leon eisner", "nicole schwan"]);

export function isExcludedOwner(owner: CellValue): boolean {
  return EXCLUDED_OWNERS.has(norm(owner));
}

// The customer number is optional: older opp exports don't have the column.
const CUSTOMER_NO_HEADERS = [
  "Customer Number",
  "Customer No",
  "Kundennummer",
  "Account Number",
  "Customer ID",
];

// ---------------------------------------------------------------- helpers

function norm(v: CellValue): string {
  return v === null || v === undefined || v === "" ? "" : String(v).trim().toLowerCase();
}

function isPerson(owner: CellValue): boolean {
  if (owner === null || owner === undefined || owner === "") return false;
  if (isExcludedOwner(owner)) return false;
  return !norm(owner).startsWith(QUEUE_PREFIX);
}

type DateParser = (s: string) => Date | null;

const DATE_FORMATS: DateParser[] = [
  (s) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s); // dd.mm.yyyy
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // yyyy-mm-dd
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  },
  (s) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s); // dd.mm.yy
    return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // m/d/yyyy
    return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
  },
];

/** Parses a cell into a UTC-midnight `Date`, or null. Accepts a `Date`
 * already produced by the sheet parser (see `types.ts`'s note on
 * `CellValue`) or one of the four date-string formats the reference
 * script accepts. */
export function toDate(v: CellValue): Date | null {
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  for (const parse of DATE_FORMATS) {
    const d = parse(s);
    if (d) return d;
  }
  return null;
}

function ym(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(ymStr: string): Date {
  const [y, m] = ymStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function daysSince(d: Date | null, ref: Date): number | null {
  return d ? daysBetween(d, ref) : null;
}

/** Inactive when the last activity (or, failing that, the create date) is
 * more than `NO_ACTION_DAYS` in the past. */
function inactive(last: Date | null, created: Date | null, ref: Date): boolean {
  const basis = last ?? created;
  return basis !== null && daysBetween(basis, ref) > NO_ACTION_DAYS;
}

function customerNumber(row: Record<string, CellValue>): string | undefined {
  for (const header of CUSTOMER_NO_HEADERS) {
    const v = row[header];
    if (v !== null && v !== undefined && v !== "") {
      let s = String(v).trim();
      // Excel may deliver numbers as e.g. 477209.0
      if (s.endsWith(".0") && /^\d+$/.test(s.slice(0, -2))) s = s.slice(0, -2);
      return s;
    }
  }
  return undefined;
}

function bump<K extends keyof MetricFields>(
  map: Map<string, Partial<MetricFields>>,
  key: string,
  field: K,
): void {
  const cur = map.get(key) ?? {};
  cur[field] = (cur[field] ?? 0) + 1;
  map.set(key, cur);
}

// ------------------------------------------------------------- detection

export interface SalesforceExport {
  kind: "lead" | "opp";
  reportDate: Date;
  rows: Record<string, CellValue>[];
}

const AS_OF_RE = /As of (\d{4}-\d{2}-\d{2})/;

/** Finds the "As of" date and header row of a Salesforce export. Returns
 * null when the sheet doesn't look like a Salesforce export at all. */
export function readSalesforceExport(wsRows: SheetRow[]): SalesforceExport | null {
  let reportDate: Date | null = null;
  let headerIdx: number | null = null;
  let header: SheetRow | null = null;

  for (let i = 0; i < Math.min(wsRows.length, 30); i++) {
    const row = wsRows[i];
    const cells = row.filter((c) => c !== null && c !== undefined && c !== "");
    for (const c of cells) {
      const m = AS_OF_RE.exec(String(c));
      if (m) reportDate = toDate(m[1]);
    }
    const vals = new Set(cells.map(norm));
    if (vals.has("lead status") || (vals.has("stage") && vals.has("opportunity owner"))) {
      headerIdx = i;
      header = row;
      break;
    }
  }
  if (headerIdx === null || header === null) return null;
  if (reportDate === null) reportDate = todayUTC();

  const rows: Record<string, CellValue>[] = [];
  for (const r of wsRows.slice(headerIdx + 1)) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const rec: Record<string, CellValue> = {};
    for (let j = 0; j < header.length; j++) {
      const h = header[j];
      if (h !== null && h !== undefined && h !== "") {
        rec[String(h).trim()] = r[j];
      }
    }
    rows.push(rec);
  }
  const kind: "lead" | "opp" = header.some(
    (h) => h !== null && h !== undefined && h !== "" && norm(h) === "lead status",
  )
    ? "lead"
    : "opp";
  return { kind, reportDate, rows };
}

// ----------------------------------------------------- aggregation: leads

// createDate/lastActivity etc. are `string | undefined`, not `| null` —
// this repo's Convex tables use optional (possibly-absent) fields, not
// nullable ones (see schema.ts), so "no value" must round-trip as an
// omitted key, never an explicit `null`.
export interface RawLead {
  reportDate: string;
  owner: string;
  status: string;
  statusDetails: string;
  createDate: string | undefined;
  lastActivity: string | undefined;
}

const LEAD_STATE_FIELDS: (keyof MetricFields)[] = [
  "leadsAnalysis",
  "overduesAnalysis",
  "leadsDetailsIdent",
  "leadsNoAction14",
];

export function aggregateLeadReport(
  rows: Record<string, CellValue>[],
  reportDate: Date,
): { snapshots: EmployeeSnapshot[]; raw: RawLead[] } {
  const curYm = ym(reportDate);
  const reportDateIso = toISODate(reportDate);
  const monthly = new Map<string, Partial<MetricFields>>(); // key: `${owner}\n${ym}`
  const state = new Map<string, Partial<MetricFields>>(); // key: owner
  const reasons = new Map<string, Map<string, number>>(); // owner -> reason -> count
  const raw: RawLead[] = [];
  const monthlyOwnerYm = new Map<string, { owner: string; ym: string }>();

  for (const r of rows) {
    const ownerRaw = r["Lead Owner"];
    const status = norm(r["Lead Status"]);
    if (status === "total" || !isPerson(ownerRaw)) continue;
    const owner = String(ownerRaw).trim();
    const created = toDate(r["Create Date"]);
    const last = toDate(r["Last Activity"]);
    const details = norm(r["Status Details"]);

    if (created) {
      const createdYm = ym(created);
      const key = `${owner}\n${createdYm}`;
      monthlyOwnerYm.set(key, { owner, ym: createdYm });
      bump(monthly, key, "leadsCreated");
      if (WORKABLE_STATUS.has(status)) bump(monthly, key, "workableCreated");
    }

    if (status === "analysis") {
      bump(state, owner, "leadsAnalysis");
      if (created && daysBetween(created, reportDate) > ANALYSIS_AGE_DAYS) {
        bump(state, owner, "overduesAnalysis");
      }
    }
    if (details === "identification running") bump(state, owner, "leadsDetailsIdent");
    if (ACTIVE_LEAD_STATUS.has(status)) {
      if (inactive(last, created, reportDate)) bump(state, owner, "leadsNoAction14");
      raw.push({
        reportDate: reportDateIso,
        owner,
        status: String(r["Lead Status"] ?? "").trim(),
        statusDetails: String(r["Status Details"] ?? "").trim(),
        createDate: created ? toISODate(created) : undefined,
        lastActivity: last ? toISODate(last) : undefined,
      });
    }

    if (status === "unqualified" && created && ym(created) === curYm) {
      const reasonKey = (r["Status Details"] as string | undefined) || "Ohne Angabe";
      const ownerReasons = reasons.get(owner) ?? new Map<string, number>();
      ownerReasons.set(reasonKey, (ownerReasons.get(reasonKey) ?? 0) + 1);
      reasons.set(owner, ownerReasons);
    }
  }

  // Also write explicit 0s for the state fields, so month-over-month
  // deltas stay correct for an owner with monthly creation data but no
  // current "state" (e.g. zero open Analysis leads today).
  const allStateOwners = new Set<string>([
    ...[...monthlyOwnerYm.values()].map((v) => v.owner),
    ...state.keys(),
  ]);

  const snapshots = new SnapshotMap();
  for (const [key, vals] of monthly) {
    const { owner, ym: ownerYm } = monthlyOwnerYm.get(key)!;
    const snapDateIso = ownerYm === curYm ? reportDateIso : toISODate(monthEnd(ownerYm));
    snapshots.merge(owner, snapDateIso, vals);
  }
  for (const owner of allStateOwners) {
    const s = state.get(owner) ?? {};
    const defaults: Partial<MetricFields> = {};
    for (const f of LEAD_STATE_FIELDS) defaults[f] = s[f] ?? 0;
    snapshots.merge(owner, reportDateIso, defaults);
  }
  for (const [owner, counts] of reasons) {
    snapshots.merge(owner, reportDateIso, {
      unqualifiedReasons: mostCommonText(counts),
    });
  }

  return { snapshots: snapshots.toArray(), raw };
}

// -------------------------------------------------- aggregation: opportunities

export interface RawOpp {
  reportDate: string;
  owner: string;
  stage: string;
  stageDetails: string;
  createdDate: string | undefined;
  closeDate: string | undefined;
  age: number | undefined;
  lastActivity: string | undefined;
  customerNumber: string | undefined;
}

const OPP_STATE_FIELDS: (keyof MetricFields)[] = [
  "oppsOpen",
  "oppsClose7d",
  "overduesOpps",
  "oppsOver30",
  "oppsNoAction14",
  "oppsPending",
];

export interface WonOpp {
  owner: string;
  closeDate: string;
}

export function aggregateOppReport(
  rows: Record<string, CellValue>[],
  reportDate: Date,
): { snapshots: EmployeeSnapshot[]; raw: RawOpp[]; wonOpps: WonOpp[] } {
  const curYm = ym(reportDate);
  const reportDateIso = toISODate(reportDate);
  const monthly = new Map<string, Partial<MetricFields>>(); // key: `${owner}\n${ym}`
  const state = new Map<string, Partial<MetricFields>>(); // key: owner
  const raw: RawOpp[] = [];
  const wonOpps: WonOpp[] = [];
  const monthlyOwnerYm = new Map<string, { owner: string; ym: string }>();

  for (const r of rows) {
    const ownerRaw = r["Opportunity Owner"];
    const stage = norm(r["Stage"]);
    if (!isPerson(ownerRaw) || stage === "" || stage === "total") continue;
    const owner = String(ownerRaw).trim();
    const created = toDate(r["Created Date"]);
    const close = toDate(r["Close Date"]);
    const last = toDate(r["Last Activity"]);
    const details = norm(r["Stage Details"]);
    const ageRaw = r["Age"];
    const ageNum = ageRaw !== null && ageRaw !== undefined && ageRaw !== "" ? Number(ageRaw) : NaN;
    const age = Number.isFinite(ageNum) ? Math.trunc(ageNum) : daysSince(created, reportDate);

    if (stage === "closed won" && close) {
      const closeYm = ym(close);
      const key = `${owner}\n${closeYm}`;
      monthlyOwnerYm.set(key, { owner, ym: closeYm });
      bump(monthly, key, "wonMonth");
      wonOpps.push({ owner, closeDate: toISODate(close) });
    }

    if (!CLOSED_STAGES.has(stage)) {
      bump(state, owner, "oppsOpen");
      if (
        close &&
        close.getTime() >= reportDate.getTime() &&
        close.getTime() <= reportDate.getTime() + 7 * 86_400_000
      ) {
        bump(state, owner, "oppsClose7d");
      }
      if (close && close.getTime() < reportDate.getTime()) {
        bump(state, owner, "overduesOpps");
      }
      if (age !== null && age > OPP_AGE_DAYS) bump(state, owner, "oppsOver30");
      if (inactive(last, created, reportDate)) bump(state, owner, "oppsNoAction14");
      if (PENDING_DETAILS.some((p) => details.includes(p))) bump(state, owner, "oppsPending");
      raw.push({
        reportDate: reportDateIso,
        owner,
        stage: String(r["Stage"] ?? "").trim(),
        stageDetails: String(r["Stage Details"] ?? "").trim(),
        createdDate: created ? toISODate(created) : undefined,
        closeDate: close ? toISODate(close) : undefined,
        age: age ?? undefined,
        lastActivity: last ? toISODate(last) : undefined,
        customerNumber: customerNumber(r),
      });
    }
  }

  const allStateOwners = new Set<string>([
    ...[...monthlyOwnerYm.values()].map((v) => v.owner),
    ...state.keys(),
  ]);

  const snapshots = new SnapshotMap();
  for (const [key, vals] of monthly) {
    const { owner, ym: ownerYm } = monthlyOwnerYm.get(key)!;
    const snapDateIso = ownerYm === curYm ? reportDateIso : toISODate(monthEnd(ownerYm));
    snapshots.merge(owner, snapDateIso, vals);
  }
  for (const owner of allStateOwners) {
    const s = state.get(owner) ?? {};
    const defaults: Partial<MetricFields> = {};
    for (const f of OPP_STATE_FIELDS) defaults[f] = s[f] ?? 0;
    snapshots.merge(owner, reportDateIso, defaults);
  }

  return { snapshots: snapshots.toArray(), raw, wonOpps };
}
