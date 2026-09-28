/**
 * Pure helpers for website inquiries, shared by Convex, apps/marketing,
 * apps/intranet and apps/api (exported as `@advantis/convex/marketing/inquiry`)
 * so a reference, a reply-by time or a callback window reads the same
 * everywhere. No Convex imports on purpose. See docs/inquiries.md.
 */

export type InquiryState = "open" | "in_progress" | "answered" | "closed" | "withdrawn";

export type FailureReason =
  | "invalid_address"
  | "mailbox_unavailable"
  | "temporary"
  | "rate_limited"
  | "provider_error"
  | "unknown";

export const TEAM_TIME_ZONE = "Europe/Berlin";

// legal should confirm this before it matters; nothing is anonymized sooner than this
export const INQUIRY_RETENTION_YEARS = 3;

/** The sequential numbering used briefly before references came from the id; still resolvable. */
export const formatReference = (nr: number) => `AG-${String(nr).padStart(4, "0")}`;

/**
 * An inquiry's reference is the end of its database id ("#841KGR"): short
 * enough to read out on the phone, and it points straight at the row. Six
 * characters, one more for each inquiry that already holds the shorter one.
 */
export const REF_MIN_LENGTH = 6;

export const refCandidate = (id: string, length: number) => id.slice(-length).toLowerCase();

/** "#841KGR": the stored `ref`, or the first candidate for rows from before it was stored. */
export const referenceOf = (row: { _id: string; ref?: string }) =>
  `#${(row.ref ?? refCandidate(row._id, REF_MIN_LENGTH)).toUpperCase()}`;

const DAY = 24 * 60 * 60 * 1000;

const zonedParts = (at: number, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday as string,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
};

const isWeekend = (at: number) => ["Sat", "Sun"].includes(zonedParts(at, TEAM_TIME_ZONE).weekday);

/** The same time on the next business day in Berlin — what "within one business day" promises. */
export function replyDueAt(sentAt: number): number {
  let due = sentAt + DAY;
  while (isWeekend(due)) due += DAY;
  return due;
}

export const CALLBACK_HOURS = {
  timeZone: TEAM_TIME_ZONE,
  /** Monday to Friday, as in `Date.getDay()`. */
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
} as const;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function isWithinCallbackHours(at: number): boolean {
  const { weekday, hour } = zonedParts(at, CALLBACK_HOURS.timeZone);
  return (
    (CALLBACK_HOURS.days as readonly number[]).includes(WEEKDAY_INDEX[weekday]) &&
    hour >= CALLBACK_HOURS.startHour &&
    hour < CALLBACK_HOURS.endHour
  );
}

/**
 * A wall-clock "YYYY-MM-DDTHH:mm" read in `timeZone`, as an instant. Old rows
 * stored the datetime-local value with no zone at all; the team always read
 * those as Berlin time, so that's what the migration assumes.
 */
export function zonedLocalToInstant(local: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (at: number) => {
    const p = zonedParts(at, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at;
  };
  // twice, so an instant right next to a DST switch lands on the right side of it
  const first = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(first);
}

/** Old `desiredDateTime` values: epoch seconds/ms, or a zone-less local datetime. */
export function legacyDesiredAt(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.length <= 10 ? Number(trimmed) * 1000 : Number(trimmed);
  }
  return zonedLocalToInstant(trimmed, TEAM_TIME_ZONE);
}

export type CustomerAction = "withdraw" | "resolve" | "reopen";

/** The only state changes a customer can make; everything else is the team's. */
export const CUSTOMER_TRANSITIONS: Record<
  CustomerAction,
  { from: readonly InquiryState[]; to: InquiryState }
> = {
  withdraw: { from: ["open", "in_progress"], to: "withdrawn" },
  resolve: { from: ["answered"], to: "closed" },
  reopen: { from: ["answered", "closed"], to: "in_progress" },
};

/** Resend's error names (and plain thrown errors) boiled down to something a customer can act on. */
export function classifyResendError(error: unknown): FailureReason {
  if (!error || typeof error !== "object") return "unknown";
  const { name, message, statusCode } = error as {
    name?: string;
    message?: string;
    statusCode?: number | null;
  };
  const text = `${name ?? ""} ${message ?? ""}`.toLowerCase();

  if (statusCode === 429 || /rate_limit|quota/.test(text)) return "rate_limited";
  if (/validation|invalid/.test(text) && /email|address|recipient|\bto\b/.test(text)) {
    return "invalid_address";
  }
  if (
    (statusCode !== undefined && statusCode !== null && statusCode >= 500) ||
    /internal_server_error|application_error|fetch failed|network|timeout|econn/.test(text)
  ) {
    return "provider_error";
  }
  return "unknown";
}

/** Resend's `email.bounced` payload: a permanent bounce won't fix itself, a transient one might. */
export function classifyBounce(bounce: { type?: string } | undefined): FailureReason {
  const type = bounce?.type?.toLowerCase() ?? "";
  if (type.startsWith("perm") || type === "hard") return "mailbox_unavailable";
  if (type.startsWith("trans") || type === "soft") return "temporary";
  return "unknown";
}

export type InquiryTitleParts =
  | { kind: "subject"; text: string }
  | { kind: "callback"; at: number | null; timeZone?: string }
  | { kind: "text"; text: string; rest: string }
  | { kind: "empty" };

/**
 * What to call an inquiry in a list. Messages and callbacks never had a real
 * subject — the form sent a fixed "User Request - …" — so a message is named
 * by its first line and a callback by its time; "other" keeps the subject the
 * person typed. The UI formats `at` and falls back to the type label.
 */
export function inquiryTitleParts(row: {
  submissionType: "message" | "callback" | "other";
  subject: string;
  message: string;
  desiredAt?: number;
  desiredDateTime?: string;
  timeZone?: string;
}): InquiryTitleParts {
  if (row.submissionType === "other" && row.subject.trim()) {
    return { kind: "subject", text: row.subject.trim() };
  }
  if (row.submissionType === "callback") {
    return {
      kind: "callback",
      at: row.desiredAt ?? legacyDesiredAt(row.desiredDateTime),
      timeZone: row.timeZone,
    };
  }
  const lines = row.message.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim());
  if (first === -1) return { kind: "empty" };
  return {
    kind: "text",
    text: lines[first].trim(),
    rest: lines
      .slice(first + 1)
      .join("\n")
      .trim(),
  };
}

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const icsTime = (at: number) =>
  new Date(at)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * A single-event calendar file. `REQUEST`/`CANCEL` go in mails (same UID, so
 * a cancel removes the entry the request made); `PUBLISH` is for a plain
 * "add to calendar" download.
 */
export function buildIcs({
  uid,
  start,
  durationMinutes = 30,
  title,
  description,
  method = "PUBLISH",
  organizer,
  sequence = 0,
  now = Date.now(),
}: {
  uid: string;
  start: number;
  durationMinutes?: number;
  title: string;
  description?: string;
  method?: "PUBLISH" | "REQUEST" | "CANCEL";
  organizer?: { name: string; email: string };
  sequence?: number;
  now?: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADVANTIS GROUP//Inquiries//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}@advantisgroup.de`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(start + durationMinutes * 60 * 1000)}`,
    `SUMMARY:${icsText(title)}`,
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    ...(organizer ? [`ORGANIZER;CN=${icsText(organizer.name)}:mailto:${organizer.email}`] : []),
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

// --- Tags ---------------------------------------------------------------------------

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;

/** Lowercased, trimmed, inner spaces as "-", no "#", no duplicates, at most MAX_TAGS. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, MAX_TAG_LENGTH);
    if (tag) seen.add(tag);
    if (seen.size === MAX_TAGS) break;
  }
  return [...seen];
}

// --- Reply templates ------------------------------------------------------------------

export const TEMPLATE_PLACEHOLDERS = [
  "firstName",
  "lastName",
  "name",
  "company",
  "reference",
  "myFirstName",
  "myName",
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

/**
 * Fills `{firstName}`-style placeholders. One that has no value (no company
 * on file) is dropped along with a space before it, so "Hallo {firstName},"
 * without a name reads "Hallo,". Unknown ones stay as typed.
 */
export function fillTemplate(
  body: string,
  values: Partial<Record<TemplatePlaceholder, string | undefined>>,
): string {
  return body.replace(/ ?\{(\w+)\}/g, (match, key: string) => {
    if (!(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key)) return match;
    const value = values[key as TemplatePlaceholder]?.trim();
    if (!value) return "";
    return match.startsWith(" ") ? ` ${value}` : value;
  });
}

// --- Who else is on it ----------------------------------------------------------------

/** The inquiry page beats this often while open. */
export const VIEWER_HEARTBEAT_MS = 10_000;
/** A viewer who hasn't beaten for this long has left (closed the tab, lost the network). */
export const VIEWER_STALE_MS = 30_000;

// --- Same customer --------------------------------------------------------------------

type CustomerKeys = { email: string; accountEmail: string; clerkUserId: string };

/**
 * Whether two inquiries come from the same person: the same contact address,
 * the same signed-in account, or one sent signed in with the address the
 * other came from. Only these can be merged, so a merge never shows one
 * customer another's words.
 */
export function sameCustomer(a: CustomerKeys, b: CustomerKeys): boolean {
  const addresses = (row: CustomerKeys) =>
    new Set(
      [row.email, row.accountEmail].map((value) => value.trim().toLowerCase()).filter(Boolean),
    );
  const theirs = addresses(b);
  if ([...addresses(a)].some((address) => theirs.has(address))) return true;
  return a.clerkUserId !== "" && a.clerkUserId === b.clerkUserId;
}

// --- Stats ------------------------------------------------------------------------------

/** The middle value (the mean of the two middle ones for an even count); undefined for none. */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
