import { v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import { createNotification } from "../lib/notify";
import { timeAbsenceTypeValidator } from "../tables/time";
import { addDays, isIsoDate } from "./lib/berlin";
import { absenceWorkingDays } from "./lib/days";
import {
  assertDatesOpen,
  datesOfRange,
  displayName,
  formatRange,
  invalidateTotals,
  loadAbsences,
  loadHolidays,
  loadSchedules,
  notifyAdmins,
  subjectFor,
  timeError,
  writeAudit,
} from "./lib/store";

/**
 * Vacation, sick days, special leave and other absences. Sick days are
 * approved as they're entered (admins hear about them); everything else waits
 * for an admin. Others only ever see someone's approved vacation.
 */

const TYPE_LABEL: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krankmeldung",
  special: "Sonderurlaub",
  other: "Abwesenheit",
};

const LINK = "/zeiterfassung/abwesenheiten";

/** A person's absences with their working-day count, newest first. */
export const list = userQuery({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const subject = subjectFor(ctx.caller, userId);
    const rows = await loadAbsences(ctx, subject);
    if (rows.length === 0) return [];
    const schedules = await loadSchedules(ctx, subject);
    const from = rows.reduce((min, row) => (row.startDate < min ? row.startDate : min), "9999");
    const to = rows.reduce((max, row) => (row.endDate > max ? row.endDate : max), "0000");
    const holidays = await loadHolidays(ctx, from, to);
    return rows
      .map((row) => ({ ...row, days: absenceWorkingDays(row, schedules, holidays) }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const request = userMutation({
  args: {
    userId: v.optional(v.id("users")),
    type: timeAbsenceTypeValidator,
    startDate: v.string(),
    endDate: v.string(),
    halfDayStart: v.boolean(),
    halfDayEnd: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subject = subjectFor(ctx.caller, args.userId);
    if (!isIsoDate(args.startDate) || !isIsoDate(args.endDate) || args.endDate < args.startDate) {
      throw timeError("bad_request", "invalid_range", "Bad date range");
    }
    if (args.endDate > addDays(args.startDate, 366)) {
      throw timeError("bad_request", "invalid_range", "At most one year at a time");
    }
    await assertDatesOpen(ctx, datesOfRange(args.startDate, args.endDate));
    const existing = await loadAbsences(ctx, subject);
    const clash = existing.some(
      (row) =>
        (row.status === "pending" || row.status === "approved") &&
        row.startDate <= args.endDate &&
        row.endDate >= args.startDate,
    );
    if (clash) throw timeError("conflict", "overlap", "Overlaps another absence");

    const single = args.startDate === args.endDate;
    // One day is one half at most, whichever box was ticked.
    const halfDayStart = single ? args.halfDayStart || args.halfDayEnd : args.halfDayStart;
    const halfDayEnd = single ? false : args.halfDayEnd;
    if (args.type === "vacation") {
      const [schedules, holidays] = await Promise.all([
        loadSchedules(ctx, subject),
        loadHolidays(ctx, args.startDate, args.endDate),
      ]);
      const days = absenceWorkingDays({ ...args, halfDayStart, halfDayEnd }, schedules, holidays);
      if (days === 0) throw timeError("bad_request", "no_working_days", "No working days");
    }

    const now = Date.now();
    const autoApproved = args.type === "sick" || ctx.caller.isAdmin;
    const row = {
      userId: subject,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      halfDayStart,
      halfDayEnd,
      status: autoApproved ? ("approved" as const) : ("pending" as const),
      note: args.note?.trim() || undefined,
      createdBy: ctx.caller.id,
      decidedBy: autoApproved && ctx.caller.isAdmin ? ctx.caller.id : undefined,
      decidedAt: autoApproved ? now : undefined,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeAbsences", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: subject,
      entity: "absence",
      entityId: id,
      action: autoApproved ? "createApproved" : "request",
      after: row,
    });
    if (autoApproved)
      await invalidateTotals(ctx, subject, datesOfRange(row.startDate, row.endDate));

    const subjectUser = subject === ctx.caller.id ? ctx.caller.user : await ctx.db.get(subject);
    if (args.type === "sick" || !autoApproved) {
      await notifyAdmins(
        ctx,
        {
          type: "absence_request",
          title:
            args.type === "sick"
              ? "Krankmeldung eingetragen"
              : `Neuer Antrag: ${TYPE_LABEL[args.type]}`,
          body: `${displayName(subjectUser)} · ${formatRange(row.startDate, row.endDate)}`,
          link: "/zeiterfassung/admin",
        },
        ctx.caller.id,
      );
    }
    return id;
  },
});

/** Withdraw a request still waiting for a decision. Admins can also cancel an
 *  approved absence. */
export const cancel = userMutation({
  args: { id: v.id("timeAbsences"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const row = await ctx.db.get(id);
    if (!row) throw timeError("conflict", "not_pending", "Absence not found");
    subjectFor(ctx.caller, row.userId);
    const cancellable =
      row.status === "pending" || (ctx.caller.isAdmin && row.status === "approved");
    if (!cancellable) throw timeError("conflict", "not_pending", "Can't be cancelled anymore");
    await assertDatesOpen(ctx, datesOfRange(row.startDate, row.endDate));
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "cancelled", updatedAt: now });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: row.userId,
      entity: "absence",
      entityId: row._id,
      action: "cancel",
      before: row,
      after: { ...row, status: "cancelled", updatedAt: now },
      reason: reason?.trim() || undefined,
    });
    if (row.status === "approved") {
      await invalidateTotals(ctx, row.userId, datesOfRange(row.startDate, row.endDate));
      if (row.userId !== ctx.caller.id) {
        await createNotification(ctx, {
          userId: row.userId,
          type: "absence_decision",
          title: `${TYPE_LABEL[row.type]} storniert`,
          body: formatRange(row.startDate, row.endDate),
          link: LINK,
        });
      }
    }
  },
});

export const decide = userMutation({
  role: "admin",
  args: { id: v.id("timeAbsences"), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, { id, approve, note }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "pending") {
      throw timeError("conflict", "not_pending", "Not waiting for a decision");
    }
    await assertDatesOpen(ctx, datesOfRange(row.startDate, row.endDate));
    const now = Date.now();
    const decided = {
      status: approve ? ("approved" as const) : ("rejected" as const),
      decidedBy: ctx.caller.id,
      decidedAt: now,
      decisionNote: note?.trim() || undefined,
      updatedAt: now,
    };
    await ctx.db.patch(row._id, decided);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: row.userId,
      entity: "absence",
      entityId: row._id,
      action: approve ? "approve" : "reject",
      before: row,
      after: { ...row, ...decided },
      reason: decided.decisionNote,
    });
    if (approve) await invalidateTotals(ctx, row.userId, datesOfRange(row.startDate, row.endDate));
    await createNotification(ctx, {
      userId: row.userId,
      type: "absence_decision",
      title: `${TYPE_LABEL[row.type]} ${approve ? "genehmigt" : "abgelehnt"}`,
      body: [formatRange(row.startDate, row.endDate), decided.decisionNote]
        .filter(Boolean)
        .join(" · "),
      link: LINK,
    });
  },
});

/**
 * The team calendar for a range: everyone's approved vacation, your own
 * absences of every type, and the holidays. Sick days, special leave and
 * other absences of others never leave the server — admins see those in the
 * admin area.
 */
export const calendar = userQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    if (!isIsoDate(from) || !isIsoDate(to) || to < from || to > addDays(from, 92)) {
      throw timeError("bad_request", "invalid_range", "Bad range");
    }
    const rows = await ctx.db
      .query("timeAbsences")
      .withIndex("by_end", (q) => q.gte("endDate", from))
      .collect();
    const visible = rows.filter(
      (row) =>
        row.startDate <= to &&
        (row.userId === ctx.caller.id
          ? row.status === "approved" || row.status === "pending"
          : row.status === "approved" && row.type === "vacation"),
    );
    const userIds = [...new Set(visible.map((row) => row.userId))];
    const users = new Map(
      (await Promise.all(userIds.map((userId) => ctx.db.get(userId))))
        .filter((user) => user !== null && user.status !== "removed")
        .map((user) => [user!._id, user!]),
    );
    const holidays = await loadHolidays(ctx, from, to);
    return {
      absences: visible
        .filter((row) => users.has(row.userId))
        .map((row) => ({
          _id: row._id,
          userId: row.userId,
          userName: displayName(users.get(row.userId)!),
          type: row.type,
          status: row.status,
          startDate: row.startDate,
          endDate: row.endDate,
          halfDayStart: row.halfDayStart,
          halfDayEnd: row.halfDayEnd,
          mine: row.userId === ctx.caller.id,
        })),
      holidays: holidays.map(({ date, name, fraction }) => ({ date, name, fraction })),
    };
  },
});
