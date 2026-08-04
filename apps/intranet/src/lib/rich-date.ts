export type RichDateKind = "event" | "deadline" | "reminder";

export interface RichDateValue {
  id?: string;
  startAt: number;
  endAt?: number;
  allDay: boolean;
  kind?: RichDateKind;
  description?: string;
  location?: string;
}

export const RICH_DATE_ATTRIBUTES = [
  "data-rich-date-id",
  "data-rich-date-start",
  "data-rich-date-end",
  "data-rich-date-all-day",
  "data-rich-date-kind",
  "data-rich-date-description",
  "data-rich-date-location",
  "data-rich-date-source",
] as const;

export const ANNOUNCEMENT_RELEVANT_DATE_SOURCE = "announcement-relevant";
export const RICH_DATE_TIME_ZONE = "Europe/Berlin";

const DAY_MS = 24 * 60 * 60 * 1000;
const kinds = new Set<RichDateKind>(["event", "deadline", "reminder"]);
const berlinDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RICH_DATE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function berlinDateTimeParts(timestamp: number) {
  const parts = Object.fromEntries(
    berlinDateTimeFormatter
      .formatToParts(timestamp)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function berlinOffsetAt(timestamp: number): number {
  const parts = berlinDateTimeParts(timestamp);
  const roundedTimestamp = Math.floor(timestamp / 1000) * 1000;
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    roundedTimestamp
  );
}

export function readRichDateElement(element: HTMLElement): RichDateValue | null {
  const startValue = element.getAttribute("data-rich-date-start");
  if (!startValue?.trim()) return null;
  const startAt = Number(startValue);
  if (!Number.isFinite(startAt)) return null;
  const endValue = element.getAttribute("data-rich-date-end");
  const endAt = endValue?.trim() ? Number(endValue) : undefined;
  const id = element.getAttribute("data-rich-date-id")?.trim();
  const kind = element.getAttribute("data-rich-date-kind");
  const description = element.getAttribute("data-rich-date-description")?.trim();
  const location = element.getAttribute("data-rich-date-location")?.trim();
  return {
    ...(id ? { id } : {}),
    startAt,
    ...(endAt !== undefined && Number.isFinite(endAt) && endAt > 0 ? { endAt } : {}),
    allDay: element.getAttribute("data-rich-date-all-day") === "true",
    ...(kind && kinds.has(kind as RichDateKind) ? { kind: kind as RichDateKind } : {}),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
  };
}

export function writeRichDateElement(
  element: HTMLElement,
  value: RichDateValue,
  source = element.getAttribute("data-rich-date-source") ?? undefined,
) {
  for (const attribute of RICH_DATE_ATTRIBUTES) element.removeAttribute(attribute);
  element.className = "rich-date";
  element.setAttribute("contenteditable", "false");
  if (value.id) element.setAttribute("data-rich-date-id", value.id);
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
  if (source) element.setAttribute("data-rich-date-source", source);
}

export function formatRichDate(value: RichDateValue, locale: string): string {
  const options: Intl.DateTimeFormatOptions = value.allDay
    ? { dateStyle: "medium", timeZone: "UTC" }
    : { dateStyle: "medium", timeStyle: "short", timeZone: RICH_DATE_TIME_ZONE };
  return new Intl.DateTimeFormat(locale, options).format(value.startAt);
}

export function richDateInputFromTimestamp(timestamp: number, allDay: boolean): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  const berlin = allDay ? null : berlinDateTimeParts(timestamp);
  const year = allDay ? date.getUTCFullYear() : berlin!.year;
  const month = allDay ? date.getUTCMonth() + 1 : berlin!.month;
  const dayOfMonth = allDay ? date.getUTCDate() : berlin!.day;
  const day = `${year}-${pad(month)}-${pad(dayOfMonth)}`;
  return allDay ? day : `${day}T${pad(berlin!.hour)}:${pad(berlin!.minute)}`;
}

export function richDateTimestampFromInput(value: string, allDay: boolean): number {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (allDay) return Date.UTC(year, month - 1, day);
  const [hour, minute] = timePart.split(":").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set([
    berlinOffsetAt(wallClockUtc - DAY_MS),
    berlinOffsetAt(wallClockUtc),
    berlinOffsetAt(wallClockUtc + DAY_MS),
  ]);
  const candidates = [...offsets]
    .map((offset) => wallClockUtc - offset)
    .filter((timestamp) => {
      const parts = berlinDateTimeParts(timestamp);
      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      );
    });
  return candidates.length > 0 ? Math.min(...candidates) : Number.NaN;
}

export function syncSourcedRichDateHtml(
  html: string,
  source: string,
  value: RichDateValue | null,
  label = "",
): string {
  if (typeof DOMParser === "undefined" || !html.includes("data-rich-date-source")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const matches = Array.from(doc.querySelectorAll<HTMLElement>("[data-rich-date-source]")).filter(
    (element) => element.getAttribute("data-rich-date-source") === source,
  );
  if (matches.length === 0) return html;
  for (const element of matches) {
    if (!value) {
      element.remove();
    } else {
      writeRichDateElement(element, value, source);
      element.textContent = label || formatRichDate(value, navigator.language);
    }
  }
  return doc.body.innerHTML;
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
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function foldIcsLine(line: string): string {
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

function stableCalendarId(value: RichDateValue, summary: string): string {
  if (value.id) return value.id;
  const seed = JSON.stringify([
    summary.trim(),
    value.startAt,
    value.endAt,
    value.allDay,
    value.kind,
    value.description,
    value.location,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.startAt}-${(hash >>> 0).toString(36)}`;
}

export function downloadCalendarEvent(value: RichDateValue, summary: string) {
  const endAt = value.endAt ?? value.startAt + (value.allDay ? DAY_MS : 60 * 60 * 1000);
  const calendarEndAt = value.allDay && value.endAt ? endAt + DAY_MS : endAt;
  const startLine = value.allDay
    ? `DTSTART;VALUE=DATE:${icsDate(value.startAt)}`
    : `DTSTART:${icsUtc(value.startAt)}`;
  const endLine = value.allDay
    ? `DTEND;VALUE=DATE:${icsDate(calendarEndAt)}`
    : `DTEND:${icsUtc(calendarEndAt)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advantis Group//Intranet Rich Date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(stableCalendarId(value, summary))}@advantisgroup.de`,
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
  const blob = new Blob([`${lines.map(foldIcsLine).join("\r\n")}\r\n`], {
    type: "text/calendar;charset=utf-8",
  });
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
