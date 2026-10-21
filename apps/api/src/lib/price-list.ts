/**
 * Die tägliche Preisliste („LP Network Germany and Austria -- Prices exern
 * callcenter“), die als Mail im Postfach chefsache@ ankommt: eine Tabelle im
 * Klartext, je Zeile ein Tag (neuester oben) mit elf Preisen. Mailprogramme
 * machen aus den Tabs gern Leerzeichen, und die letzte Zeile kann abgeschnitten
 * sein — gezählt wird nur, was vollständig ist.
 */

export const PRICE_LIST_SUBJECT = "lp network germany and austria";

/** Die Spalten, falls die Kopfzeile nicht sauber zu lesen ist. */
export const DEFAULT_PRICE_COLUMNS = [
  "DEU Preiszone 1",
  "DEU Preiszone 2",
  "DEU Preiszone 3",
  "Listpreis_ARAL nicht Autobahn",
  "LP_AUT_1",
  "LP_AUT_2",
  "LP_AUT_3",
  "Shell-Preiszone 1",
  "Shell-Preiszone 2",
  "Shell-Preiszone 3",
  "Shell-Preiszone 4",
];

const VALUE_COUNT = DEFAULT_PRICE_COLUMNS.length;
const ROW = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const PRICE = /^\d,\d{3}$/;

export interface PriceTable {
  columns: string[];
  /** Neuester Tag zuerst; `date` als YYYY-MM-DD. */
  rows: { date: string; values: string[] }[];
}

export function isPriceListSubject(subject: string): boolean {
  return subject.toLowerCase().includes(PRICE_LIST_SUBJECT);
}

/** Die Tabelle aus dem Text der Mail, oder `null`, wenn keine drin ist. */
export function parsePriceTable(text: string): PriceTable | null {
  const lines = text.split(/\r?\n/);
  let columns = DEFAULT_PRICE_COLUMNS;
  const rows: PriceTable["rows"] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("Listprice net")) {
      // Spaltennamen enthalten einzelne Leerzeichen; getrennt wird durch Tabs
      // oder mehrere Leerzeichen.
      const parts = line
        .split(/\t+| {2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === VALUE_COUNT + 1) columns = parts.slice(1);
      continue;
    }
    const match = ROW.exec(line);
    if (!match) continue;
    const values = match[2].split(/\s+/).filter(Boolean);
    if (values.length !== VALUE_COUNT || !values.every((v) => PRICE.test(v))) continue;
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    rows.push({ date: match[1], values });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { columns, rows };
}
