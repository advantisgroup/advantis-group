import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { userQuery } from "../functions";
import { median, referenceOf } from "./lib/inquiry";

/**
 * The numbers behind `/inquiries/stats`: how many came in and were closed,
 * how fast the first answer went out, how long until closed, split by type,
 * assignee and tag, against the period before. See docs/inquiries.md.
 *
 * Inquiries merged into another count once, as the one they went into.
 */

const DAY = 24 * 60 * 60 * 1000;
// a website inbox sees a few a day; this is years of them
const SCAN = 5000;

type Row = Doc<"emails">;

const received = (row: Row, from: number, to: number) =>
  !row.mergedIntoId && row.sentAt >= from && row.sentAt < to;
const closedIn = (row: Row, from: number, to: number) =>
  !row.mergedIntoId &&
  row.state === "closed" &&
  row.closedAt !== undefined &&
  row.closedAt >= from &&
  row.closedAt < to;
const firstResponse = (row: Row) =>
  row.firstResponseAt !== undefined ? row.firstResponseAt - row.sentAt : undefined;
const defined = <T>(values: (T | undefined)[]) => values.filter((x): x is T => x !== undefined);

export const overview = userQuery({
  can: "manage_inquiries",
  args: {
    days: v.number(),
    /** "Now", rounded by the browser so the read range doesn't move on every render. */
    until: v.number(),
    /** The browser's `getTimezoneOffset()`, so days and weeks start at its midnight. */
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, { days: requested, until, tzOffsetMinutes }) => {
    const days = Math.min(Math.max(Math.round(requested), 7), 366);
    const offset = tzOffsetMinutes * 60 * 1000;
    const midnight = (at: number) => Math.floor((at - offset) / DAY) * DAY + offset;
    const end = midnight(until) + DAY;
    const start = end - days * DAY;
    const previousStart = start - days * DAY;

    // anything created or closed since previousStart has lastActivityAt after it
    const rows = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt", (q) => q.gte("lastActivityAt", previousStart))
      .order("desc")
      .take(SCAN);

    const now = rows.filter((row) => received(row, start, end));
    const before = rows.filter((row) => received(row, previousStart, start));
    const closedNow = rows.filter((row) => closedIn(row, start, end));
    const closedBefore = rows.filter((row) => closedIn(row, previousStart, start));

    // --- over time: days for a month, weeks beyond that, ending today
    const bucket = days <= 31 ? DAY : 7 * DAY;
    const buckets = Math.ceil((days * DAY) / bucket);
    const series = Array.from({ length: buckets }, (_, i) => {
      const to = end - (buckets - 1 - i) * bucket;
      const from = Math.max(to - bucket, start);
      return {
        from,
        received: now.filter((row) => row.sentAt >= from && row.sentAt < to).length,
        closed: closedNow.filter((row) => row.closedAt! >= from && row.closedAt! < to).length,
      };
    });

    // --- by type
    const byType = (["message", "callback", "other"] as const).map((type) => {
      const ofType = now.filter((row) => row.submissionType === type);
      return {
        type,
        count: ofType.length,
        medianFirstResponseMs: median(defined(ofType.map(firstResponse))),
      };
    });

    // --- by assignee
    const groups = new Map<Id<"users"> | "none", Row[]>();
    for (const row of now) {
      const key = row.assignedToUserId ?? "none";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const byAssignee = await Promise.all(
      [...groups].map(async ([key, group]) => {
        const user = key === "none" ? null : await ctx.db.get(key);
        return {
          userId: key === "none" ? undefined : key,
          name: user
            ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
            : undefined,
          count: group.length,
          answered: group.filter((row) => row.firstResponseAt !== undefined).length,
          medianFirstResponseMs: median(defined(group.map(firstResponse))),
        };
      }),
    );
    byAssignee.sort((a, b) => b.count - a.count);

    // --- tags
    const tagCounts = new Map<string, number>();
    for (const row of now) {
      for (const tag of row.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    // --- what customers said about the answers (rated in this period)
    const rated = rows.filter(
      (row) =>
        !row.mergedIntoId && row.ratedAt !== undefined && row.ratedAt >= start && row.ratedAt < end,
    );
    const satisfaction = {
      helpful: rated.filter((row) => row.rating === "helpful").length,
      notHelpful: rated.filter((row) => row.rating === "not_helpful").length,
      recentUnhelpful: rated
        .filter((row) => row.rating === "not_helpful")
        .sort((a, b) => b.ratedAt! - a.ratedAt!)
        .slice(0, 5)
        .map((row) => ({
          id: row._id,
          reference: referenceOf(row),
          comment: row.ratingComment,
          ratedAt: row.ratedAt!,
        })),
    };

    return {
      days,
      start,
      end,
      bucket: bucket === DAY ? ("day" as const) : ("week" as const),
      truncated: rows.length === SCAN,
      totals: {
        received: now.length,
        receivedBefore: before.length,
        closed: closedNow.length,
        closedBefore: closedBefore.length,
        withdrawn: now.filter((row) => row.state === "withdrawn").length,
        unanswered: now.filter(
          (row) => row.firstResponseAt === undefined && row.state !== "withdrawn",
        ).length,
        medianFirstResponseMs: median(defined(now.map(firstResponse))),
        medianFirstResponseBeforeMs: median(defined(before.map(firstResponse))),
        medianTimeToCloseMs: median(closedNow.map((row) => row.closedAt! - row.sentAt)),
        medianTimeToCloseBeforeMs: median(closedBefore.map((row) => row.closedAt! - row.sentAt)),
      },
      series,
      satisfaction,
      byType,
      byAssignee,
      tags: [...tagCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 15)
        .map(([tag, count]) => ({ tag, count })),
    };
  },
});
