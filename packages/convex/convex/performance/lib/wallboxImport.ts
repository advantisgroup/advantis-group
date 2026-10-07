/**
 * The two Wallbox campaign reports from Salesforce (dashboard kind
 * `wallbox`), as agreed with Jörg Endres in 10/2026:
 *
 * - `KI_DashboardData_Wallbox_Leads`: one row per campaign member with its
 *   Member Status. Only "In Progress - <Vorname>" names an employee; every
 *   other status ("not interested", "To be contacted", …) is campaign-wide.
 *   A "- min. 1 EV" suffix marks members with at least one e-vehicle.
 * - `KI_DashboardData_Wallbox_Opps`: one row per opportunity with its
 *   Opportunity Owner (field sales), Acquired By (our employee) and the
 *   Closed/Won flags. Lost = closed and not won.
 *
 * Pure parsing and counting only, no Convex imports.
 */
import { findDateInText, normHeader } from "./callImport";
import { todayBerlin } from "./workdays";
import { type CellValue, type SheetRow } from "./types";

type MemberField = "status" | "customerNumber" | "account";
type OppField = "owner" | "acquiredBy" | "account" | "closed" | "won";

const MEMBER_HEADERS: Record<MemberField, string[]> = {
  status: ["Member Status", "Mitgliedsstatus", "Mitglieder-Status", "Status des Mitglieds"],
  customerNumber: ["Customer Number", "Kundennummer", "Kunden-Nr."],
  account: ["Account Name", "Accountname", "Account-Name", "Firma", "Unternehmen"],
};

const OPP_HEADERS: Record<OppField, string[]> = {
  owner: ["Opportunity Owner", "Opportunity-Inhaber", "Opportunityinhaber", "Opportunity Inhaber"],
  acquiredBy: ["Acquired By", "Akquiriert von", "Akquiriert durch", "Erworben von"],
  account: ["Account Name", "Accountname", "Account-Name"],
  closed: ["Closed", "Geschlossen", "Abgeschlossen"],
  won: ["Won", "Gewonnen"],
};

function lookup<F extends string>(aliases: Record<F, string[]>): Map<string, F> {
  const map = new Map<string, F>();
  for (const [field, labels] of Object.entries(aliases) as [F, string[]][]) {
    for (const label of labels) map.set(normHeader(label), field);
  }
  return map;
}
const MEMBER_LOOKUP = lookup(MEMBER_HEADERS);
const OPP_LOOKUP = lookup(OPP_HEADERS);

function mapColumns<F extends string>(row: SheetRow, map: Map<string, F>): Map<F, number> {
  const cols = new Map<F, number>();
  row.forEach((h, idx) => {
    const field = map.get(normHeader(h));
    if (field && !cols.has(field)) cols.set(field, idx);
  });
  return cols;
}

function text(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, " ").trim();
}

/** Salesforce checkbox cells: real booleans in xlsx, "true"/"1"/"Ja" in CSV. */
export function truthy(v: CellValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return ["true", "wahr", "ja", "yes", "1", "x"].includes(text(v).toLowerCase());
}

/** The "Total" / "Count" footer Salesforce appends below the table. */
function isFooter(r: SheetRow): boolean {
  return r.some((c) => {
    const t = text(c).toLowerCase();
    return ["total", "gesamt", "summe", "sum", "count", "anzahl", "summe gesamt"].includes(t);
  });
}

function isBlank(r: SheetRow | undefined): boolean {
  return !r || r.every((c) => c === null || c === undefined || c === "");
}

/** The data rows below the header: up to the first blank row (Salesforce
 * puts its footer — totals, "Confidential Information …", "Generated
 * By …" — below one), without a footer row that follows directly. */
function tableBody(rows: SheetRow[]): SheetRow[] {
  const out: SheetRow[] = [];
  for (const r of rows) {
    if (isBlank(r)) {
      if (out.length > 0) break;
      continue;
    }
    if (isFooter(r)) break;
    out.push(r);
  }
  return out;
}

const STAGE_HEADERS = new Set(
  ["Stage", "Phase", "Opportunity-Phase", "Verkaufsphase"].map((h) => normHeader(h)),
);

export interface MemberRow {
  status: string;
  customerNumber?: string;
  account?: string;
}

export interface WallboxOppRow {
  owner: string;
  acquiredBy: string;
  account: string;
  closed: boolean;
  won: boolean;
}

export type WallboxExport =
  | { kind: "members"; reportDate: Date; campaign?: string; rows: MemberRow[] }
  | { kind: "opps"; reportDate: Date; campaign?: string; rows: WallboxOppRow[] };

// "Campaign Name equals DEU_2026_EV W&H new entries boost" /
// "Primary Campaign Source equals …" in the report's filter block.
const CAMPAIGN_RE =
  /(?:campaign name|primary campaign source|kampagnenname|kampagne)\s+(?:equals|ist gleich|gleich|=)\s+(.+)$/i;
const AS_OF_RE = /\b(as of|stand|stichtag|generiert|exportiert)\b/i;

/** Recognises either Wallbox report (xlsx rows or parsed CSV) and returns
 * its rows, or null when the sheet is something else. Checked before the
 * general Salesforce detection: the opp report has an owner column too. */
export function readWallboxExport(rows: SheetRow[]): WallboxExport | null {
  let reportDate: Date | null = null;
  let campaign: string | undefined;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] ?? [];
    for (const c of row) {
      if (typeof c !== "string") continue;
      if (reportDate === null && AS_OF_RE.test(c)) reportDate = findDateInText(c);
      const m = CAMPAIGN_RE.exec(c.trim());
      if (m && !campaign) campaign = m[1].trim();
    }
    const members = mapColumns(row, MEMBER_LOOKUP);
    const opps = mapColumns(row, OPP_LOOKUP);
    const isMembers = members.has("status");
    // A sales opportunity export has a Stage column; the Wallbox one doesn't.
    const hasStage = row.some((h) => STAGE_HEADERS.has(normHeader(h)));
    const isOpps =
      opps.has("acquiredBy") &&
      opps.has("won") &&
      opps.has("closed") &&
      opps.has("owner") &&
      !hasStage;
    if (!isMembers && !isOpps) continue;

    const date = reportDate ?? todayBerlin();
    const body = tableBody(rows.slice(i + 1));
    if (isOpps) {
      const col = (r: SheetRow, f: OppField) => {
        const idx = opps.get(f);
        return idx === undefined ? null : r[idx];
      };
      return {
        kind: "opps",
        reportDate: date,
        campaign,
        rows: body
          .map((r) => ({
            owner: text(col(r, "owner")),
            acquiredBy: text(col(r, "acquiredBy")),
            account: text(col(r, "account")),
            closed: truthy(col(r, "closed")) || truthy(col(r, "won")),
            won: truthy(col(r, "won")),
          }))
          // Every opportunity has an account; anything else is report text.
          .filter((r) => r.account),
      };
    }
    const col = (r: SheetRow, f: MemberField) => {
      const idx = members.get(f);
      return idx === undefined ? null : r[idx];
    };
    return {
      kind: "members",
      reportDate: date,
      campaign,
      rows: body
        .map((r) => ({
          status: text(col(r, "status")),
          customerNumber: text(col(r, "customerNumber")) || undefined,
          account: text(col(r, "account")) || undefined,
        }))
        .filter((r) => r.status),
    };
  }
  return null;
}

// ------------------------------------------------------------ member status

export interface ParsedStatus {
  /** Base status without employee and EV suffix, e.g. "In Progress". */
  status: string;
  /** First name from "In Progress - <Vorname>", if any. */
  employee?: string;
  /** "- min. 1 EV" suffix. */
  ev: boolean;
}

const EV_RE = /\s*-?\s*min\.?\s*1\s*ev\s*$/i;
const IN_PROGRESS_RE = /^in\s*prog\w*\s*-?\s*(.*)$/i;

/** Canonical labels for the base statuses (Salesforce has typos and short
 * forms: "In Progess", "Opp created", "contact later"). */
function canonicalStatus(base: string): string {
  const s = base.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^interested\b.*\bopp/.test(s)) return "Interested - Opportunity created";
  if (/^interested\b.*\b(contact|contacted)\b.*\blater/.test(s))
    return "Interested - to be contacted later";
  if (/^to be contacted/.test(s)) return "To be contacted";
  if (/^not interested/.test(s)) return "Not interested";
  return base.trim();
}

export function parseMemberStatus(raw: string): ParsedStatus {
  const ev = EV_RE.test(raw);
  const withoutEv = raw.replace(EV_RE, "").trim();
  const progress = IN_PROGRESS_RE.exec(withoutEv);
  if (progress) {
    const name = progress[1].replace(/^[-\s]+/, "").trim();
    return { status: "In Progress", employee: name || undefined, ev };
  }
  return { status: canonicalStatus(withoutEv), ev };
}

export interface MemberSummary {
  total: number;
  statuses: { status: string; count: number; ev: number }[];
  /** Per first name from "In Progress - <Vorname>". */
  people: { name: string; inProgress: number; inProgressEv: number }[];
}

const STATUS_ORDER = [
  "In Progress",
  "Interested - Opportunity created",
  "Interested - to be contacted later",
  "To be contacted",
  "Not interested",
];

export function summarizeMembers(rows: MemberRow[]): MemberSummary {
  const statuses = new Map<string, { count: number; ev: number }>();
  const people = new Map<string, { name: string; inProgress: number; inProgressEv: number }>();
  for (const r of rows) {
    const p = parseMemberStatus(r.status);
    const s = statuses.get(p.status) ?? { count: 0, ev: 0 };
    s.count++;
    if (p.ev) s.ev++;
    statuses.set(p.status, s);
    if (p.employee) {
      const key = p.employee.toLowerCase();
      const person = people.get(key) ?? { name: p.employee, inProgress: 0, inProgressEv: 0 };
      person.inProgress++;
      if (p.ev) person.inProgressEv++;
      people.set(key, person);
    }
  }
  const rank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return {
    total: rows.length,
    statuses: [...statuses.entries()]
      .map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => rank(a.status) - rank(b.status) || b.count - a.count),
    people: [...people.values()].sort((a, b) => b.inProgress - a.inProgress),
  };
}

// --------------------------------------------------------------- opps

export interface OppCounts {
  name: string;
  opps: number;
  open: number;
  won: number;
  lost: number;
}

function countBy(rows: WallboxOppRow[], key: (r: WallboxOppRow) => string): OppCounts[] {
  const map = new Map<string, OppCounts>();
  for (const r of rows) {
    const name = key(r) || "(ohne Angabe)";
    const c = map.get(name.toLowerCase()) ?? { name, opps: 0, open: 0, won: 0, lost: 0 };
    c.opps++;
    if (!r.closed) c.open++;
    else if (r.won) c.won++;
    else c.lost++;
    map.set(name.toLowerCase(), c);
  }
  return [...map.values()].sort((a, b) => b.opps - a.opps || a.name.localeCompare(b.name, "de"));
}

export function summarizeOpps(rows: WallboxOppRow[]): {
  total: number;
  byAcquirer: OppCounts[];
  byOwner: OppCounts[];
} {
  return {
    total: rows.length,
    byAcquirer: countBy(rows, (r) => r.acquiredBy),
    byOwner: countBy(rows, (r) => r.owner),
  };
}

/** Maps a first name from a member status ("Nadine") to a full name from
 * `fullNames` when exactly one of them starts with it. */
export function matchFirstName(first: string, fullNames: readonly string[]): string | null {
  const key = first.trim().toLowerCase();
  if (!key) return null;
  const hits = fullNames.filter((n) => n.trim().toLowerCase().split(/\s+/)[0] === key);
  const unique = [...new Set(hits.map((h) => h.toLowerCase()))];
  return unique.length === 1 ? hits[0] : null;
}
