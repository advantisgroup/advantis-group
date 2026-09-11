/**
 * Shared vocabulary + pure logic for Fehlermanagement (QVM error/quality
 * tracking) — kept separate from the Convex functions so escalation stays
 * derived (never stored) and every list/detail/dashboard view computes it
 * identically. German literal values are used throughout (matching the
 * ported prototype and the audience it's for); only the i18n label keys are
 * translated.
 */

export type Severity = "niedrig" | "mittel" | "hoch" | "kritisch";
export type ReportStatus = "neu" | "in_bearbeitung" | "geschlossen";
export type MeasurePhase =
  | "d3_sofort"
  | "d4_ursache"
  | "d5_d6_abstellung"
  | "d7_wirksamkeit"
  | "d8_vorbeugung";
export type MeasureStatus = "offen" | "erledigt";
export type CustomerFeedback = "positiv" | "neutral" | "negativ";

export const SEVERITIES: Severity[] = ["niedrig", "mittel", "hoch", "kritisch"];
export const REPORT_STATUSES: ReportStatus[] = ["neu", "in_bearbeitung", "geschlossen"];
export const MEASURE_PHASES: MeasurePhase[] = [
  "d3_sofort",
  "d4_ursache",
  "d5_d6_abstellung",
  "d7_wirksamkeit",
  "d8_vorbeugung",
];
export const MEASURE_STATUSES: MeasureStatus[] = ["offen", "erledigt"];
export const CUSTOMER_FEEDBACKS: CustomerFeedback[] = ["positiv", "neutral", "negativ"];

export const SEVERITY_TINT: Record<Severity, string> = {
  niedrig: "bg-muted text-muted-foreground",
  mittel: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  hoch: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  kritisch: "bg-destructive/10 text-destructive",
};

export const STATUS_TINT: Record<ReportStatus, string> = {
  neu: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  in_bearbeitung: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  geschlossen: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
};

/** Theme tokens (not Tailwind shades) for the refreshed design, so the list
 * dot, the panel's top edge and the status chip agree in both themes. */
export const SEVERITY_ACCENT: Record<Severity, string> = {
  niedrig: "var(--muted-foreground)",
  mittel: "var(--chart-1)",
  hoch: "var(--warn)",
  kritisch: "var(--destructive)",
};

export const STATUS_ACCENT: Record<ReportStatus, string> = {
  neu: "var(--chart-1)",
  in_bearbeitung: "var(--warn)",
  geschlossen: "var(--ok)",
};

export interface ErrorReportLike {
  severity: Severity;
  status: ReportStatus;
  dueAt: number | null;
}

/** 1 (Teamleitung) – 2 (Vertriebsleitung) – 3 (Geschäftsführung), derived,
 * never stored: critical or overdue-and-open escalates to the top, matching
 * the ported prototype's fixed escalation logic. */
export type EscalationLevel = 1 | 2 | 3;

export function isOverdue(report: ErrorReportLike, now = Date.now()): boolean {
  return report.status !== "geschlossen" && report.dueAt !== null && report.dueAt < now;
}

export function escalationLevel(report: ErrorReportLike, now = Date.now()): EscalationLevel {
  if (report.severity === "kritisch" || isOverdue(report, now)) return 3;
  if (report.severity === "hoch") return 2;
  return 1;
}

export const ESCALATION_TINT: Record<EscalationLevel, string> = {
  1: "bg-muted text-muted-foreground",
  2: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  3: "bg-destructive/10 text-destructive",
};

/** Response-time traffic light for customer-facing errors: green while
 * within the target, amber up to the warn threshold, red beyond it. */
export type ResponseAmpel = "gruen" | "gelb" | "rot";

/** `<input type="date">` uses local calendar dates, so this must format by
 * local Y/M/D components — `toISOString()` converts to UTC first, which
 * shifts the displayed date by a day for anyone east of UTC (including the
 * German audience this tool is for) once the stored instant crosses local
 * midnight. */
export function msToDateInput(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inverse of `msToDateInput` — parsed without a "Z" suffix, so this is
 * already local midnight. */
export function dateInputToMs(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

export function responseAmpel(
  daysSinceCreated: number,
  settings: { targetResponseDays: number; warnResponseDays: number },
): ResponseAmpel {
  if (daysSinceCreated <= settings.targetResponseDays) return "gruen";
  if (daysSinceCreated <= settings.warnResponseDays) return "gelb";
  return "rot";
}
