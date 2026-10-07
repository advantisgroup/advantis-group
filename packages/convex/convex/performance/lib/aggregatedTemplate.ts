/**
 * The aggregated upload template (`/performance/template`): one row per
 * employee with the metrics already computed by whoever filled it in. Last
 * in the detection chain — a file that isn't a Salesforce export, call
 * report or interactions export is only accepted when it has this
 * template's employee column plus at least one metric column.
 */
import { parseLocaleNumber } from "./callImport";
import {
  METRIC_KEYS,
  type CellValue,
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./types";
import { toISODate, todayBerlin } from "./workdays";

type TemplateField = keyof MetricFields | "employee" | "date" | "unqualifiedReasons";

// Lives here (not in import.ts) because `uploadParse.ts` runs in the Node
// runtime and never imports import.ts — a lookup filled as a side effect
// over there stayed empty for every actual import.
const HEADER_ALIASES: Record<TemplateField, string[]> = {
  employee: ["mitarbeiter", "employee", "name", "salesrep", "vertriebler", "mitarbeiterin"],
  date: ["datum", "date", "reportdatum", "reportdate", "stichtag"],
  leadsCreated: [
    "leadserstelltmonat",
    "leadscreatedthismonth",
    "leadscreated",
    "leadserstellt",
    "leadsmonat",
  ],
  workableCreated: [
    "workableerstelltmonat",
    "workablecreatedthismonth",
    "workablecreated",
    "workableerstellt",
    "workablemonat",
  ],
  leadsAnalysis: ["leadsstatusanalysis", "leadsanalysis", "statusanalysis"],
  leadsDetailsIdent: [
    "leadsdetailsidentificationrunning",
    "detailsidentificationrunning",
    "leadsstatusdetailsidentificationrunning",
    "detailsidentification",
  ],
  oppsOpen: [
    "opportunitiesoffengesamt",
    "opportunitiesgesamtoffen",
    "oppsopen",
    "opportunitiesopen",
    "opportunitiesoffen",
  ],
  oppsClose7d: [
    "opportunitiesclosedate7tage",
    "oppsclosedate7tage",
    "closedate7days",
    "opportunitiesclosedatein7tagen",
    "oppsclose7d",
    "opportunitiesclosedateindenkommenden7tagen",
  ],
  oppsPending: [
    "oppspendingcreditdocuments",
    "opportunitiespendingcreditdocuments",
    "pendingcreditdocuments",
    "oppspending",
    "opportunitiespending",
    "stagedetailspendingcreditoderpendingdocuments",
  ],
  wonMonth: ["wonmonat", "wonthismonth", "won", "gewonnenmonat"],
  callsToday: ["callsheute", "callstoday", "anzahlcallstoday", "anzahlcallsheute", "calls"],
  overduesAnalysis: ["overduesanalysis", "overdueanalysis", "analysis30", "analysis30tage"],
  overduesOpps: ["overduesopportunities", "overdueopportunities", "overduesopps"],
  oppsOver30: ["opportunities30tage", "opps30tage", "opportunity30", "opps30"],
  leadsNoAction14: ["leadslastactivity2wochen", "leadslastaction2wochen", "leadsinaktiv2wochen"],
  oppsNoAction14: [
    "oppslastactivity2wochen",
    "opportunitieslastactivity2wochen",
    "oppsinaktiv2wochen",
  ],
  unqualifiedReasons: [
    "unqualifiedreasons",
    "unqualifiedreason",
    "unqualifiziertgruende",
    "unqualifiedgruende",
    "gruendeunqualified",
  ],
  callsAnswered: ["callsangenommen", "callsanswered"],
  callsOutbound: ["callsoutbound"],
  talkTotalSec: ["gespraechszeitgesamtsek", "talktotalsec"],
  talkAvgSec: ["gespraechszeitschnittsek", "talkavgsec"],
  loginSec: ["loginzeitsek", "loginsec"],
};

export const TEMPLATE_ALIAS_LOOKUP: ReadonlyMap<string, TemplateField> = new Map(
  Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field as TemplateField] as const),
  ),
);

export function normHeaderSimple(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

export const TEMPLATE_DATE_FORMATS: ((s: string) => Date | null)[] = [
  (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  },
  (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
  },
];

/** Always returns an ISO date — defaults to today (Berlin) when the cell is
 * absent or unparseable, matching the reference script's `_to_date`. */
export function toDateOrToday(v: CellValue): string {
  if (v instanceof Date) return toISODate(v);
  if (v !== null && v !== undefined && v !== "") {
    const s = String(v).trim().split(/[\sT]/)[0];
    for (const parse of TEMPLATE_DATE_FORMATS) {
      const d = parse(s);
      if (d) return toISODate(d);
    }
  }
  return toISODate(todayBerlin());
}

const HEADER_SEARCH_ROWS = 10;

export interface AggregatedTemplate {
  snapshots: EmployeeSnapshot[];
  /** Newest date any row is filed under. */
  reportDate: string;
}

/** Parses the aggregated template, or returns null when the sheet doesn't
 * look like one (no employee column, or no metric column next to it). Only
 * metrics whose column exists in the file *and* whose cell is filled are
 * written — everything else stays "not measured" instead of becoming 0 and
 * overwriting what a Salesforce or call import already stored. */
export function parseAggregatedTemplate(wsRows: SheetRow[]): AggregatedTemplate | null {
  let headerIdx = -1;
  let colmap: Partial<Record<TemplateField, number>> = {};
  for (let i = 0; i < Math.min(wsRows.length, HEADER_SEARCH_ROWS); i++) {
    const found: Partial<Record<TemplateField, number>> = {};
    (wsRows[i] ?? []).forEach((h, idx) => {
      const field = TEMPLATE_ALIAS_LOOKUP.get(normHeaderSimple(h));
      if (field && found[field] === undefined) found[field] = idx;
    });
    const hasMetric =
      METRIC_KEYS.some((k) => found[k] !== undefined) || found.unqualifiedReasons !== undefined;
    if (found.employee !== undefined && hasMetric) {
      headerIdx = i;
      colmap = found;
      break;
    }
  }
  if (headerIdx === -1 || colmap.employee === undefined) return null;
  const employeeCol = colmap.employee;

  const snapshots: EmployeeSnapshot[] = [];
  for (const r of wsRows.slice(headerIdx + 1)) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const nameRaw = r[employeeCol];
    if (nameRaw === null || nameRaw === undefined || nameRaw === "") continue;
    const employeeName = String(nameRaw).trim();
    if (!employeeName) continue;
    const reportDate = toDateOrToday(colmap.date !== undefined ? r[colmap.date] : null);

    const fields: SnapshotFields = {};
    for (const key of METRIC_KEYS) {
      const idx = colmap[key];
      if (idx === undefined) continue;
      const value = parseLocaleNumber(r[idx]);
      if (value !== null) fields[key] = Math.round(value);
    }
    const reasonsIdx = colmap.unqualifiedReasons;
    if (reasonsIdx !== undefined) {
      const v = r[reasonsIdx];
      if (v !== null && v !== undefined && v !== "") fields.unqualifiedReasons = String(v).trim();
    }
    if (Object.keys(fields).length === 0) continue;
    snapshots.push({ employeeName, reportDate, fields });
  }
  const reportDate = snapshots.reduce(
    (max, s) => (s.reportDate > max ? s.reportDate : max),
    snapshots[0]?.reportDate ?? toISODate(todayBerlin()),
  );
  return { snapshots, reportDate };
}
