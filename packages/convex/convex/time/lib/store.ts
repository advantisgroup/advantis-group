import { ConvexError } from "convex/values";

import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { type Caller } from "../../lib/caller";
import { notifyUsers } from "../../lib/notify";
import {
  addDays,
  berlinDate,
  berlinInstant,
  monthEnd,
  monthOf,
  monthStart,
  monthsBetween,
} from "./berlin";
import { BREAK30_AFTER_MINUTES, measureDay, summarizeDays, totals } from "./days";
import { isMonthLocked } from "./lock";
import { carryOverExpiry, vacationSummary } from "./vacation";
import { isTimeTestMode, timeTesterEmails } from "./mode";

/**
 * Database-side helpers every Zeiterfassung function shares: who a request is
 * about, loading what the pure calculations need, the month lock, the audit
 * trail and the cached month totals.
 */

export type TimeError =
  | "month_locked"
  | "overlap"
  | "already_clocked_in"
  | "not_clocked_in"
  | "already_on_break"
  | "not_on_break"
  | "running_entry"
  | "in_future"
  | "invalid_range"
  | "already_pending"
  | "not_pending"
  | "changed_meanwhile"
  | "no_working_days"
  | "tracking_disabled";

/** `code` is the shared one the intranet's error handling knows; `reason`
 *  lets the Zeiterfassung screens say exactly what went wrong. */
export function timeError(code: "bad_request" | "conflict", reason: TimeError, message: string) {
  return new ConvexError({ code, reason, message });
}

/** The person a call is about: yourself, or anyone for an admin. */
export function subjectFor(caller: Caller, userId: Id<"users"> | undefined): Id<"users"> {
  if (!userId || userId === caller.id) return caller.id;
  caller.require("admin");
  return userId;
}

// --- Audit -----------------------------------------------------------------

export type AuditEntity = Doc<"timeAuditLog">["entity"];

/** The one way anything in this module is written down. Append-only. */
export async function writeAudit(
  ctx: MutationCtx,
  row: {
    actorId?: Id<"users">;
    subjectUserId?: Id<"users">;
    entity: AuditEntity;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
): Promise<void> {
  await ctx.db.insert("timeAuditLog", { ...row, at: Date.now() });
}

// --- Loading ------------------------------------------------------------------

/** Whether this person records working time at all (see `timeProfiles`). */
export async function isTrackingDisabled(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const row = await ctx.db
    .query("timeProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return row?.trackingDisabled === true;
}

/** This person's switches (`timeProfiles`), if any were ever set. */
export async function loadProfile(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("timeProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Doesn't clock: no clock, no morning prompt — either no time recording at
 *  all, or fixed hours booked automatically. */
export async function isClockingOff(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const row = await loadProfile(ctx, userId);
  return row?.trackingDisabled === true || row?.autoBook !== undefined;
}

/** Date from which this person may use the module before go-live, if any. */
export async function earlyAccessFrom(ctx: QueryCtx, userId: Id<"users">): Promise<string | null> {
  const row = await ctx.db
    .query("timeProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return row?.earlyAccessFrom ?? null;
}

/** Everyone who doesn't record working time. */
export async function trackingDisabledIds(ctx: QueryCtx): Promise<Set<Id<"users">>> {
  const rows = await ctx.db.query("timeProfiles").collect();
  return new Set(rows.filter((row) => row.trackingDisabled).map((row) => row.userId));
}

export async function loadSchedules(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("workSchedules")
    .withIndex("by_user_validFrom", (q) => q.eq("userId", userId))
    .collect();
}

export async function loadHolidays(ctx: QueryCtx, from: string, to: string) {
  return ctx.db
    .query("holidays")
    .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
    .collect();
}

/** A person's absences — a handful a year, so all of them. */
export async function loadAbsences(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("timeAbsences")
    .withIndex("by_user_start", (q) => q.eq("userId", userId))
    .collect();
}

/** Entries starting on the Berlin dates `from`..`to`, every status. */
export async function loadEntries(ctx: QueryCtx, userId: Id<"users">, from: string, to: string) {
  return ctx.db
    .query("timeEntries")
    .withIndex("by_user_start", (q) =>
      q
        .eq("userId", userId)
        .gte("start", berlinInstant(from))
        .lt("start", berlinInstant(addDays(to, 1))),
    )
    .collect();
}

export async function openEntries(ctx: QueryCtx, userId?: Id<"users">) {
  const rows = await ctx.db
    .query("timeEntries")
    .withIndex("by_end", (q) => q.eq("end", undefined))
    .collect();
  return rows.filter((row) => row.status === "active" && (!userId || row.userId === userId));
}

export function isActive(row: { status: string }) {
  return row.status === "active";
}

export function isApproved(row: { status: string }) {
  return row.status === "approved";
}

/** Everything `summarizeDays` needs for one person and range. */
export async function dayInputs(ctx: QueryCtx, userId: Id<"users">, from: string, to: string) {
  const [entries, schedules, holidays, absences] = await Promise.all([
    loadEntries(ctx, userId, addDays(from, -1), to),
    loadSchedules(ctx, userId),
    loadHolidays(ctx, from, to),
    loadAbsences(ctx, userId),
  ]);
  return { entries, schedules, holidays, absences };
}

export async function computeDays(
  ctx: QueryCtx,
  userId: Id<"users">,
  from: string,
  to: string,
  now: number,
) {
  const input = await dayInputs(ctx, userId, from, to);
  return summarizeDays({
    from,
    to,
    segments: input.entries.filter(isActive),
    schedules: input.schedules,
    holidays: input.holidays,
    absences: input.absences.filter(isApproved),
    now,
  });
}

// --- Month lock -----------------------------------------------------------------

export async function lockRow(ctx: QueryCtx, month: string) {
  return ctx.db
    .query("monthLocks")
    .withIndex("by_month", (q) => q.eq("month", month))
    .unique();
}

export async function monthLocked(ctx: QueryCtx, month: string, now = Date.now()) {
  return isMonthLocked(month, now, await lockRow(ctx, month));
}

/** Refuses any change touching a locked month — admins included; they unlock
 *  the month first, with a reason. */
export async function assertDatesOpen(ctx: QueryCtx, dates: string[]): Promise<void> {
  const months = [...new Set(dates.map(monthOf))];
  for (const month of months) {
    if (await monthLocked(ctx, month)) {
      throw timeError("conflict", "month_locked", `Month ${month} is locked`);
    }
  }
}

export function datesOfRange(startDate: string, endDate: string): string[] {
  return monthsBetween(startDate, endDate).map((month) =>
    month === monthOf(startDate) ? startDate : monthStart(month),
  );
}

// --- Cached month totals ---------------------------------------------------------

/** Forget cached totals a change may have made wrong. `userId` unset = everyone. */
export async function invalidateTotals(
  ctx: MutationCtx,
  userId: Id<"users"> | null,
  dates: string[],
): Promise<void> {
  const months = new Set(dates.map(monthOf));
  for (const month of months) {
    const rows = await ctx.db
      .query("timeMonthTotals")
      .withIndex("by_month", (q) => q.eq("month", month))
      .collect();
    for (const row of rows) {
      if (!userId || row.userId === userId) await ctx.db.delete(row._id);
    }
  }
}

export async function invalidateTotalsFrom(
  ctx: MutationCtx,
  userId: Id<"users">,
  fromDate: string,
): Promise<void> {
  const rows = await ctx.db
    .query("timeMonthTotals")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).gte("month", monthOf(fromDate)))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Write the cached totals of one full month for one person. */
export async function storeMonthTotals(ctx: MutationCtx, userId: Id<"users">, month: string) {
  const days = await computeDays(ctx, userId, monthStart(month), monthEnd(month), Date.now());
  const sum = totals(days);
  const existing = await ctx.db
    .query("timeMonthTotals")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();
  const row = {
    userId,
    month,
    workedMinutes: sum.workedMinutes,
    targetMinutes: sum.targetMinutes,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, row);
  else await ctx.db.insert("timeMonthTotals", row);
}

// --- Hours account and vacation ---------------------------------------------------

/**
 * The hours account at the end of `through`: the opening balance plus worked
 * minus target for every day since the account starts (its opening date, else
 * the earliest schedule or entry). Full months use the cached totals when
 * there are any.
 */
export async function hoursAccount(
  ctx: QueryCtx,
  userId: Id<"users">,
  through: string,
): Promise<{ minutes: number; since: string | null; openingMinutes: number }> {
  const opening = await ctx.db
    .query("timeBalances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  let since = opening?.openingDate ?? null;
  if (!since) {
    const [firstEntry, schedules] = await Promise.all([
      ctx.db
        .query("timeEntries")
        .withIndex("by_user_start", (q) => q.eq("userId", userId))
        .first(),
      loadSchedules(ctx, userId),
    ]);
    const candidates = [
      firstEntry ? berlinDate(firstEntry.start) : null,
      ...schedules.map((schedule) => schedule.validFrom),
    ].filter((date): date is string => date !== null);
    since = candidates.sort()[0] ?? null;
  }
  const openingMinutes = opening?.openingMinutes ?? 0;
  if (!since || since > through) return { minutes: openingMinutes, since, openingMinutes };

  const cached = new Map(
    (
      await ctx.db
        .query("timeMonthTotals")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .collect()
    ).map((row) => [row.month, row]),
  );
  let minutes = openingMinutes;
  for (const month of monthsBetween(since, through)) {
    const first = monthStart(month);
    const last = monthEnd(month);
    const row = cached.get(month);
    if (row && first >= since && last <= through) {
      minutes += row.workedMinutes - row.targetMinutes;
      continue;
    }
    const days = await computeDays(
      ctx,
      userId,
      first < since ? since : first,
      last > through ? through : last,
      Date.now(),
    );
    minutes += totals(days).balanceMinutes;
  }
  return { minutes, since, openingMinutes };
}

export async function vacationFor(
  ctx: QueryCtx,
  userId: Id<"users">,
  year: number,
  asOf: string,
  absences?: Doc<"timeAbsences">[],
) {
  const [allowance, schedules, holidays, rows] = await Promise.all([
    ctx.db
      .query("vacationAllowances")
      .withIndex("by_user_year", (q) => q.eq("userId", userId).eq("year", year))
      .unique(),
    loadSchedules(ctx, userId),
    loadHolidays(ctx, `${year}-01-01`, `${year}-12-31`),
    absences ? Promise.resolve(absences) : loadAbsences(ctx, userId),
  ]);
  return vacationSummary({
    year,
    allowance: allowance
      ? {
          days: allowance.days,
          carriedOver: allowance.carriedOver,
          carriedOverExpires: allowance.carriedOverExpires || carryOverExpiry(year),
        }
      : null,
    absences: rows,
    schedules,
    holidays,
    asOf,
  });
}

// --- People and notifications ------------------------------------------------------

export async function activeAdmins(ctx: QueryCtx) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  return admins.filter((user) => user.status === "active");
}

async function activeTesters(ctx: QueryCtx) {
  const testers = await Promise.all(
    timeTesterEmails().map((email) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first(),
    ),
  );
  return testers.filter((user): user is Doc<"users"> => user !== null);
}

export async function notifyAdmins(
  ctx: MutationCtx,
  args: { type: string; title: string; body?: string; link?: string },
  except?: Id<"users">,
): Promise<void> {
  // In test mode the admins are testing too, so they hear about test data;
  // the extra testers (lib/mode.ts) get the same notifications.
  const admins = await activeAdmins(ctx);
  const recipients = isTimeTestMode() ? [...admins, ...(await activeTesters(ctx))] : admins;
  const seen = new Set<Id<"users">>();
  const targets = recipients.filter((user) => {
    if (user._id === except || seen.has(user._id)) return false;
    seen.add(user._id);
    return true;
  });
  await notifyUsers(
    ctx,
    targets.map((user) => user._id),
    args,
  );
}

const PHONE_ACTION = {
  clockIn: "eingestempelt",
  clockOut: "ausgestempelt",
  breakStart: "Pause begonnen",
  breakEnd: "Pause beendet",
} as const;

/** A clock action made on a phone: a short note to every admin. */
export async function notePhoneBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: keyof typeof PHONE_ACTION,
  at: number,
): Promise<void> {
  const person = await ctx.db.get(userId);
  const time = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  const date = berlinDate(at);
  await notifyAdmins(
    ctx,
    {
      type: "time_phone_booking",
      title: `Handy: ${displayName(person)} ${PHONE_ACTION[action]}`,
      body: `${dateFormatter(date)}, ${time} Uhr – per Handy gestempelt.`,
      link: `/zeiterfassung/admin/${userId}?date=${date}`,
    },
    userId,
  );
}

/**
 * After clocking out (not on the 18:00 rule, which has its own note): if the
 * day ran past 6:15 with less than 30 minutes of break, tell the person and
 * the admins. Nothing is deducted — the day keeps its "Pause < 30 Min." chip
 * until it's corrected.
 */
export async function noteMissingBreak(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: string,
): Promise<void> {
  const segments = (
    await ctx.db
      .query("timeEntries")
      .withIndex("by_user_start", (q) =>
        q
          .eq("userId", userId)
          .gte("start", berlinInstant(date))
          .lt("start", berlinInstant(addDays(date, 1))),
      )
      .collect()
  ).filter((row) => row.status === "active");
  const day = measureDay(segments, Date.now());
  const worked = Math.round(day.workedMs / 60_000);
  const breaks = Math.round(day.countedBreakMs / 60_000);
  if (worked <= BREAK30_AFTER_MINUTES || breaks >= 30) return;
  const hours = `${Math.floor(worked / 60)}:${String(worked % 60).padStart(2, "0")}`;
  const link = `/zeiterfassung/arbeitszeiten?date=${date}`;
  await notifyUsers(ctx, [userId], {
    type: "time_break_missing",
    title: "Pause nicht gemacht",
    body: `Du hast am ${dateFormatter(date)} ${hours} Std. gearbeitet, aber keine 30 Minuten Pause gestempelt. Falls du doch Pause hattest, trag sie bitte nach.`,
    link,
  });
  const person = await ctx.db.get(userId);
  await notifyAdmins(
    ctx,
    {
      type: "time_break_missing",
      title: `Pause fehlt: ${displayName(person)}`,
      body: `${dateFormatter(date)}: ${hours} Std. gearbeitet, weniger als 30 Minuten Pause.`,
      link: `/zeiterfassung/admin/${userId}?date=${date}`,
    },
    userId,
  );
}

export function displayName(user: Pick<Doc<"users">, "firstName" | "lastName" | "email"> | null) {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

const dateFormatter = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
};

export function formatDate(date: string): string {
  return dateFormatter(date);
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
