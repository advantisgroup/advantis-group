import { v } from "convex/values";

import { type MutationCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { timeAbsenceStatusValidator, timeAbsenceTypeValidator } from "../tables/time";
import { isIsoDate } from "./lib/berlin";
import { assertTimeAccess, assertTimeWrite } from "./lib/mode";
import { isValidWeek } from "./lib/schedule";
import { carryOverExpiry } from "./lib/vacation";
import {
  displayName,
  invalidateTotalsFrom,
  loadSchedules,
  timeError,
  trackingDisabledIds,
  writeAudit,
} from "./lib/store";

/**
 * One-off Clockodo import (Verwaltung → Import). The browser reads the
 * export file, plans it with `lib/clockodo.ts`, the admin checks the preview,
 * and these mutations write it in small batches. Everything is keyed by the
 * Clockodo id (`importId`), so running the import again — e.g. on the cutover
 * day with a fresh export — updates instead of duplicating.
 *
 * Imported history is written as it was, month locks notwithstanding: it is
 * the record, not a change to it.
 */

const MAX_BATCH = 500;

/** Who the import can map Clockodo people to: active staff + stored Clockodo id. */
export const candidates = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    assertTimeAccess(ctx);
    const [users, untracked] = await Promise.all([
      ctx.db.query("users").collect(),
      trackingDisabledIds(ctx),
    ]);
    return users
      .filter((user) => user.status === "active" && !user.external)
      .map((user) => ({
        userId: user._id,
        name: displayName(user),
        email: user.email,
        clockodoUserId: user.clockodoUserId == null ? null : String(user.clockodoUserId),
        trackingDisabled: untracked.has(user._id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

/** Schedules, vacation entitlement and opening balance of one person. */
export const applyPerson = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    clockodoId: v.number(),
    schedules: v.array(v.object({ validFrom: v.string(), minutesPerWeekday: v.array(v.number()) })),
    allowance: v.optional(
      v.object({ year: v.number(), days: v.number(), carriedOver: v.number() }),
    ),
    opening: v.object({ minutes: v.number(), date: v.string() }),
  },
  handler: async (ctx, args) => {
    assertTimeWrite(ctx);
    if (!isIsoDate(args.opening.date)) {
      throw timeError("bad_request", "invalid_range", "Bad opening date");
    }
    for (const row of args.schedules) {
      if (!isIsoDate(row.validFrom) || !isValidWeek(row.minutesPerWeekday)) {
        throw timeError("bad_request", "invalid_range", "Bad schedule");
      }
    }
    const now = Date.now();

    // Schedules: Clockodo's models replace whatever is there.
    const before = await loadSchedules(ctx, args.userId);
    for (const row of before) await ctx.db.delete(row._id);
    for (const row of args.schedules) {
      await ctx.db.insert("workSchedules", { userId: args.userId, ...row, updatedAt: now });
    }

    if (args.allowance) {
      const { year, days, carriedOver } = args.allowance;
      const existing = await ctx.db
        .query("vacationAllowances")
        .withIndex("by_user_year", (q) => q.eq("userId", args.userId).eq("year", year))
        .unique();
      const row = {
        userId: args.userId,
        year,
        days,
        carriedOver,
        carriedOverExpires: carryOverExpiry(year),
        updatedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, { ...existing, ...row });
      else await ctx.db.insert("vacationAllowances", row);
    }

    const opening = await ctx.db
      .query("timeBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const balance = {
      userId: args.userId,
      openingMinutes: Math.round(args.opening.minutes),
      openingDate: args.opening.date,
      updatedAt: now,
    };
    if (opening) await ctx.db.replace(opening._id, balance);
    else await ctx.db.insert("timeBalances", balance);

    await ctx.db.patch(args.userId, { clockodoUserId: String(args.clockodoId) });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: args.userId,
      entity: "import",
      entityId: `clockodo:user:${args.clockodoId}`,
      action: "apply_person",
      before: { schedules: before, opening },
      after: { schedules: args.schedules, allowance: args.allowance, opening: balance },
      reason: "Clockodo-Import",
    });
    const earliest = [args.opening.date, ...args.schedules.map((row) => row.validFrom)].sort()[0];
    await invalidateTotalsFrom(ctx, args.userId, earliest);
  },
});

function entryByImport(ctx: MutationCtx, importId: string) {
  return ctx.db
    .query("timeEntries")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .first();
}

function absenceByImport(ctx: MutationCtx, importId: string) {
  return ctx.db
    .query("timeAbsences")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .first();
}

/** Up to 500 clocked segments of one person. */
export const importEntries = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    entries: v.array(
      v.object({
        importId: v.string(),
        start: v.number(),
        end: v.number(),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { userId, entries }) => {
    assertTimeWrite(ctx);
    if (entries.length > MAX_BATCH)
      throw timeError("bad_request", "invalid_range", "Batch too big");
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const row of entries) {
      if (!row.importId.startsWith("clockodo:") || !(row.end > row.start)) continue;
      const existing = await entryByImport(ctx, row.importId);
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.start !== row.start ||
          existing.end !== row.end ||
          existing.note !== row.note
        ) {
          await ctx.db.patch(existing._id, {
            userId,
            start: row.start,
            end: row.end,
            note: row.note,
            updatedAt: now,
          });
          updated += 1;
        }
        continue;
      }
      await ctx.db.insert("timeEntries", {
        userId,
        kind: "work",
        start: row.start,
        end: row.end,
        source: "import",
        status: "active",
        note: row.note,
        importId: row.importId,
        createdBy: ctx.caller.id,
        updatedAt: now,
      });
      inserted += 1;
    }
    if (inserted + updated > 0) {
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: userId,
        entity: "import",
        entityId: `entries:${entries[0]?.importId ?? ""}`,
        action: "import_entries",
        after: { inserted, updated, first: entries[0]?.start, last: entries.at(-1)?.end },
        reason: "Clockodo-Import",
      });
    }
    return { inserted, updated };
  },
});

/** Up to 500 absences of one person. */
export const importAbsences = userMutation({
  role: "admin",
  args: {
    userId: v.id("users"),
    absences: v.array(
      v.object({
        importId: v.string(),
        type: timeAbsenceTypeValidator,
        status: timeAbsenceStatusValidator,
        startDate: v.string(),
        endDate: v.string(),
        halfDayStart: v.boolean(),
        halfDayEnd: v.boolean(),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { userId, absences }) => {
    assertTimeWrite(ctx);
    if (absences.length > MAX_BATCH) {
      throw timeError("bad_request", "invalid_range", "Batch too big");
    }
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const row of absences) {
      if (
        !row.importId.startsWith("clockodo:") ||
        !isIsoDate(row.startDate) ||
        !isIsoDate(row.endDate) ||
        row.endDate < row.startDate
      ) {
        continue;
      }
      const fields = {
        userId,
        type: row.type,
        status: row.status,
        startDate: row.startDate,
        endDate: row.endDate,
        halfDayStart: row.halfDayStart,
        halfDayEnd: row.halfDayEnd,
        note: row.note,
      };
      const existing = await absenceByImport(ctx, row.importId);
      if (existing) {
        const same = (Object.keys(fields) as (keyof typeof fields)[]).every(
          (key) => existing[key] === fields[key],
        );
        if (!same) {
          await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
          updated += 1;
        }
        continue;
      }
      await ctx.db.insert("timeAbsences", {
        ...fields,
        importId: row.importId,
        createdBy: ctx.caller.id,
        updatedAt: now,
      });
      inserted += 1;
    }
    if (inserted + updated > 0) {
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: userId,
        entity: "import",
        entityId: `absences:${absences[0]?.importId ?? ""}`,
        action: "import_absences",
        after: { inserted, updated },
        reason: "Clockodo-Import",
      });
    }
    return { inserted, updated };
  },
});
