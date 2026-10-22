/**
 * Salesforce-Meldungen: Consultants melden Salesforce-Probleme in die
 * Meldungs-Tabelle der Firma. Geschrieben/gelesen wird über eine Apps-Script-
 * Web-App in der Tabelle (docs/google-apps-script/sf-meldungen.gs), geschützt
 * durch einen gemeinsamen Token. Hier: Payload-Bau, Antwort-Parser, Aufruf.
 */
import { ApiError } from "./errors.js";

export const SF_PROJECTS = [
  "Hot-Inbound",
  "Inbound",
  "Cold-Outbound",
  "OST Websales",
  "Sonstiges",
] as const;

/** Werte exakt so, wie sie in der Tabelle stehen (englisch). */
export const SF_TOPICS = [
  "other",
  "no Account number",
  "SEPA not possible",
  "Credit Status",
  "Quote Problem",
  "Closing problem",
  "no subscription",
  "TAX Number löschen",
  "no customer Number",
  "no CAM ID",
] as const;

export type SfTopic = (typeof SF_TOPICS)[number];

export interface SfIssueInput {
  project: string;
  camId?: string;
  firma: string;
  topic: SfTopic;
  beschreibung: string;
  dringend: boolean;
  sfLink?: string;
}

export interface SfIssueRowPayload {
  datum: string;
  consultant: string;
  project: string;
  camId: string;
  firma: string;
  topic: string;
  beschreibung: string;
  info: string;
  sfLink: string;
}

export interface SfIssue {
  row: number;
  datum: string;
  project: string;
  camId: string;
  firma: string;
  topic: string;
  beschreibung: string;
  status: string;
  info: string;
  sfLink: string;
}

export const NOT_CONFIGURED_MESSAGE = "Salesforce-Meldungen sind noch nicht eingerichtet.";

/** Heutiges Datum in Europe/Berlin als dd.mm.yyyy. */
export function berlinDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
}

/** Formel-Injection verhindern (zusätzlich zum Apps Script): = + - @ entschärfen. */
export function sanitizeCell(value: string | undefined | null): string {
  const s = (value ?? "").trim();
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildSfIssueRow(
  input: SfIssueInput,
  consultant: string,
  now: Date = new Date(),
): SfIssueRowPayload {
  return {
    datum: berlinDate(now),
    consultant: sanitizeCell(consultant),
    project: sanitizeCell(input.project),
    camId: sanitizeCell(input.camId),
    firma: sanitizeCell(input.firma),
    topic: input.topic,
    beschreibung: sanitizeCell(input.beschreibung),
    info: input.dringend ? "DRINGEND" : "",
    sfLink: sanitizeCell(input.sfLink),
  };
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Antwort der „list“-Aktion → bereinigte Liste (max. 50, neueste zuerst). */
export function parseSfIssueList(data: unknown): SfIssue[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      row: Number(r.row) || 0,
      datum: str(r.datum),
      project: str(r.project),
      camId: str(r.camId),
      firma: str(r.firma),
      topic: str(r.topic),
      beschreibung: str(r.beschreibung),
      status: str(r.status).trim() || "Open",
      info: str(r.info),
      sfLink: str(r.sfLink),
    };
  });
}

export function sfSheetConfig(): { url: string; token: string } | null {
  const url = process.env.SF_SHEET_URL?.trim();
  const token = process.env.SF_SHEET_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/**
 * Ruft die Apps-Script-Web-App auf. Apps Script antwortet mit 302 auf
 * script.googleusercontent.com; fetch folgt dem als GET – so ist es gewollt.
 */
export async function callSheet(
  action: "append" | "list",
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = sfSheetConfig();
  if (!config) throw new ApiError(503, "feature_disabled", NOT_CONFIGURED_MESSAGE);
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: config.token, action, ...payload }),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[sf-issues] Apps Script", error);
    throw new ApiError(502, "upstream", "Die Meldungs-Tabelle ist gerade nicht erreichbar.");
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.ok !== true) {
    console.error("[sf-issues] Apps Script Antwort", response.status, data?.error);
    throw new ApiError(
      502,
      "upstream",
      data?.error === "forbidden"
        ? "Die Meldungs-Tabelle hat den Zugriff abgelehnt (Token prüfen)."
        : "Die Meldungs-Tabelle hat die Anfrage abgelehnt.",
    );
  }
  return data;
}
