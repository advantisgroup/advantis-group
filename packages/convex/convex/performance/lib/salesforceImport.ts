/**
 * Import of raw Salesforce exports (KI_Lead_Report / KI_Opp_Report), ported
 * from the reference script's `salesforce_import.py`.
 *
 * The reports contain one row per lead or opportunity. This module detects
 * the report type automatically, aggregates the KPIs per employee, and
 * also returns the relevant raw rows for the drill-down lists. Historical
 * months are backfilled from the Create/Close Date. Accepts xlsx and CSV
 * exports with English or German column labels.
 */
import { findDateInText, normHeader, parseDateCell, parseLocaleNumber } from "./callImport";
import { todayBerlin, toISODate } from "./workdays";
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

// --------------------------------------------------------------- headers
// Salesforce writes column labels in the exporting user's language, so each
// field accepts the English and the German label (matched case-, space- and
// umlaut-insensitively via `normHeader`). The customer number is optional:
// older opp exports don't have the column.

type LeadField = "owner" | "status" | "statusDetails" | "createDate" | "lastActivity";
type OppField =
  | "owner"
  | "stage"
  | "stageDetails"
  | "createdDate"
  | "closeDate"
  | "lastActivity"
  | "age"
  | "customerNumber";

const LEAD_HEADERS: Record<LeadField, string[]> = {
  owner: ["Lead Owner", "Lead-Inhaber", "Leadinhaber", "Lead Inhaber"],
  status: ["Lead Status", "Lead-Status", "Leadstatus"],
  statusDetails: ["Status Details", "Statusdetails", "Status-Details", "Lead Status Details"],
  createDate: [
    "Create Date",
    "Created Date",
    "Erstelldatum",
    "Erstellt am",
    "Erstellungsdatum",
    "Erstellt",
  ],
  lastActivity: ["Last Activity", "Letzte Aktivität", "Letzte Aktivitaet", "Last Activity Date"],
};

const OPP_HEADERS: Record<OppField, string[]> = {
  owner: [
    "Opportunity Owner",
    "Opportunity-Inhaber",
    "Opportunityinhaber",
    "Opportunity Inhaber",
    "Verkaufschance-Inhaber",
  ],
  stage: ["Stage", "Phase", "Opportunity-Phase", "Verkaufsphase"],
  stageDetails: ["Stage Details", "Phasendetails", "Phase Details", "Phase-Details"],
  createdDate: ["Created Date", "Create Date", "Erstelldatum", "Erstellt am", "Erstellungsdatum"],
  closeDate: ["Close Date", "Schlusstermin", "Abschlussdatum", "Abschlusstermin"],
  lastActivity: ["Last Activity", "Letzte Aktivität", "Letzte Aktivitaet", "Last Activity Date"],
  age: ["Age", "Alter", "Alter (Tage)"],
  customerNumber: [
    "Customer Number",
    "Customer No",
    "Kundennummer",
    "Kunden-Nr.",
    "Kundennr",
    "Account Number",
    "Accountnummer",
    "Customer ID",
  ],
};

function headerLookup<F extends string>(aliases: Record<F, string[]>): Map<string, F> {
  const map = new Map<string, F>();
  for (const [field, labels] of Object.entries(aliases) as [F, string[]][]) {
    for (const label of labels) if (!map.has(normHeader(label))) map.set(normHeader(label), field);
  }
  return map;
}
const LEAD_LOOKUP = headerLookup(LEAD_HEADERS);
const OPP_LOOKUP = headerLookup(OPP_HEADERS);

function mapColumns<F extends string>(header: SheetRow, lookup: Map<string, F>): Map<F, number> {
  const cols = new Map<F, number>();
  header.forEach((h, idx) => {
    const field = lookup.get(normHeader(h));
    if (field && !cols.has(field)) cols.set(field, idx);
  });
  return cols;
}

// ---------------------------------------------------------------- helpers

function norm(v: CellValue): string {
  return v === null || v === undefined || v === "" ? "" : String(v).trim().toLowerCase();
}

function isPerson(owner: CellValue): boolean {
  if (owner === null || owner === undefined || owner === "") return false;
  if (isExcludedOwner(owner)) return false;
  return !norm(owner).startsWith(QUEUE_PREFIX);
}

/** Parses a cell into a UTC-midnight `Date`, or null. Accepts a `Date`
 * already produced by the sheet parser (see `types.ts`'s note on
 * `CellValue`), dd.mm.yyyy, dd.mm.yy, yyyy-mm-dd and m/d/yyyy — with or
 * without a time ("01.10.2026 14:03", "2026-10-01T12:03:00Z"). */
export function toDate(v: CellValue): Date | null {
  return parseDateCell(typeof v === "number" ? null : v);
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

function customerNumber(v: CellValue): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  let s = String(v).trim();
  // Excel may deliver numbers as e.g. 477209.0
  if (s.endsWith(".0") && /^\d+$/.test(s.slice(0, -2))) s = s.slice(0, -2);
  return s || undefined;
}

// Salesforce translates the standard closed stages in a German-language
// export; the KPI rules below compare against the English values.
const GERMAN_STAGES = new Map([
  ["geschlossen und gewonnen", "closed won"],
  ["geschlossen/gewonnen", "closed won"],
  ["gewonnen", "closed won"],
  ["geschlossen und verloren", "closed lost"],
  ["geschlossen/verloren", "closed lost"],
  ["verloren", "closed lost"],
]);

function canonicalStage(v: CellValue): string {
  const s = norm(v);
  return GERMAN_STAGES.get(s) ?? s;
}

function text(v: CellValue): string {
  return v === null || v === undefined ? "" : String(v).trim();
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

export type LeadRecord = Partial<Record<LeadField, CellValue>>;
export type OppRecord = Partial<Record<OppField, CellValue>>;

export type SalesforceExport =
  | { kind: "lead"; reportDate: Date; rows: LeadRecord[] }
  | { kind: "opp"; reportDate: Date; rows: OppRecord[] };

// "As of 2026-10-01", "Stand: 01.10.2026 14:03", "Stichtag 01.10.26" — the
// line Salesforce (or whoever saved the report) writes above the table.
const AS_OF_RE = /\b(as of|stand|stichtag|zum|generiert|exportiert|erstellt am)\b/i;

function toRecords<F extends string>(
  rows: SheetRow[],
  cols: Map<F, number>,
): Partial<Record<F, CellValue>>[] {
  const out: Partial<Record<F, CellValue>>[] = [];
  for (const r of rows) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const rec: Partial<Record<F, CellValue>> = {};
    for (const [field, idx] of cols) rec[field] = r[idx];
    out.push(rec);
  }
  return out;
}

/** Finds the "As of" date and header row of a Salesforce export (xlsx rows
 * or a parsed CSV). Returns null when the sheet doesn't look like a
 * Salesforce export at all. */
export function readSalesforceExport(wsRows: SheetRow[]): SalesforceExport | null {
  let reportDate: Date | null = null;
  for (let i = 0; i < Math.min(wsRows.length, 30); i++) {
    const row = wsRows[i] ?? [];
    for (const c of row) {
      if (reportDate === null && typeof c === "string" && AS_OF_RE.test(c)) {
        reportDate = findDateInText(c);
      }
    }
    const lead = mapColumns(row, LEAD_LOOKUP);
    const opp = mapColumns(row, OPP_LOOKUP);
    const isLead = lead.has("status") && lead.has("owner");
    const isOpp = opp.has("stage") && opp.has("owner");
    if (!isLead && !isOpp) continue;
    const date = reportDate ?? todayBerlin();
    const body = wsRows.slice(i + 1);
    return isLead
      ? { kind: "lead", reportDate: date, rows: toRecords(body, lead) }
      : { kind: "opp", reportDate: date, rows: toRecords(body, opp) };
  }
  return null;
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
  rows: LeadRecord[],
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
    const ownerRaw = r.owner;
    const status = norm(r.status);
    if (status === "total" || status === "summe" || !isPerson(ownerRaw)) continue;
    const owner = String(ownerRaw).trim();
    const created = toDate(r.createDate);
    const last = toDate(r.lastActivity);
    const details = norm(r.statusDetails);

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
        status: text(r.status),
        statusDetails: text(r.statusDetails),
        createDate: created ? toISODate(created) : undefined,
        lastActivity: last ? toISODate(last) : undefined,
      });
    }

    if (status === "unqualified" && created && ym(created) === curYm) {
      const reasonKey = text(r.statusDetails) || "Ohne Angabe";
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
  rows: OppRecord[],
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
    const ownerRaw = r.owner;
    const stage = canonicalStage(r.stage);
    if (!isPerson(ownerRaw) || stage === "" || stage === "total" || stage === "summe") continue;
    const owner = String(ownerRaw).trim();
    const created = toDate(r.createdDate);
    const close = toDate(r.closeDate);
    const last = toDate(r.lastActivity);
    const details = norm(r.stageDetails);
    const ageNum = parseLocaleNumber(r.age);
    const age = ageNum !== null ? Math.trunc(ageNum) : daysSince(created, reportDate);

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
        stage: text(r.stage),
        stageDetails: text(r.stageDetails),
        createdDate: created ? toISODate(created) : undefined,
        closeDate: close ? toISODate(close) : undefined,
        age: age ?? undefined,
        lastActivity: last ? toISODate(last) : undefined,
        customerNumber: customerNumber(r.customerNumber),
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
