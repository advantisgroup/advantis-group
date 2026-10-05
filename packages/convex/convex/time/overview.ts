import { v } from "convex/values";

import { userQuery } from "../functions";
import { assertTimeAccess } from "./lib/mode";
import { addDays, berlinInstant, isIsoDate } from "./lib/berlin";
import { hoursAccount, loadAbsences, subjectFor, timeError, vacationFor } from "./lib/store";

/**
 * The numbers on the Übersicht: hours account up to yesterday, this year's
 * vacation, what's waiting for an admin and recent auto-closed entries.
 * `today` comes from the browser (Berlin date) so the result is cacheable
 * for the whole day.
 */
export const summary = userQuery({
  args: { userId: v.optional(v.id("users")), today: v.string() },
  handler: async (ctx, { userId, today }) => {
    assertTimeAccess(ctx);
    const subject = subjectFor(ctx.caller, userId);
    if (!isIsoDate(today)) throw timeError("bad_request", "invalid_range", "Bad date");
    const absences = await loadAbsences(ctx, subject);
    const year = Number(today.slice(0, 4));
    const [balance, vacation, pending, recent] = await Promise.all([
      hoursAccount(ctx, subject, addDays(today, -1)),
      vacationFor(ctx, subject, year, today, absences),
      ctx.db
        .query("timeEntries")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("timeEntries")
        .withIndex("by_user_start", (q) =>
          q.eq("userId", subject).gte("start", berlinInstant(addDays(today, -31))),
        )
        .collect(),
    ]);
    return {
      balance,
      vacation,
      pendingCorrections: pending.filter((row) => row.userId === subject).length,
      pendingAbsences: absences.filter((row) => row.status === "pending").length,
      autoClosed: recent
        .filter((row) => row.autoClosed && row.status === "active")
        .map((row) => ({ _id: row._id, start: row.start, end: row.end ?? null })),
      upcoming: absences
        .filter(
          (row) => row.endDate >= today && (row.status === "approved" || row.status === "pending"),
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 5)
        .map(({ _id, type, status, startDate, endDate, halfDayStart, halfDayEnd }) => ({
          _id,
          type,
          status,
          startDate,
          endDate,
          halfDayStart,
          halfDayEnd,
        })),
    };
  },
});
