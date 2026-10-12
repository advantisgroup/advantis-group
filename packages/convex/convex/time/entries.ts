import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { assertTimeAccess, assertTimeWrite } from "./lib/mode";
import { createNotification } from "../lib/notify";
import { timeEntryKindValidator } from "../tables/time";
import { addDays, berlinDate, isIsoDate, monthsBetween } from "./lib/berlin";
import { isMonthLocked } from "./lib/lock";
import {
  assertDatesOpen,
  dayInputs,
  displayName,
  formatDate,
  invalidateTotals,
  isActive,
  isApproved,
  lockRow,
  notifyAdmins,
  subjectFor,
  timeError,
  writeAudit,
} from "./lib/store";

const HOUR = 3_600_000;
const MAX_SEGMENT = 16 * HOUR;
/** A little slack so "until now" from a browser clock a bit ahead still saves. */
const FUTURE_SLACK = 5 * 60_000;

/**
 * Booked time: the list for a range, and manual changes. An admin's change
 * applies at once; anyone else's becomes a correction request an admin
 * approves. The replaced entry is never touched beyond its status, so the
 * original stays readable next to the audit row.
 */

/** Everything the Arbeitszeiten list needs for a range. Day totals and
 *  warnings are computed by the caller with the shared `time/lib` functions,
 *  so a running entry keeps counting up without re-querying. */
export const range = userQuery({
  args: { userId: v.optional(v.id("users")), from: v.string(), to: v.string() },
  handler: async (ctx, { userId, from, to }) => {
    assertTimeAccess(ctx);
    const subject = subjectFor(ctx.caller, userId);
    if (!isIsoDate(from) || !isIsoDate(to) || to < from || to > addDays(from, 62)) {
      throw timeError("bad_request", "invalid_range", "Bad range");
    }
    const input = await dayInputs(ctx, subject, from, to);
    const now = Date.now();
    const months = await Promise.all(
      monthsBetween(from, to).map(async (month) => ({
        month,
        locked: isMonthLocked(month, now, await lockRow(ctx, month)),
      })),
    );
    return {
      entries: input.entries
        .filter((row) => row.status !== "deleted")
        .sort((a, b) => a.start - b.start),
      schedules: input.schedules.map(({ validFrom, minutesPerWeekday }) => ({
        validFrom,
        minutesPerWeekday,
      })),
      holidays: input.holidays.map(({ date, name, fraction }) => ({ date, name, fraction })),
      absences: input.absences
        .filter(isApproved)
        .filter((row) => row.endDate >= from && row.startDate <= to)
        .map(({ _id, type, startDate, endDate, halfDayStart, halfDayEnd }) => ({
          _id,
          type,
          startDate,
          endDate,
          halfDayStart,
          halfDayEnd,
        })),
      months,
    };
  },
});

function validateSpan(start: number, end: number) {
  if (!(end > start) || end - start > MAX_SEGMENT) {
    throw timeError("bad_request", "invalid_range", "End must be after start, at most 16 h");
  }
  if (end > Date.now() + FUTURE_SLACK) {
    throw timeError("bad_request", "in_future", "Can't book time in the future");
  }
}

async function assertNoOverlap(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: "work" | "break",
  start: number,
  end: number,
  ignore: Id<"timeEntries"> | undefined,
) {
  const nearby = await ctx.db
    .query("timeEntries")
    .withIndex("by_user_start", (q) =>
      q
        .eq("userId", userId)
        .gt("start", start - MAX_SEGMENT)
        .lt("start", end),
    )
    .collect();
  const clash = nearby.some(
    (row) =>
      row._id !== ignore &&
      row.kind === kind &&
      isActive(row) &&
      (row.end ?? Number.POSITIVE_INFINITY) > start,
  );
  if (clash) throw timeError("conflict", "overlap", "Overlaps another entry");
}

async function loadOwnEntry(ctx: MutationCtx, userId: Id<"users">, id: Id<"timeEntries">) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId || !isActive(row)) {
    throw timeError("conflict", "changed_meanwhile", "Entry not found");
  }
  if (row.end === undefined) {
    throw timeError("conflict", "running_entry", "Stop the running entry first");
  }
  return row;
}

async function hasPendingFor(ctx: MutationCtx, id: Id<"timeEntries">) {
  const pending = await ctx.db
    .query("timeEntries")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .collect();
  return pending.some((row) => row.correctionOf === id);
}

function entryLink(date: string) {
  return `/zeiterfassung/arbeitszeiten?date=${date}`;
}

/**
 * Add or change a closed entry. Admins change it directly (for anyone);
 * everyone else files a correction request for their own time.
 */
export const save = userMutation({
  args: {
    userId: v.optional(v.id("users")),
    entryId: v.optional(v.id("timeEntries")),
    kind: timeEntryKindValidator,
    start: v.number(),
    end: v.number(),
    note: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertTimeWrite(ctx);
    const subject = subjectFor(ctx.caller, args.userId);
    validateSpan(args.start, args.end);
    const original = args.entryId ? await loadOwnEntry(ctx, subject, args.entryId) : null;
    const dates = [berlinDate(args.start), ...(original ? [berlinDate(original.start)] : [])];
    await assertDatesOpen(ctx, dates);
    await assertNoOverlap(ctx, subject, args.kind, args.start, args.end, original?._id);
    const now = Date.now();
    const note = args.note?.trim() || undefined;
    const reason = args.reason?.trim() || undefined;

    if (ctx.caller.isAdmin) {
      if (original) await ctx.db.patch(original._id, { status: "deleted", updatedAt: now });
      const row = {
        userId: subject,
        kind: args.kind,
        start: args.start,
        end: args.end,
        source: "manual" as const,
        status: "active" as const,
        note,
        correctionOf: original?._id,
        createdBy: ctx.caller.id,
        updatedAt: now,
      };
      const id = await ctx.db.insert("timeEntries", row);
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: subject,
        entity: "entry",
        entityId: id,
        action: original ? "update" : "create",
        before: original ?? undefined,
        after: row,
        reason,
      });
      await invalidateTotals(ctx, subject, dates);
      return { id, applied: true };
    }

    if (original && (await hasPendingFor(ctx, original._id))) {
      throw timeError("conflict", "already_pending", "A correction is already waiting");
    }
    const row = {
      userId: subject,
      kind: args.kind,
      start: args.start,
      end: args.end,
      source: "manual" as const,
      status: "pending" as const,
      note,
      correctionOf: original?._id,
      correctionAction: original ? ("edit" as const) : ("add" as const),
      reason,
      createdBy: ctx.caller.id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeEntries", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: subject,
      entity: "entry",
      entityId: id,
      action: "requestCorrection",
      before: original ?? undefined,
      after: row,
      reason,
    });
    await notifyAdmins(
      ctx,
      {
        type: "time_correction",
        title: "Neue Korrektur der Arbeitszeit",
        body: `${displayName(ctx.caller.user)} · ${formatDate(berlinDate(args.start))}`,
        link: "/zeiterfassung/admin",
      },
      ctx.caller.id,
    );
    return { id, applied: false };
  },
});

/**
 * Earlier start for a work entry that is still running — someone was there
 * before they clocked in. Same Berlin day, in the past, no overlap with other
 * work that day. Admins change it directly (for anyone); everyone else files
 * a request for their own entry, applied when an admin approves it.
 */
export const setRunningStart = userMutation({
  args: { entryId: v.id("timeEntries"), start: v.number(), reason: v.optional(v.string()) },
  handler: async (ctx, { entryId, start, reason: rawReason }) => {
    await assertTimeWrite(ctx);
    const row = await ctx.db.get(entryId);
    if (!row || !isActive(row) || row.end !== undefined || row.kind !== "work") {
      throw timeError("conflict", "changed_meanwhile", "No running work entry");
    }
    if (!ctx.caller.isAdmin && row.userId !== ctx.caller.id) {
      throw timeError("conflict", "changed_meanwhile", "No running work entry");
    }
    const now = Date.now();
    if (!Number.isFinite(start) || start >= now || berlinDate(start) !== berlinDate(row.start)) {
      throw timeError("bad_request", "invalid_range", "Start must be earlier today");
    }
    await assertDatesOpen(ctx, [berlinDate(start)]);
    await assertStartFree(ctx, row, start);
    const reason = rawReason?.trim() || undefined;

    if (ctx.caller.isAdmin) {
      const patch = { start, updatedAt: now };
      await ctx.db.patch(row._id, patch);
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: row.userId,
        entity: "entry",
        entityId: row._id,
        action: "setRunningStart",
        before: row,
        after: { ...row, ...patch },
        reason,
      });
      await invalidateTotals(ctx, row.userId, [berlinDate(start)]);
      return { applied: true };
    }

    if (await hasPendingFor(ctx, row._id)) {
      throw timeError("conflict", "already_pending", "A correction is already waiting");
    }
    const request = {
      userId: row.userId,
      kind: "work" as const,
      start,
      source: "manual" as const,
      status: "pending" as const,
      correctionOf: row._id,
      correctionAction: "start" as const,
      reason,
      createdBy: ctx.caller.id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeEntries", request);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: row.userId,
      entity: "entry",
      entityId: id,
      action: "requestCorrection",
      before: row,
      after: request,
      reason,
    });
    await notifyAdmins(
      ctx,
      {
        type: "time_correction",
        title: "Früherer Arbeitsbeginn beantragt",
        body: `${displayName(ctx.caller.user)} · ${formatDate(berlinDate(start))}`,
        link: "/zeiterfassung/admin?section=approvals",
      },
      ctx.caller.id,
    );
    return { applied: false };
  },
});

/** No other work of the same day may lie between the new and the old start. */
async function assertStartFree(ctx: MutationCtx, row: Doc<"timeEntries">, start: number) {
  const date = berlinDate(start);
  const others = (await dayInputs(ctx, row.userId, date, date)).entries;
  const clash = others.some(
    (other) =>
      other._id !== row._id &&
      other.kind === "work" &&
      isActive(other) &&
      (other.end ?? Number.POSITIVE_INFINITY) > start &&
      other.start < row.start,
  );
  if (clash) throw timeError("conflict", "overlap", "Overlaps another entry");
}

/** Remove a closed entry — directly for admins, as a request for everyone else. */
export const remove = userMutation({
  args: { entryId: v.id("timeEntries"), reason: v.optional(v.string()) },
  handler: async (ctx, { entryId, reason: rawReason }) => {
    await assertTimeWrite(ctx);
    const existing = await ctx.db.get(entryId);
    if (!existing) throw timeError("conflict", "changed_meanwhile", "Entry not found");
    const subject = subjectFor(ctx.caller, existing.userId);
    const original = await loadOwnEntry(ctx, subject, entryId);
    const dates = [berlinDate(original.start)];
    await assertDatesOpen(ctx, dates);
    const now = Date.now();
    const reason = rawReason?.trim() || undefined;

    if (ctx.caller.isAdmin) {
      await ctx.db.patch(original._id, { status: "deleted", updatedAt: now });
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: subject,
        entity: "entry",
        entityId: original._id,
        action: "delete",
        before: original,
        after: { ...original, status: "deleted", updatedAt: now },
        reason,
      });
      await invalidateTotals(ctx, subject, dates);
      return { applied: true };
    }

    if (await hasPendingFor(ctx, original._id)) {
      throw timeError("conflict", "already_pending", "A correction is already waiting");
    }
    const row = {
      userId: subject,
      kind: original.kind,
      start: original.start,
      end: original.end,
      source: "manual" as const,
      status: "pending" as const,
      note: original.note,
      correctionOf: original._id,
      correctionAction: "delete" as const,
      reason,
      createdBy: ctx.caller.id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeEntries", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: subject,
      entity: "entry",
      entityId: id,
      action: "requestCorrection",
      before: original,
      after: row,
      reason,
    });
    await notifyAdmins(
      ctx,
      {
        type: "time_correction",
        title: "Neue Korrektur der Arbeitszeit",
        body: `${displayName(ctx.caller.user)} · ${formatDate(dates[0])}`,
        link: "/zeiterfassung/admin",
      },
      ctx.caller.id,
    );
    return { applied: false };
  },
});

/** Withdraw your own correction request while it's still waiting. */
export const withdraw = userMutation({
  args: { entryId: v.id("timeEntries") },
  handler: async (ctx, { entryId }) => {
    await assertTimeWrite(ctx);
    const row = await ctx.db.get(entryId);
    if (!row || row.status !== "pending") {
      throw timeError("conflict", "not_pending", "Not a pending correction");
    }
    subjectFor(ctx.caller, row.userId);
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "deleted", updatedAt: now });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: row.userId,
      entity: "entry",
      entityId: row._id,
      action: "withdrawCorrection",
      before: row,
      after: { ...row, status: "deleted", updatedAt: now },
    });
  },
});

async function applyCorrection(ctx: MutationCtx, request: Doc<"timeEntries">, now: number) {
  const original = request.correctionOf ? await ctx.db.get(request.correctionOf) : null;
  if (request.correctionAction !== "add") {
    if (!original || !isActive(original)) {
      throw timeError("conflict", "changed_meanwhile", "The entry changed in the meantime");
    }
    await ctx.db.patch(original._id, { status: "deleted", updatedAt: now });
  }
  if (request.correctionAction !== "delete") {
    await assertNoOverlap(
      ctx,
      request.userId,
      request.kind,
      request.start,
      request.end ?? request.start,
      original?._id,
    );
  }
  return original;
}

/** Approve or reject a correction request. Approving applies it. */
export const decide = userMutation({
  role: "admin",
  args: {
    entryId: v.id("timeEntries"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { entryId, approve, note: rawNote }) => {
    await assertTimeWrite(ctx);
    const request = await ctx.db.get(entryId);
    if (!request || request.status !== "pending") {
      throw timeError("conflict", "not_pending", "Not a pending correction");
    }
    const now = Date.now();
    const original = request.correctionOf ? await ctx.db.get(request.correctionOf) : null;
    const dates = [berlinDate(request.start), ...(original ? [berlinDate(original.start)] : [])];
    await assertDatesOpen(ctx, dates);
    const decisionNote = rawNote?.trim() || undefined;
    if (request.correctionAction === "start") {
      // Earlier start for a (possibly still) running entry: move the
      // original's start; the request itself is only the record.
      if (approve) {
        if (!original || !isActive(original) || original.kind !== "work") {
          throw timeError("conflict", "changed_meanwhile", "The entry changed in the meantime");
        }
        await assertStartFree(ctx, original, request.start);
        await ctx.db.patch(original._id, { start: request.start, updatedAt: now });
      }
      const decidedStart = {
        status: approve ? ("deleted" as const) : ("rejected" as const),
        decidedBy: ctx.caller.id,
        decidedAt: now,
        decisionNote,
        updatedAt: now,
      };
      await ctx.db.patch(request._id, decidedStart);
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: request.userId,
        entity: "entry",
        entityId: request._id,
        action: approve ? "approveCorrection" : "rejectCorrection",
        before: { request, original },
        after: { ...request, ...decidedStart },
        reason: decisionNote,
      });
      if (approve) await invalidateTotals(ctx, request.userId, dates);
      const startDate = berlinDate(request.start);
      await createNotification(ctx, {
        userId: request.userId,
        type: "time_decision",
        title: approve ? "Früherer Beginn übernommen" : "Früherer Beginn abgelehnt",
        body: [formatDate(startDate), decisionNote].filter(Boolean).join(" · "),
        link: entryLink(startDate),
      });
      return;
    }
    const status = !approve
      ? ("rejected" as const)
      : request.correctionAction === "delete"
        ? ("deleted" as const)
        : ("active" as const);
    if (approve) await applyCorrection(ctx, request, now);
    const decided = {
      status,
      decidedBy: ctx.caller.id,
      decidedAt: now,
      decisionNote,
      updatedAt: now,
    };
    await ctx.db.patch(request._id, decided);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: request.userId,
      entity: "entry",
      entityId: request._id,
      action: approve ? "approveCorrection" : "rejectCorrection",
      before: { request, original },
      after: { ...request, ...decided },
      reason: decisionNote,
    });
    if (approve) await invalidateTotals(ctx, request.userId, dates);
    const date = berlinDate(request.start);
    await createNotification(ctx, {
      userId: request.userId,
      type: "time_decision",
      title: approve ? "Korrektur übernommen" : "Korrektur abgelehnt",
      body: [formatDate(date), decisionNote].filter(Boolean).join(" · "),
      link: entryLink(date),
    });
  },
});

/** Your waiting correction requests (or someone's, for an admin). */
export const pendingFor = userQuery({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    assertTimeAccess(ctx);
    const subject = subjectFor(ctx.caller, userId);
    const pending = await ctx.db
      .query("timeEntries")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.filter((row) => row.userId === subject).sort((a, b) => a.start - b.start);
  },
});
