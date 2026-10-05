import { v } from "convex/values";

import { internal } from "../_generated/api";
import { userMutation, userQuery } from "../functions";
import { addMonths, berlinParts, isIsoMonth } from "./lib/berlin";
import { isMonthLocked, lockBoundary } from "./lib/lock";
import { invalidateTotals, lockRow, timeError, writeAudit } from "./lib/store";

/** Month locks: automatic on the 15th of the next month; admins can lock
 *  early, and unlock — only with a reason. */

/** The last 18 months and this one, newest first. */
export const list = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const { year, month } = berlinParts(now);
    const current = `${year}-${String(month).padStart(2, "0")}`;
    return Promise.all(
      Array.from({ length: 19 }, (_, index) => addMonths(current, -index)).map(async (m) => {
        const row = await lockRow(ctx, m);
        return {
          month: m,
          locked: isMonthLocked(m, now, row),
          boundary: lockBoundary(m),
          lockedAt: row?.lockedAt ?? null,
          unlockedAt: row?.unlockedAt ?? null,
          reason: row?.reason ?? null,
        };
      }),
    );
  },
});

export const unlock = userMutation({
  role: "admin",
  args: { month: v.string(), reason: v.string() },
  handler: async (ctx, { month, reason: rawReason }) => {
    const reason = rawReason.trim();
    if (!isIsoMonth(month) || !reason) {
      throw timeError("bad_request", "invalid_range", "A month and a reason are required");
    }
    const now = Date.now();
    const existing = await lockRow(ctx, month);
    const patch = { unlockedAt: now, unlockedBy: ctx.caller.id, reason };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("monthLocks", { month, ...patch });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      entity: "monthLock",
      entityId: month,
      action: "unlock",
      before: existing ?? undefined,
      after: { month, ...patch },
      reason,
    });
  },
});

export const lock = userMutation({
  role: "admin",
  args: { month: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { month, reason }) => {
    if (!isIsoMonth(month)) throw timeError("bad_request", "invalid_range", "Bad month");
    const now = Date.now();
    const existing = await lockRow(ctx, month);
    const patch = { lockedAt: now, lockedBy: ctx.caller.id };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("monthLocks", { month, ...patch });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      entity: "monthLock",
      entityId: month,
      action: "lock",
      before: existing ?? undefined,
      after: { month, ...patch },
      reason: reason?.trim() || undefined,
    });
    await invalidateTotals(ctx, null, [`${month}-01`]);
    await ctx.scheduler.runAfter(0, internal.time.jobs.refreshMonthTotals, { month });
  },
});
