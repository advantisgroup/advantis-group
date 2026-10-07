import { ConvexError } from "convex/values";
import {
  METRIC_KEYS,
  type CellValue,
  type EmployeeSnapshot,
  type MetricFields,
  type SheetRow,
  type SnapshotFields,
} from "./types";
import { toISODate } from "./workdays";

export const TEMPLATE_ALIAS_LOOKUP = new Map<string, string>();

export function normHeaderSimple(v: CellValue): string {
  return v === null || v === undefined
    ? ""
    : String(v)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

export function toIntLoose(v: CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  const f = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(f) ? Math.round(f) : 0;
}

export const TEMPLATE_DATE_FORMATS: ((s: string) => Date | null)[] = [
  (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  },
  (s) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s);
    return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null;
  },
  (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
  },
];

/** Always returns an ISO date — defaults to today when the cell is absent
 * or unparseable, matching the reference script's `_to_date`. */
export function toDateOrToday(v: CellValue): string {
  if (v instanceof Date) return toISODate(v);
  if (v !== null && v !== undefined && v !== "") {
    const s = String(v).trim();
    for (const parse of TEMPLATE_DATE_FORMATS) {
      const d = parse(s);
      if (d) return toISODate(d);
    }
  }
  return toISODate(new Date());
}

/** Reads the first table of an aggregated-template report: one row per
 * employee, already-computed metrics. Throws when the file doesn't look
 * like a usable template at all. */
export function parseAggregatedTemplate(wsRows: SheetRow[]): EmployeeSnapshot[] {
  if (wsRows.length === 0) {
    throw new ConvexError({
      code: "validation",
      message: "Die Datei enthält keine Daten.",
    });
  }
  const header = wsRows[0];
  const colmap: Partial<
    Record<keyof MetricFields | "employee" | "date" | "unqualifiedReasons", number>
  > = {};
  header.forEach((h, idx) => {
    const field = TEMPLATE_ALIAS_LOOKUP.get(normHeaderSimple(h));
    if (field) colmap[field as keyof typeof colmap] = idx;
  });
  if (colmap.employee === undefined) {
    throw new ConvexError({
      code: "validation",
      message: "Spalte 'Mitarbeiter' wurde nicht gefunden. Bitte die Vorlage verwenden.",
    });
  }

  const out: EmployeeSnapshot[] = [];
  for (const r of wsRows.slice(1)) {
    if (!r || r.every((v) => v === null || v === undefined || v === "")) continue;
    const nameRaw = r[colmap.employee];
    if (nameRaw === null || nameRaw === undefined || nameRaw === "") continue;
    const employeeName = String(nameRaw).trim();
    const reportDate = toDateOrToday(colmap.date !== undefined ? r[colmap.date] : null);

    const fields: SnapshotFields = {};
    for (const key of METRIC_KEYS) {
      const idx = colmap[key];
      fields[key] = idx !== undefined ? toIntLoose(r[idx]) : 0;
    }
    const reasonsIdx = colmap.unqualifiedReasons;
    if (reasonsIdx !== undefined) {
      const v = r[reasonsIdx];
      fields.unqualifiedReasons = v !== null && v !== undefined && v !== "" ? String(v).trim() : "";
    } else {
      fields.unqualifiedReasons = "";
    }
    out.push({ employeeName, reportDate, fields });
  }
  if (out.length === 0) {
    throw new ConvexError({
      code: "validation",
      message: "Keine Datenzeilen gefunden.",
    });
  }
  return out;
}
