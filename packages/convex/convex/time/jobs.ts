import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { internalMutation } from "../functions";
import { createNotification } from "../lib/notify";
import { autoCloseCutoff } from "./lib/autoClose";
import { autoCloseEndFor, recalcAutoClosed } from "./lib/autoCloseDb";
import { addDays, berlinDate, berlinParts, monthOf } from "./lib/berlin";
import { latestLockableMonth, lockBoundary } from "./lib/lock";
import { carryOverExpiry, carryOverFrom, DEFAULT_VACATION_DAYS } from "./lib/vacation";
import { seedHolidays } from "./holidays";
import {
  formatDate,
  invalidateTotals,
  lockRow,
  openEntries,
  storeMonthTotals,
  vacationFor,
  writeAudit,
} from "./lib/store";

/**
 * The scheduled side of Zeiterfassung. Convex crons run on UTC, so every job
 * runs hourly and decides from the Europe/Berlin time whether there is
 * anything to do — CET and CEST both come out right, and a missed run is
 * caught up by the next one. Every job is idempotent.
 */

async function activeUsers(ctx: MutationCtx) {
  const users = await ctx.db.query("users").collect();
  return users.filter((user) => user.status === "active" && !user.external);
}

/** The 18:00 rule for one person's open work entry. */
async function autoCloseEntry(ctx: MutationCtx, work: Doc<"timeEntries">, cutoff: number) {
  const date = berlinDate(work.start);
  const end = await autoCloseEndFor(ctx, work, cutoff);
  const now = Date.now();
  const openBreak = (await openEntries(ctx, work.userId)).find((row) => row.kind === "break");
  // A break still running at 18:00 ends with the work segment.
  const workEnd = openBreak ? Math.max(end, openBreak.start) : end;
  const patch = { end: workEnd, autoClosed: true, source: "auto18" as const, updatedAt: now };
  await ctx.db.patch(work._id, patch);
  await writeAudit(ctx, {
    subjectUserId: work.userId,
    entity: "entry",
    entityId: work._id,
    action: "autoClose",
    before: work,
    after: { ...work, ...patch },
  });
  if (openBreak) {
    const breakPatch = { end: workEnd, autoClosed: true, updatedAt: now };
    await ctx.db.patch(openBreak._id, breakPatch);
    await writeAudit(ctx, {
      subjectUserId: work.userId,
      entity: "entry",
      entityId: openBreak._id,
      action: "autoClose",
      before: openBreak,
      after: { ...openBreak, ...breakPatch },
    });
  }
  await invalidateTotals(ctx, work.userId, [date]);
  await createNotification(ctx, {
    userId: work.userId,
    type: "time_auto_closed",
    title: "Arbeitszeit automatisch beendet",
    body: `Du warst am ${formatDate(date)} um 18:00 Uhr noch eingestempelt. Bitte prüfe das Ende und stelle bei Bedarf eine Korrektur.`,
    link: `/zeiterfassung/arbeitszeiten?date=${date}`,
  });
}

/**
 * One-off repair (run from the Convex dashboard): re-book every untouched
 * 18:00-rule entry with the schedules as they are now. Entries booked before
 * a back-dated schedule existed used the old hours (or the 8 h default).
 */
export const recalcAllAutoClosed = internalMutation({
  args: { fromDate: v.optional(v.string()) },
  handler: async (ctx, { fromDate }) => {
    const users = await activeUsers(ctx);
    let changed = 0;
    for (const user of users) {
      changed += await recalcAutoClosed(ctx, user._id, fromDate ?? "2000-01-01");
    }
    return changed;
  },
});

/** Hourly: close every work entry still open past its 18:00. */
export const autoCloseOpenEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await openEntries(ctx);
    let closed = 0;
    for (const work of open.filter((row) => row.kind === "work")) {
      const cutoff = autoCloseCutoff(work.start);
      if (now < cutoff) continue;
      await autoCloseEntry(ctx, work, cutoff);
      closed += 1;
    }
    // Breaks left open without any work segment around them.
    const stillOpenWork = new Set(
      (await openEntries(ctx)).filter((row) => row.kind === "work").map((row) => row.userId),
    );
    for (const pause of open.filter((row) => row.kind === "break")) {
      if (stillOpenWork.has(pause.userId) || now < autoCloseCutoff(pause.start)) continue;
      const current = await ctx.db.get(pause._id);
      if (!current || current.end !== undefined) continue;
      const patch = { end: pause.start, autoClosed: true, updatedAt: now };
      await ctx.db.patch(pause._id, patch);
      await writeAudit(ctx, {
        subjectUserId: pause.userId,
        entity: "entry",
        entityId: pause._id,
        action: "autoClose",
        before: pause,
        after: { ...pause, ...patch },
      });
    }
    return closed;
  },
});

/**
 * Hourly: lock the month whose 15th-of-next-month boundary has passed (and
 * cache its totals), make sure this year's holidays exist, and from
 * 1 December seed next year's.
 */
export const lockAndSeed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const month = latestLockableMonth(now);
    if (!(await lockRow(ctx, month))) {
      const lockedAt = lockBoundary(month);
      await ctx.db.insert("monthLocks", { month, lockedAt });
      await writeAudit(ctx, {
        entity: "monthLock",
        entityId: month,
        action: "autoLock",
        after: { month, lockedAt },
      });
      await ctx.scheduler.runAfter(0, internal.time.jobs.refreshMonthTotals, { month });
    }
    const { year, month: monthNumber } = berlinParts(now);
    const thisYear = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`))
      .first();
    if (!thisYear) await seedHolidays(ctx, year);
    if (monthNumber === 12) {
      const nextYear = await ctx.db
        .query("holidays")
        .withIndex("by_date", (q) =>
          q.gte("date", `${year + 1}-01-01`).lte("date", `${year + 1}-12-31`),
        )
        .first();
      if (!nextYear) await seedHolidays(ctx, year + 1);
    }
  },
});

/**
 * Hourly: in January, open every active person's vacation account for the new
 * year with what's left of last year carried over; from 1 April, record how
 * many carried-over days lapsed.
 */
export const vacationYear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = berlinDate(now);
    const year = Number(today.slice(0, 4));
    const rows = await ctx.db
      .query("vacationAllowances")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();

    if (today.slice(5, 7) === "01") {
      const have = new Set(rows.map((row) => row.userId));
      for (const user of await activeUsers(ctx)) {
        if (have.has(user._id)) continue;
        const previousRow = await ctx.db
          .query("vacationAllowances")
          .withIndex("by_user_year", (q) => q.eq("userId", user._id).eq("year", year - 1))
          .unique();
        const previous = await vacationFor(ctx, user._id, year - 1, `${year - 1}-12-31`);
        const row = {
          userId: user._id,
          year,
          days: previousRow?.days ?? DEFAULT_VACATION_DAYS,
          carriedOver: carryOverFrom(previous),
          carriedOverExpires: carryOverExpiry(year),
          updatedAt: now,
        };
        const id = await ctx.db.insert("vacationAllowances", row);
        await writeAudit(ctx, {
          subjectUserId: user._id,
          entity: "allowance",
          entityId: id,
          action: "carryOver",
          after: row,
        });
      }
    }

    for (const row of rows) {
      if (row.carriedOverExpiredDays !== undefined || today <= row.carriedOverExpires) continue;
      const summary = await vacationFor(ctx, row.userId, year, today);
      const patch = { carriedOverExpiredDays: summary.carriedOverExpired, updatedAt: now };
      await ctx.db.patch(row._id, patch);
      await writeAudit(ctx, {
        subjectUserId: row.userId,
        entity: "allowance",
        entityId: row._id,
        action: "expireCarryOver",
        before: row,
        after: { ...row, ...patch },
      });
    }
  },
});

/** Cache one full month's totals for everyone active (or one person). */
export const refreshMonthTotals = internalMutation({
  args: { month: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, { month, userId }) => {
    const users = userId ? [userId] : (await activeUsers(ctx)).map((user) => user._id);
    for (const id of users) await storeMonthTotals(ctx, id, month);
  },
});

/** After an import: cache every locked month since `from` for one person, one
 *  month per run so no single transaction reads years of entries. */
export const refreshTotalsFrom = internalMutation({
  args: { userId: v.id("users"), from: v.string() },
  handler: async (ctx, { userId, from }) => {
    const until = latestLockableMonth(Date.now());
    const month = monthOf(from);
    if (month > until) return;
    await storeMonthTotals(ctx, userId, month);
    await ctx.scheduler.runAfter(0, internal.time.jobs.refreshTotalsFrom, {
      userId,
      from: addDays(`${month}-01`, 32).slice(0, 7) + "-01",
    });
  },
});
