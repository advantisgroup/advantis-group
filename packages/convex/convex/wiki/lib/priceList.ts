/**
 * Baut den Inhalt des Wiki-Eintrags „Listenpreise netto (Preiszonen)“ aus der
 * Tabelle der täglichen Preislisten-Mail — gleiche Struktur wie in
 * migrations/addListPrices.ts. Reine Funktionen, ohne Datenbank.
 */

export const LIST_PRICES_SLUG = "listenpreise-netto";
export const LIST_PRICES_TITLE = "Listenpreise netto (Preiszonen)";
export const LIST_PRICES_CATEGORY = { name: "Vertrieb", color: "#2F7FA6" };
export const LIST_PRICES_TAGS = ["Preise", "Listenpreis", "Preiszone"];

export interface PriceTableInput {
  receivedAt: number;
  columns: string[];
  rows: { date: string; values: string[] }[];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** „2026-10-21“ → „21.10.2026“. */
export function formatPriceDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Zeitpunkt in Berliner Zeit als „DD.MM.YYYY, HH:MM“. */
export function formatBerlinStand(at: number): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")}`;
}

/** Neuester Tag der Tabelle (YYYY-MM-DD), oder `null` ohne Zeilen. */
export function newestPriceDate(rows: PriceTableInput["rows"]): string | null {
  let newest: string | null = null;
  for (const row of rows) if (newest === null || row.date > newest) newest = row.date;
  return newest;
}

export function buildPriceListHtml(table: PriceTableInput): string {
  const rows = [...table.rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const head = ["Datum", ...table.columns].map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr><td><strong>${escapeHtml(formatPriceDate(row.date))}</strong></td>${row.values
          .map((value) => `<td>${escapeHtml(value)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return (
    "<p>Netto-Listenpreise je Preiszone (€/Liter), neuester Tag oben.</p>" +
    `<div data-callout="info"><p>Stand: ${formatBerlinStand(table.receivedAt)} Uhr. Die Liste wird automatisch aus der täglichen Preislisten-Mail aktualisiert.</p></div>` +
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  );
}
