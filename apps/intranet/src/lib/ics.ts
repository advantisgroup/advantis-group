/**
 * Minimal iCalendar (.ics) builder — enough for absence and event exports; no
 * external dependency. All-day entries use `startDate`/`endDate` (inclusive;
 * DTEND is exclusive per RFC 5545, so one day is added); timed entries use
 * `startMs`/`endMs` epoch milliseconds instead.
 */
export interface IcsAllDayEvent {
  uid: string;
  title: string;
  /** ISO YYYY-MM-DD */
  startDate?: string;
  /** ISO YYYY-MM-DD, inclusive */
  endDate?: string;
  startMs?: number;
  endMs?: number;
  description?: string;
  location?: string;
  categories?: string[];
}

function icsDate(iso: string): string {
  return iso.replaceAll("-", "");
}

function icsDateTime(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  let limit = 75;
  for (const character of line) {
    if (chunk && encoder.encode(chunk + character).length > limit) {
      chunks.push(chunk);
      chunk = character;
      limit = 74;
    } else {
      chunk += character;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n ");
}

export function buildIcs(calendarName: string, events: IcsAllDayEvent[]): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advantis//Intranet//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    const timed = e.startMs !== undefined && e.endMs !== undefined;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(e.uid)}@advantis-intranet`,
      `DTSTAMP:${stamp}`,
      ...(timed
        ? [`DTSTART:${icsDateTime(e.startMs!)}`, `DTEND:${icsDateTime(e.endMs!)}`]
        : [
            `DTSTART;VALUE=DATE:${icsDate(e.startDate!)}`,
            `DTEND;VALUE=DATE:${icsDate(addDays(e.endDate!, 1))}`,
          ]),
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      ...(e.categories?.length ? [`CATEGORIES:${e.categories.map(escapeText).join(",")}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
