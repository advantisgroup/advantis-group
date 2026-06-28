/**
 * Client-side data export helpers. Turns query results into a JSON or CSV file
 * and triggers a browser download — no server round-trip beyond the read that
 * already fetched the data. Used by the per-employee export on the timeline.
 */

/** Trigger a browser download of `content` as a file named `name`. */
export function downloadFile(
  name: string,
  mime: string,
  content: string
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Escape one CSV cell (RFC 4180: quote when it contains , " or newline). */
function csvCell(value: unknown): string {
  const s =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value as string | number | boolean | bigint);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialise an array of flat records to CSV. Columns are taken from `columns`
 * (preserves order); each row reads those keys. Returns header + rows.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: (keyof T)[]
): string {
  const header = columns.map(c => csvCell(String(c))).join(",");
  const body = rows.map(r => columns.map(c => csvCell(r[c])).join(","));
  return [header, ...body].join("\r\n");
}

/** Pretty JSON for a download. */
export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
