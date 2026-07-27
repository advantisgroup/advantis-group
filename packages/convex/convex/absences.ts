import { v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUser, requireManager } from "./lib/auth";

function displayName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const myAbsences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("absences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async (a) => ({
        ...a,
        reviewerName: a.reviewedByUserId ? displayName(await ctx.db.get(a.reviewedByUserId)) : null,
      })),
    );
  },
});

/**
 * A user's approved absences that haven't ended yet — surfaced on their
 * profile card so colleagues can see upcoming time off. Approved absences are
 * already public on the shared calendar, so this is readable by any member.
 */
export const upcomingForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const absences = await ctx.db
      .query("absences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return absences
      .filter((a) => a.status === "approved" && a.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5)
      .map((a) => ({
        _id: a._id,
        type: a.type,
        startDate: a.startDate,
        endDate: a.endDate,
        halfDay: a.halfDay ?? false,
      }));
  },
});

/** Approved absences overlapping [start, end] for the calendar view. */
export const listForCalendar = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, { start, end }) => {
    await requireUser(ctx);
    const approved = await ctx.db
      .query("absences")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const overlapping = approved.filter((a) => rangesOverlap(a.startDate, a.endDate, start, end));
    return Promise.all(
      overlapping.map(async (a) => {
        const u = await ctx.db.get(a.userId);
        return {
          _id: a._id,
          userId: a.userId,
          userName: displayName(u),
          userDepartment: u?.department ?? null,
          type: a.type,
          startDate: a.startDate,
          endDate: a.endDate,
          halfDay: a.halfDay ?? false,
        };
      }),
    );
  },
});

/**
 * Pending absence requests awaiting a manager's decision — the overview's
 * admin "quick stats" widget. Managers+ only.
 */
export const pendingForApproval = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
    const rows = await ctx.db
      .query("absences")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return { count: rows.length };
  },
});

/** When the hourly Clockodo mirror last reconciled, for the freshness hint. */
export const clockodoSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", "absenceSync.lastRunAt"))
      .unique();
    return { lastRunAt: row ? Number(row.value) : null };
  },
});
