import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser } from "../lib/auth";
import {
  addDaysToDay,
  buildFindings,
  buildSegments,
  computeWeekMetrics,
  dayToMs,
  weekStartOf,
  PATTERN_THRESHOLDS,
  type StateSample,
} from "./lib/patterns";

/**
 * Generated-on-request weekly pattern reports — see `lib/patterns.ts` for the
 * detection rules. A report is a snapshot: regenerating overwrites the same
 * employee/week row, but past weeks stay browsable without recomputation.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchWeekSamples(
  ctx: QueryCtx | MutationCtx,
  employeeId: string,
  weekStartMs: number,
  weekEndMs: number
): Promise<StateSample[]> {
  const rows = await ctx.db
    .query("stateSamples")
    .withIndex("by_employee_time", q =>
      q.eq("employeeId", employeeId).gte("at", weekStartMs).lt("at", weekEndMs)
    )
    .order("asc")
    .take(10000);

  const prior = await ctx.db
    .query("stateSamples")
    .withIndex("by_employee_time", q =>
      q.eq("employeeId", employeeId).lt("at", weekStartMs)
    )
    .order("desc")
    .first();

  const samples = prior ? [prior, ...rows] : rows;
  return samples.map(r => ({ state: r.state, at: r.at }));
}

async function personNameFor(
  ctx: QueryCtx | MutationCtx,
  employeeId: string
): Promise<string> {
  const person = await ctx.db
    .query("people")
    .withIndex("by_employeeId", q => q.eq("employeeId", employeeId))
    .unique();
  return person?.name ?? employeeId;
}

/** Per-day active/idle/quick-flip rollup for one week, for the report's charts. */
function dailyBreakdown(
  samples: StateSample[],
  weekStartDay: string
): Array<{
  day: string;
  activeSeconds: number;
  idleSeconds: number;
  quickFlips: number;
}> {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDaysToDay(weekStartDay, i);
    const dayStart = dayToMs(day);
    const dayEnd = dayStart + DAY_MS;
    const segments = buildSegments(samples, dayStart, dayEnd);
    const metrics = computeWeekMetrics(
      segments,
      PATTERN_THRESHOLDS.quickFlipMs
    );
    return {
      day,
      activeSeconds: metrics.activeSeconds,
      idleSeconds: metrics.idleSeconds,
      quickFlips: metrics.quickFlipCount,
    };
  });
}

/** Generate (or regenerate) the pattern report for one employee's ISO week. */
export const generate = mutation({
  args: { employeeId: v.string(), weekStart: v.string() },
  handler: async (ctx, { employeeId, weekStart }) => {
    const user = await requireUser(ctx);
    if (weekStart !== weekStartOf(weekStart)) {
      throw new Error("weekStart must be a Monday (YYYY-MM-DD)");
    }

    const weekStartMs = dayToMs(weekStart);
    const weekEndMs = weekStartMs + 7 * DAY_MS;
    const prevWeekStart = addDaysToDay(weekStart, -7);
    const prevWeekStartMs = dayToMs(prevWeekStart);

    const [samples, prevSamples, personName] = await Promise.all([
      fetchWeekSamples(ctx, employeeId, weekStartMs, weekEndMs),
      fetchWeekSamples(ctx, employeeId, prevWeekStartMs, weekStartMs),
      personNameFor(ctx, employeeId),
    ]);

    const segments = buildSegments(samples, weekStartMs, weekEndMs);
    const current = computeWeekMetrics(
      segments,
      PATTERN_THRESHOLDS.quickFlipMs
    );

    const prevSegments = buildSegments(
      prevSamples,
      prevWeekStartMs,
      weekStartMs
    );
    const previous =
      prevSamples.length > 0
        ? computeWeekMetrics(prevSegments, PATTERN_THRESHOLDS.quickFlipMs)
        : undefined;

    const findings = buildFindings(personName, current, previous);
    const daily = dailyBreakdown(samples, weekStart);

    const doc = {
      employeeId,
      weekStart,
      generatedAt: Date.now(),
      generatedByUserId: user._id,
      metrics: {
        activeSeconds: current.activeSeconds,
        idleSeconds: current.idleSeconds,
        quickFlipCount: current.quickFlipCount,
        longestIdleStreakSeconds: current.longestIdleStreakSeconds,
        previous: previous
          ? {
              activeSeconds: previous.activeSeconds,
              idleSeconds: previous.idleSeconds,
              quickFlipCount: previous.quickFlipCount,
            }
          : undefined,
      },
      daily,
      findings,
    };

    const existing = await ctx.db
      .query("activityPatternReports")
      .withIndex("by_employee_week", q =>
        q.eq("employeeId", employeeId).eq("weekStart", weekStart)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("activityPatternReports", doc);
    return await ctx.db.get(id);
  },
});

/** The stored report for one employee/week, or null if never generated. */
export const get = query({
  args: { employeeId: v.string(), weekStart: v.string() },
  handler: async (ctx, { employeeId, weekStart }) => {
    await requireUser(ctx);
    return await ctx.db
      .query("activityPatternReports")
      .withIndex("by_employee_week", q =>
        q.eq("employeeId", employeeId).eq("weekStart", weekStart)
      )
      .unique();
  },
});

/** Recently generated reports for one employee, newest week first. */
export const list = query({
  args: { employeeId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { employeeId, limit }) => {
    await requireUser(ctx);
    return await ctx.db
      .query("activityPatternReports")
      .withIndex("by_employee_week", q => q.eq("employeeId", employeeId))
      .order("desc")
      .take(Math.min(limit ?? 12, 52));
  },
});
