/**
 * Minimal iCalendar (.ics) builder for all-day events — enough for absence and
 * event exports; no external dependency. `endDate` is inclusive (like our
 * absence rows); DTEND is exclusive per RFC 5545, so one day is added.
 */
export interface IcsAllDayEvent {
  uid: string;
  title: string;
  /** ISO YYYY-MM-DD */
  startDate: string;
  /** ISO YYYY-MM-DD, inclusive */
  endDate: string;
  description?: string;
}

function icsDate(iso: string): string {
  return iso.replaceAll("-", "");
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
    .replaceAll("\n", "\\n");
}

export function buildIcs(calendarName: string, events: IcsAllDayEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advantis//Intranet//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@advantis-intranet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.startDate)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.endDate, 1))}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
