export type RichDateKind = "event" | "deadline" | "reminder";

export interface RichDateValue {
  startAt: number;
  endAt?: number;
  allDay: boolean;
  kind?: RichDateKind;
  description?: string;
  location?: string;
}

export const RICH_DATE_ATTRIBUTES = [
  "data-rich-date-start",
  "data-rich-date-end",
  "data-rich-date-all-day",
  "data-rich-date-kind",
  "data-rich-date-description",
  "data-rich-date-location",
] as const;

const kinds = new Set<RichDateKind>(["event", "deadline", "reminder"]);

export function readRichDateElement(element: HTMLElement): RichDateValue | null {
  const startValue = element.getAttribute("data-rich-date-start");
  if (!startValue?.trim()) return null;
  const startAt = Number(startValue);
  if (!Number.isFinite(startAt)) return null;
  const endValue = element.getAttribute("data-rich-date-end");
  const endAt = endValue?.trim() ? Number(endValue) : undefined;
  const kind = element.getAttribute("data-rich-date-kind");
  const description = element.getAttribute("data-rich-date-description")?.trim();
  const location = element.getAttribute("data-rich-date-location")?.trim();
  return {
    startAt,
    ...(endAt !== undefined && Number.isFinite(endAt) && endAt > 0 ? { endAt } : {}),
    allDay: element.getAttribute("data-rich-date-all-day") === "true",
    ...(kind && kinds.has(kind as RichDateKind) ? { kind: kind as RichDateKind } : {}),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
  };
}

export function writeRichDateElement(element: HTMLElement, value: RichDateValue) {
  for (const attribute of RICH_DATE_ATTRIBUTES) element.removeAttribute(attribute);
  element.className = "rich-date";
  element.setAttribute("contenteditable", "false");
  element.setAttribute("data-rich-date-start", String(value.startAt));
  element.setAttribute("data-rich-date-all-day", String(value.allDay));
  if (value.endAt) element.setAttribute("data-rich-date-end", String(value.endAt));
  if (value.kind) element.setAttribute("data-rich-date-kind", value.kind);
  if (value.description?.trim()) {
    element.setAttribute("data-rich-date-description", value.description.trim());
  }
  if (value.location?.trim()) {
    element.setAttribute("data-rich-date-location", value.location.trim());
  }
}

export function formatRichDate(value: RichDateValue, locale: string): string {
  const options: Intl.DateTimeFormatOptions = value.allDay
    ? { dateStyle: "medium" }
    : { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(locale, options).format(value.startAt);
}

export function hasCalendarPayload(value: RichDateValue): boolean {
  return !!value.kind && !!value.description?.trim();
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsUtc(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function downloadCalendarEvent(value: RichDateValue, summary: string) {
  const endAt =
    value.endAt ?? value.startAt + (value.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  const startLine = value.allDay
    ? `DTSTART;VALUE=DATE:${icsDate(value.startAt)}`
    : `DTSTART:${icsUtc(value.startAt)}`;
  const endLine = value.allDay ? `DTEND;VALUE=DATE:${icsDate(endAt)}` : `DTEND:${icsUtc(endAt)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advantis Group//Intranet Rich Date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${value.startAt}-${crypto.randomUUID()}@advantisgroup.de`,
    `DTSTAMP:${icsUtc(Date.now())}`,
    startLine,
    endLine,
    `SUMMARY:${icsEscape(summary.trim() || "Announcement")}`,
    ...(value.description ? [`DESCRIPTION:${icsEscape(value.description)}`] : []),
    ...(value.location ? [`LOCATION:${icsEscape(value.location)}`] : []),
    ...(value.kind ? [`CATEGORIES:${value.kind.toUpperCase()}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    summary
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "event"
  }.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
