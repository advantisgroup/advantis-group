import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { createNotification, notifyUsers } from "./lib/notify";

const absenceType = v.union(
  v.literal("vacation"),
  v.literal("sick"),
  v.literal("personal"),
  v.literal("other")
);

function displayName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

/** Approvers for a given employee: their manager, plus all admins. */
async function approverIds(
  ctx: MutationCtx,
  employee: Doc<"users">
): Promise<Id<"users">[]> {
  const ids = new Set<Id<"users">>();
  if (employee.managerId) ids.add(employee.managerId);
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", q => q.eq("role", "admin"))
    .collect();
  for (const a of admins) if (a.status === "active") ids.add(a._id);
  // Fallback: if no manager and no admins, notify all managers.
  if (ids.size === 0) {
    const managers = await ctx.db
      .query("users")
      .withIndex("by_role", q => q.eq("role", "manager"))
      .collect();
    for (const m of managers) if (m.status === "active") ids.add(m._id);
  }
  return [...ids];
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const createRequest = mutation({
  args: {
    type: absenceType,
    startDate: v.string(),
    endDate: v.string(),
    halfDay: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.endDate < args.startDate) {
      throw new ConvexError({
        code: "bad_request",
        message: "End date cannot be before start date",
      });
    }
    const id = await ctx.db.insert("absences", {
      userId: user._id,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      halfDay: args.halfDay,
      reason: args.reason,
      status: "pending",
      source: "intranet",
      createdAt: Date.now(),
    });

    await notifyUsers(ctx, await approverIds(ctx, user), {
      type: "absence_request",
      title: "Absence request",
      body: `${displayName(user)} requested ${args.type} ${args.startDate} – ${args.endDate}`,
      link: "/absences",
    });

    return { id };
  },
});

export const myAbsences = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("absences")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async a => ({
        ...a,
        reviewerName: a.reviewedByUserId
          ? displayName(await ctx.db.get(a.reviewedByUserId))
          : null,
      }))
    );
  },
});

/** Owner edits a still-pending intranet request (Clockodo mirrors are read-only). */
export const updateRequest = mutation({
  args: {
    absenceId: v.id("absences"),
    type: absenceType,
    startDate: v.string(),
    endDate: v.string(),
    halfDay: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { absenceId, ...args }) => {
    const user = await requireUser(ctx);
    const absence = await ctx.db.get(absenceId);
    if (!absence || absence.userId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Absence not found" });
    }
    if (absence.source === "clockodo") {
      throw new ConvexError({
        code: "bad_request",
        message: "This absence is managed in Clockodo and is read-only here",
      });
    }
    if (absence.status !== "pending") {
      throw new ConvexError({
        code: "bad_request",
        message: "Only pending requests can be edited",
      });
    }
    if (args.endDate < args.startDate) {
      throw new ConvexError({
        code: "bad_request",
        message: "End date cannot be before start date",
      });
    }
    await ctx.db.patch(absenceId, args);

    await notifyUsers(ctx, await approverIds(ctx, user), {
      type: "absence_request",
      title: "Absence request updated",
      body: `${displayName(user)} updated their ${args.type} request to ${args.startDate} – ${args.endDate}`,
      link: "/absences",
    });

    return { ok: true };
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
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
    return absences
      .filter(a => a.status === "approved" && a.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5)
      .map(a => ({
        _id: a._id,
        type: a.type,
        startDate: a.startDate,
        endDate: a.endDate,
        halfDay: a.halfDay ?? false,
      }));
  },
});

/** Pending requests this manager/admin may act on. */
export const pendingForApproval = query({
  args: {},
  handler: async ctx => {
    const reviewer = await requireManager(ctx);
    const pending = await ctx.db
      .query("absences")
      .withIndex("by_status", q => q.eq("status", "pending"))
      .collect();

    const withUser = await Promise.all(
      pending.map(async a => {
        const u = await ctx.db.get(a.userId);
        return { absence: a, user: u };
      })
    );

    const visible =
      reviewer.role === "admin"
        ? withUser
        : withUser.filter(row => row.user?.managerId === reviewer._id);

    return visible.map(row => ({
      ...row.absence,
      userName: displayName(row.user),
      userDepartment: row.user?.department ?? null,
    }));
  },
});

async function assertCanReview(
  ctx: MutationCtx,
  reviewer: Doc<"users">,
  absence: Doc<"absences">
) {
  if (absence.source === "clockodo") {
    throw new ConvexError({
      code: "bad_request",
      message: "This absence is managed in Clockodo and is read-only here",
    });
  }
  if (reviewer.role === "admin") return;
  const employee = await ctx.db.get(absence.userId);
  if (!employee || employee.managerId !== reviewer._id) {
    throw new ConvexError({
      code: "forbidden",
      message: "You can only review absences for your direct reports",
    });
  }
}

export const approve = mutation({
  args: { absenceId: v.id("absences"), note: v.optional(v.string()) },
  handler: async (ctx, { absenceId, note }) => {
    const reviewer = await requireManager(ctx);
    const absence = await ctx.db.get(absenceId);
    if (!absence || absence.status !== "pending") {
      throw new ConvexError({
        code: "not_found",
        message: "No pending absence",
      });
    }
    await assertCanReview(ctx, reviewer, absence);
    await ctx.db.patch(absenceId, {
      status: "approved",
      reviewedByUserId: reviewer._id,
      reviewedAt: Date.now(),
      decisionNote: note,
    });
    await createNotification(ctx, {
      userId: absence.userId,
      type: "absence_decision",
      title: "Absence approved",
      body: `Your ${absence.type} (${absence.startDate} – ${absence.endDate}) was approved`,
      link: "/absences",
    });
    await scheduleDecisionEmail(ctx, absence, "approved", note);
    return { ok: true };
  },
});

export const deny = mutation({
  args: { absenceId: v.id("absences"), note: v.optional(v.string()) },
  handler: async (ctx, { absenceId, note }) => {
    const reviewer = await requireManager(ctx);
    const absence = await ctx.db.get(absenceId);
    if (!absence || absence.status !== "pending") {
      throw new ConvexError({
        code: "not_found",
        message: "No pending absence",
      });
    }
    await assertCanReview(ctx, reviewer, absence);
    await ctx.db.patch(absenceId, {
      status: "denied",
      reviewedByUserId: reviewer._id,
      reviewedAt: Date.now(),
      decisionNote: note,
    });
    await createNotification(ctx, {
      userId: absence.userId,
      type: "absence_decision",
      title: "Absence denied",
      body: `Your ${absence.type} (${absence.startDate} – ${absence.endDate}) was denied`,
      link: "/absences",
    });
    await scheduleDecisionEmail(ctx, absence, "denied", note);
    return { ok: true };
  },
});

export const cancel = mutation({
  args: { absenceId: v.id("absences") },
  handler: async (ctx, { absenceId }) => {
    const user = await requireUser(ctx);
    const absence = await ctx.db.get(absenceId);
    if (!absence) {
      throw new ConvexError({
        code: "not_found",
        message: "Absence not found",
      });
    }
    const isOwner = absence.userId === user._id;
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new ConvexError({ code: "forbidden", message: "Not allowed" });
    }
    if (absence.status === "denied" || absence.status === "cancelled") {
      return { ok: false };
    }
    await ctx.db.patch(absenceId, { status: "cancelled" });
    return { ok: true };
  },
});

/** Approved absences overlapping [start, end] for the calendar view. */
export const listForCalendar = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, { start, end }) => {
    await requireUser(ctx);
    const approved = await ctx.db
      .query("absences")
      .withIndex("by_status", q => q.eq("status", "approved"))
      .collect();
    const overlapping = approved.filter(a =>
      rangesOverlap(a.startDate, a.endDate, start, end)
    );
    return Promise.all(
      overlapping.map(async a => {
        const u = await ctx.db.get(a.userId);
        return {
          _id: a._id,
          userId: a.userId,
          userName: displayName(u),
          type: a.type,
          startDate: a.startDate,
          endDate: a.endDate,
          halfDay: a.halfDay ?? false,
        };
      })
    );
  },
});

/** When the hourly Clockodo mirror last reconciled, for the freshness hint. */
export const clockodoSyncStatus = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", q => q.eq("key", "absenceSync.lastRunAt"))
      .unique();
    return { lastRunAt: row ? Number(row.value) : null };
  },
});

/** Schedule the absence-decision email to the requester via the Elysia API. */
async function scheduleDecisionEmail(
  ctx: MutationCtx,
  absence: Doc<"absences">,
  decision: "approved" | "denied",
  note: string | undefined
) {
  const employee = await ctx.db.get(absence.userId);
  if (!employee) return;
  await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
    kind: "absence-decision",
    to: employee.email,
    data: {
      decision,
      type: absence.type,
      startDate: absence.startDate,
      endDate: absence.endDate,
      note: note ?? null,
    },
  });
}
