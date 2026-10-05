import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { assertTimeAccess } from "./lib/mode";
import { addDays, berlinDate, berlinInstant, isIsoDate } from "./lib/berlin";
import { absenceWorkingDays } from "./lib/days";
import { isValidWeek } from "./lib/schedule";
import { carryOverExpiry } from "./lib/vacation";
import {
  displayName,
  hoursAccount,
  invalidateTotalsFrom,
  loadAbsences,
  loadHolidays,
  loadSchedules,
  openEntries,
  timeError,
  vacationFor,
  writeAudit,
} from "./lib/store";

/** Admin area of Zeiterfassung: everyone's numbers, approvals and settings. */

function person(user: Doc<"users">) {
  return {
    userId: user._id,
    name: displayName(user),
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
  };
}

async function staff(ctx: QueryCtx) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((user) => user.status === "active" && !user.external)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "de"));
}

/** Everyone at a glance: clock status, hours account, vacation left. */
export const people = userQuery({
  role: "admin",
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    assertTimeAccess(ctx);
    if (!isIsoDate(today)) throw timeError("bad_request", "invalid_range", "Bad date");
    const [users, open, pending] = await Promise.all([
      staff(ctx),
      openEntries(ctx),
      ctx.db
        .query("timeEntries")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
    ]);
    const year = Number(today.slice(0, 4));
    const since = berlinInstant(addDays(today, -31));
    return Promise.all(
      users.map(async (user) => {
        const absences = await loadAbsences(ctx, user._id);
        const [balance, vacation, recent] = await Promise.all([
          hoursAccount(ctx, user._id, addDays(today, -1)),
          vacationFor(ctx, user._id, year, today, absences),
          ctx.db
            .query("timeEntries")
            .withIndex("by_user_start", (q) => q.eq("userId", user._id).gte("start", since))
            .collect(),
        ]);
        const mine = open.filter((row) => row.userId === user._id);
        const absentToday = absences.find(
          (row) => row.status === "approved" && row.startDate <= today && row.endDate >= today,
        );
        return {
          ...person(user),
          status: mine.some((row) => row.kind === "work")
            ? mine.some((row) => row.kind === "break")
              ? ("break" as const)
              : ("working" as const)
            : absentToday
              ? ("absent" as const)
              : ("out" as const),
          absentType: absentToday?.type ?? null,
          balanceMinutes: balance.minutes,
          vacationRemaining: vacation.remaining,
          pendingAbsences: absences.filter((row) => row.status === "pending").length,
          pendingCorrections: pending.filter((row) => row.userId === user._id).length,
          autoClosed: recent.filter((row) => row.autoClosed && row.status === "active").length,
        };
      }),
    );
  },
});

/** One person's settings and numbers for the admin detail page. */
export const personDetail = userQuery({
  role: "admin",
  args: { userId: v.id("users"), today: v.string() },
  handler: async (ctx, { userId, today }) => {
    assertTimeAccess(ctx);
    if (!isIsoDate(today)) throw timeError("bad_request", "invalid_range", "Bad date");
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const year = Number(today.slice(0, 4));
    const [schedules, allowances, opening, balance, vacation] = await Promise.all([
      loadSchedules(ctx, userId),
      ctx.db
        .query("vacationAllowances")
        .withIndex("by_user_year", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("timeBalances")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      hoursAccount(ctx, userId, addDays(today, -1)),
      vacationFor(ctx, userId, year, today),
    ]);
    return {
      ...person(user),
      schedules: schedules.sort((a, b) => b.validFrom.localeCompare(a.validFrom)),
      allowances: allowances.sort((a, b) => b.year - a.year),
      opening,
      balance,
      vacation,
    };
  },
});

/** Everything waiting for an admin: absence requests and time corrections. */
export const approvals = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    assertTimeAccess(ctx);
    const [absences, corrections] = await Promise.all([
      ctx.db
        .query("timeAbsences")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("timeEntries")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
    ]);
    const userIds = [...new Set([...absences, ...corrections].map((row) => row.userId))];
    const users = new Map(
      (await Promise.all(userIds.map((id) => ctx.db.get(id))))
        .filter((user): user is Doc<"users"> => user !== null)
        .map((user) => [user._id, user]),
    );
    const absenceRows = await Promise.all(
      absences.map(async (row) => {
        const [schedules, holidays] = await Promise.all([
          loadSchedules(ctx, row.userId),
          loadHolidays(ctx, row.startDate, row.endDate),
        ]);
        const user = users.get(row.userId);
        return {
          ...row,
          days: absenceWorkingDays(row, schedules, holidays),
          person: user ? person(user) : null,
        };
      }),
    );
    const correctionRows = await Promise.all(
      corrections.map(async (row) => {
        const original = row.correctionOf ? await ctx.db.get(row.correctionOf) : null;
        const user = users.get(row.userId);
        return {
          ...row,
          date: berlinDate(row.start),
          original,
          person: user ? person(user) : null,
        };
      }),
    );
    return {
      absences: absenceRows.sort((a, b) => a.startDate.localeCompare(b.startDate)),
      corrections: correctionRows.sort((a, b) => a.start - b.start),
    };
  },
});

export const setSchedule = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    validFrom: v.string(),
    minutesPerWeekday: v.array(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { userId, validFrom, minutesPerWeekday, reason }) => {
    assertTimeAccess(ctx);
    if (!isIsoDate(validFrom) || !isValidWeek(minutesPerWeekday)) {
      throw timeError("bad_request", "invalid_range", "Bad schedule");
    }
    const existing = (await loadSchedules(ctx, userId)).find((row) => row.validFrom === validFrom);
    const row = { userId, validFrom, minutesPerWeekday, updatedAt: Date.now() };
    let id = existing?._id;
    if (id) await ctx.db.replace(id, row);
    else id = await ctx.db.insert("workSchedules", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: userId,
      entity: "schedule",
      entityId: id,
      action: existing ? "update" : "create",
      before: existing ?? undefined,
      after: row,
      reason: reason?.trim() || undefined,
    });
    await invalidateTotalsFrom(ctx, userId, validFrom);
    return id;
  },
});

export const removeSchedule = userMutation({
  role: "admin",
  args: { id: v.id("workSchedules"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    assertTimeAccess(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) return;
    await ctx.db.delete(id);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: existing.userId,
      entity: "schedule",
      entityId: id,
      action: "delete",
      before: existing,
      reason: reason?.trim() || undefined,
    });
    await invalidateTotalsFrom(ctx, existing.userId, existing.validFrom);
  },
});

export const setAllowance = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    year: v.number(),
    days: v.number(),
    carriedOver: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { userId, year, days, carriedOver, reason }) => {
    assertTimeAccess(ctx);
    const valid = (value: number) => Number.isFinite(value) && value >= 0 && value <= 366;
    if (!Number.isInteger(year) || !valid(days) || !valid(carriedOver)) {
      throw timeError("bad_request", "invalid_range", "Bad allowance");
    }
    const existing = await ctx.db
      .query("vacationAllowances")
      .withIndex("by_user_year", (q) => q.eq("userId", userId).eq("year", year))
      .unique();
    const row = {
      userId,
      year,
      days,
      carriedOver,
      carriedOverExpires: existing?.carriedOverExpires ?? carryOverExpiry(year),
      carriedOverExpiredDays: existing?.carriedOverExpiredDays,
      updatedAt: Date.now(),
    };
    let id = existing?._id;
    if (id) await ctx.db.replace(id, row);
    else id = await ctx.db.insert("vacationAllowances", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: userId,
      entity: "allowance",
      entityId: id,
      action: existing ? "update" : "create",
      before: existing ?? undefined,
      after: row,
      reason: reason?.trim() || undefined,
    });
    return id;
  },
});

export const setOpeningBalance = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    openingMinutes: v.number(),
    openingDate: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { userId, openingMinutes, openingDate, reason }) => {
    assertTimeAccess(ctx);
    if (!isIsoDate(openingDate) || !Number.isInteger(openingMinutes)) {
      throw timeError("bad_request", "invalid_range", "Bad opening balance");
    }
    const existing = await ctx.db
      .query("timeBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const row = { userId, openingMinutes, openingDate, updatedAt: Date.now() };
    let id = existing?._id;
    if (id) await ctx.db.replace(id, row);
    else id = await ctx.db.insert("timeBalances", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: userId,
      entity: "balance",
      entityId: id,
      action: existing ? "update" : "create",
      before: existing ?? undefined,
      after: row,
      reason: reason?.trim() || undefined,
    });
    return id;
  },
});

/** Rebuild one person's cached month totals in the background, e.g. after
 *  an import. */
export const recomputeTotals = userMutation({
  role: "admin",
  args: { userId: v.id("users"), from: v.string() },
  handler: async (ctx, { userId, from }) => {
    assertTimeAccess(ctx);
    if (!isIsoDate(from)) throw timeError("bad_request", "invalid_range", "Bad date");
    await invalidateTotalsFrom(ctx, userId, from);
    await ctx.scheduler.runAfter(0, internal.time.jobs.refreshTotalsFrom, { userId, from });
  },
});

/** The newest audit rows, everyone's or one person's. */
export const auditLog = userQuery({
  role: "admin",
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    assertTimeAccess(ctx);
    const take = Math.min(Math.max(limit ?? 100, 1), 300);
    const rows = userId
      ? await ctx.db
          .query("timeAuditLog")
          .withIndex("by_subject_at", (q) => q.eq("subjectUserId", userId))
          .order("desc")
          .take(take)
      : await ctx.db.query("timeAuditLog").withIndex("by_at").order("desc").take(take);
    const ids = [
      ...new Set(
        rows.flatMap((row) => [row.actorId, row.subjectUserId]).filter((id) => id !== undefined),
      ),
    ];
    const names = new Map(
      (await Promise.all(ids.map((id) => ctx.db.get(id))))
        .filter((user): user is Doc<"users"> => user !== null)
        .map((user) => [user._id, displayName(user)]),
    );
    return rows.map((row) => ({
      ...row,
      actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
      subjectName: row.subjectUserId ? (names.get(row.subjectUserId) ?? null) : null,
    }));
  },
});
