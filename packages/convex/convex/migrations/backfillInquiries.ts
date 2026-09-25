/**
 * One-time backfill of the inquiry fields (docs/inquiries.md) onto contact
 * rows written before them: a reference number, lowercased addresses, the
 * callback time as an instant, a topic key, and the starting state. Rows are
 * numbered in the order they were written. Idempotent — a row that already
 * has `nr` is left alone — and it pages through the table by scheduling
 * itself, so it never hits a transaction limit. Run once from the Convex
 * dashboard (`internal.migrations.backfillInquiries.run`) after deploying.
 */
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../functions";
import { assignRef } from "../marketing/inquiries";
import { legacyDesiredAt } from "../marketing/lib/inquiry";

const TOPIC_KEYS = [
  ["withdrawal", /widerruf|withdraw|rétract|retract|撤回/i],
  ["legal", /recht|legal|jurid|法律/i],
  ["question", /frage|question|问题|咨询/i],
] as const;

export const run = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("emails").paginate({ cursor: cursor ?? null, numItems: 200 });
    const last = await ctx.db.query("emails").withIndex("by_nr").order("desc").first();
    let nr = last?.nr ?? 0;
    let migrated = 0;

    for (const row of page.page) {
      if (row.nr !== undefined) continue;
      nr += 1;
      migrated += 1;
      await ctx.db.patch(row._id, {
        nr,
        email: row.email.trim().toLowerCase(),
        accountEmail: row.accountEmail.trim().toLowerCase(),
        lastActivityAt: row.sentAt,
        attempts: 1,
        state: "open",
        desiredAt: legacyDesiredAt(row.desiredDateTime) ?? undefined,
        callbackStatus: row.submissionType === "callback" ? "requested" : undefined,
        topicKey: row.topic
          ? TOPIC_KEYS.find(([, pattern]) => pattern.test(row.topic!))?.[0]
          : undefined,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillInquiries.run, {
        cursor: page.continueCursor,
      });
    }
    return { migrated, done: page.isDone };
  },
});

/**
 * Stores `ref` (the inquiry reference, see `referenceOf`) on inquiries written
 * before it was stored. Oldest first, so where two old ids end the same way
 * the earlier inquiry keeps the six characters it has always shown and the
 * later one takes seven. Idempotent; pages by scheduling itself. Run once
 * from the Convex dashboard (`internal.migrations.backfillInquiries.refs`)
 * after deploying. Until then those inquiries still show and resolve their
 * six-character reference.
 */
export const refs = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("emails").paginate({ cursor: cursor ?? null, numItems: 100 });
    const unstored = await ctx.db
      .query("emails")
      .withIndex("by_ref", (q) => q.eq("ref", undefined))
      .take(2000);

    let assigned = 0;
    for (const row of page.page) {
      if (row.ref !== undefined) continue;
      await assignRef(ctx, row._id, unstored);
      assigned += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillInquiries.refs, {
        cursor: page.continueCursor,
      });
    }
    return { assigned, done: page.isDone };
  },
});
