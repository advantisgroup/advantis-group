import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { internalMutation, userMutation } from "../functions";
import { addDays, berlinDate, datesBetween, monthOf } from "./lib/berlin";
import { targetMinutesOn } from "./lib/days";
import { type AutoBookSettings, autoBookDay, autoBookId, isValidAutoBook } from "./lib/autoBook";
import { assertTimeWrite } from "./lib/mode";
import {
  invalidateTotals,
  isApproved,
  loadAbsences,
  loadEntries,
  loadHolidays,
  loadProfile,
  loadSchedules,
  monthLocked,
  timeError,
  writeAudit,
} from "./lib/store";

/**
 * Fixed hours for people who don't clock (`timeProfiles.autoBook`): the job
 * books every working day once its working time is over, and keeps the
 * bookings in line with later changes (a vacation approved afterwards takes
 * them out again). A day the person recorded anything themselves is left
 * alone. Locked months are only touched by the admin's initial backfill.
 */

/** How far back the hourly job re-checks — covers the open months. */
const RECHECK_DAYS = 45;

interface SyncResult {
  inserted: number;
  updated: number;
  removed: number;
  dates: string[];
}

export async function syncAutoBook(
  ctx: MutationCtx,
  userId: Id<"users">,
  settings: AutoBookSettings,
  range: { from: string; to: string; now: number; respectLocks: boolean },
): Promise<SyncResult> {
  const from = range.from < settings.from ? settings.from : range.from;
  const result: SyncResult = { inserted: 0, updated: 0, removed: 0, dates: [] };
  if (from > range.to) return result;

  const [schedules, holidays, absences, entries] = await Promise.all([
    loadSchedules(ctx, userId),
    loadHolidays(ctx, from, range.to),
    loadAbsences(ctx, userId),
    loadEntries(ctx, userId, from, range.to),
  ]);
  const approved = absences.filter(isApproved);
  const holidayByDate = new Map(holidays.map((row) => [row.date, row]));
  const lockedMonths = new Map<string, boolean>();

  for (const date of datesBetween(from, range.to)) {
    if (range.respectLocks) {
      const month = monthOf(date);
      if (!lockedMonths.has(month)) lockedMonths.set(month, await monthLocked(ctx, month));
      if (lockedMonths.get(month)) continue;
    }
    const ids = {
      work: autoBookId(userId, date, "work"),
      break: autoBookId(userId, date, "break"),
    };
    const dayRows = entries.filter((row) => berlinDateOf(row) === date);
    const own = dayRows.filter(
      (row) =>
        row.status !== "deleted" && row.status !== "rejected" && !row.importId?.startsWith("auto:"),
    );
    const target = targetMinutesOn(
      date,
      schedules,
      holidayByDate.get(date) ?? null,
      approved,
    ).target;
    const planned = own.length > 0 ? [] : autoBookDay(date, target, settings);
    // Today only once the booked day is over.
    if (planned.some((segment) => segment.end > range.now)) continue;

    let changed = false;
    for (const kind of ["work", "break"] as const) {
      const want = planned.find((segment) => segment.kind === kind) ?? null;
      const have = await ctx.db
        .query("timeEntries")
        .withIndex("by_import", (q) => q.eq("importId", ids[kind]))
        .first();
      const now = Date.now();
      if (want && !have) {
        await ctx.db.insert("timeEntries", {
          userId,
          kind,
          start: want.start,
          end: want.end,
          source: "auto",
          status: "active",
          importId: ids[kind],
          updatedAt: now,
        });
        result.inserted += 1;
        changed = true;
      } else if (
        want &&
        have &&
        (have.start !== want.start || have.end !== want.end || have.status !== "active")
      ) {
        await ctx.db.patch(have._id, {
          start: want.start,
          end: want.end,
          status: "active",
          updatedAt: now,
        });
        result.updated += 1;
        changed = true;
      } else if (!want && have && have.status === "active") {
        await ctx.db.patch(have._id, { status: "deleted", updatedAt: now });
        result.removed += 1;
        changed = true;
      }
    }
    if (changed) result.dates.push(date);
  }

  if (result.dates.length > 0) {
    await invalidateTotals(ctx, userId, result.dates);
    await writeAudit(ctx, {
      subjectUserId: userId,
      entity: "entry",
      entityId: `auto:${userId}:${result.dates[0]}..${result.dates.at(-1)}`,
      action: "autoBook",
      after: { ...result, settings },
    });
  }
  return result;
}

function berlinDateOf(row: Doc<"timeEntries">): string {
  return berlinDate(row.start);
}

/**
 * Turn fixed hours on (or change them) for one person, or off with
 * `settings: null`. Turning it on also switches time recording back on and
 * books every working day from `settings.from` up to today — locked months
 * included, as the admin asked for exactly that history.
 */
export const setAutoBook = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    settings: v.union(
      v.object({ from: v.string(), start: v.string(), breakMinutes: v.number() }),
      v.null(),
    ),
  },
  handler: async (ctx, { userId, settings }) => {
    await assertTimeWrite(ctx);
    if (settings && !isValidAutoBook(settings)) {
      throw timeError("bad_request", "invalid_range", "Bad fixed hours");
    }
    const existing = await loadProfile(ctx, userId);
    const row = {
      userId,
      trackingDisabled: settings ? false : (existing?.trackingDisabled ?? false),
      earlyAccessFrom: existing?.earlyAccessFrom,
      autoBook: settings ?? undefined,
      updatedAt: Date.now(),
    };
    let id = existing?._id;
    if (id) await ctx.db.replace(id, row);
    else id = await ctx.db.insert("timeProfiles", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: userId,
      entity: "profile",
      entityId: id,
      action: settings ? "auto_book_on" : "auto_book_off",
      before: existing ?? undefined,
      after: row,
    });
    if (!settings) return { inserted: 0, updated: 0, removed: 0 };
    const now = Date.now();
    const result = await syncAutoBook(ctx, userId, settings, {
      from: settings.from,
      to: berlinDate(now),
      now,
      respectLocks: false,
    });
    await ctx.scheduler.runAfter(0, internal.time.jobs.refreshTotalsFrom, {
      userId,
      from: `${monthOf(settings.from)}-01`,
    });
    return { inserted: result.inserted, updated: result.updated, removed: result.removed };
  },
});

/** Hourly: book the days that are over, re-check the open recent ones. */
export const bookFixedHours = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = berlinDate(now);
    const profiles = (await ctx.db.query("timeProfiles").collect()).filter(
      (row) => row.autoBook !== undefined,
    );
    let booked = 0;
    for (const profile of profiles) {
      const user = await ctx.db.get(profile.userId);
      if (!user || user.status !== "active") continue;
      const result = await syncAutoBook(ctx, profile.userId, profile.autoBook!, {
        from: addDays(today, -RECHECK_DAYS),
        to: today,
        now,
        respectLocks: true,
      });
      booked += result.inserted + result.updated + result.removed;
    }
    return booked;
  },
});
