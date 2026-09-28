import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { type QueryCtx } from "../_generated/server";
import { internalMutation, userMutation, userQuery } from "../functions";

/**
 * The inbox's housekeeping: answered inquiries the customer never came back
 * to are closed after a while, so "Answered" means "waiting on the customer"
 * and not "everything we ever replied to". See docs/inquiries.md.
 */

const inbox = { can: "manage_inquiries" } as const;

export const DEFAULT_AUTO_CLOSE_DAYS = 14;
export const MAX_AUTO_CLOSE_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;
const BATCH = 100;

async function autoCloseDays(ctx: QueryCtx) {
  const row = await ctx.db.query("inquirySettings").first();
  return row?.autoCloseDays ?? DEFAULT_AUTO_CLOSE_DAYS;
}

export const settings = userQuery({
  ...inbox,
  args: {},
  handler: async (ctx) => ({ autoCloseDays: await autoCloseDays(ctx) }),
});

export const setAutoCloseDays = userMutation({
  ...inbox,
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    if (!Number.isInteger(days) || days < 0 || days > MAX_AUTO_CLOSE_DAYS) {
      throw new ConvexError({ code: "invalid", message: "Days out of range" });
    }
    const row = await ctx.db.query("inquirySettings").first();
    const fields = {
      autoCloseDays: days,
      updatedByUserId: ctx.caller.user._id,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("inquirySettings", fields);
  },
});

/**
 * Closes answered inquiries nobody has touched for `autoCloseDays`. Quietly:
 * no mail, and the customer can still reply, which opens it again. Daily cron.
 */
export const autoClose = internalMutation({
  args: {},
  handler: async (ctx) => {
    const days = await autoCloseDays(ctx);
    if (days === 0) return { closed: 0 };
    const now = Date.now();
    const stale = await ctx.db
      .query("emails")
      .withIndex("by_state_lastActivityAt", (q) =>
        q.eq("state", "answered").lt("lastActivityAt", now - days * DAY),
      )
      .take(BATCH);

    for (const row of stale) {
      await ctx.db.patch(row._id, { state: "closed", closedAt: now, lastActivityAt: now });
      await ctx.db.insert("inquiryEvents", {
        inquiryId: row._id,
        type: "state",
        state: "closed",
        actor: "system",
        at: now,
      });
    }
    if (stale.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.marketing.automation.autoClose, {});
    }
    return { closed: stale.length };
  },
});
