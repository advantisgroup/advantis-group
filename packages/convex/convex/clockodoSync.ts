import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { toClockodoIdString } from "./lib/clockodoId";

/**
 * Clockodo → absences mirroring. Clockodo is the primary system of record for
 * absences; these functions upsert read-only mirror rows (`source: "clockodo"`)
 * into Convex. Two entry points share the same core:
 * - server-key gated mutations invoked by the Elysia API's webhook / importer
 * - the hourly reconcile cron (`absenceSync.syncClockodoAbsences`)
 */
function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

type AbsenceType = Doc<"absences">["type"];
type AbsenceStatus = Doc<"absences">["status"];

/** Map a Clockodo absence type id to our coarse category. */
function mapType(clockodoType: number): AbsenceType {
  switch (clockodoType) {
    case 1: // regular holiday
      return "vacation";
    case 4: // sick day
    case 5: // sick day of a child
    case 11: // sick day (unpaid)
    case 12: // sick day of child (unpaid)
    case 13: // quarantine
    case 15: // sick day (sickness benefit)
      return "sick";
    case 2: // special leaves
    case 6: // school / further education
    case 7: // maternity protection
    case 10: // special leaves (unpaid)
    case 14: // military / alternative service
      return "personal";
    default: // 3 overtime reduction, 8 home office, 9 work out of office, ...
      return "other";
  }
}

/** Map a Clockodo status code to our status. */
function mapStatus(clockodoStatus: number): AbsenceStatus {
  switch (clockodoStatus) {
    case 0:
      return "pending";
    case 1:
      return "approved";
    case 2:
      return "denied";
    case 3:
    case 4:
      return "cancelled";
    default:
      return "pending";
  }
}

async function resolveUser(
  ctx: MutationCtx,
  clockodoUserId: number,
  email: string | undefined
): Promise<Doc<"users"> | null> {
  const byClockodo = await ctx.db
    .query("users")
    .withIndex("by_clockodoUserId", q => q.eq("clockodoUserId", clockodoUserId))
    .first();
  if (byClockodo) return byClockodo;

  if (email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email.toLowerCase()))
      .first();
    if (byEmail) {
      // Backfill the Clockodo link for next time.
      if (byEmail.clockodoUserId !== clockodoUserId) {
        await ctx.db.patch(byEmail._id, { clockodoUserId });
      }
      return byEmail;
    }
  }

  // ActivityTrack-roster fallback: not every employee has an intranet-side
  // Clockodo link yet, but many are already mapped in the `people` table
  // (which stores the id as a string). The direct `users` link above always
  // wins — the roster is only consulted when the intranet knows nothing.
  const person = await ctx.db
    .query("people")
    .withIndex("by_clockodoUserId", q =>
      q.eq("clockodoUserId", toClockodoIdString(clockodoUserId))
    )
    .first();
  if (person?.userId) {
    return await ctx.db.get(person.userId);
  }
  return null;
}

const absencePayload = {
  externalId: v.string(),
  clockodoUserId: v.number(),
  email: v.optional(v.string()),
  dateSince: v.string(),
  dateUntil: v.string(),
  clockodoType: v.number(),
  clockodoStatus: v.number(),
  countDays: v.optional(v.number()),
  note: v.optional(v.string()),
};

type AbsencePayload = {
  externalId: string;
  clockodoUserId: number;
  email?: string;
  dateSince: string;
  dateUntil: string;
  clockodoType: number;
  clockodoStatus: number;
  countDays?: number;
  note?: string;
};

async function upsertAbsence(ctx: MutationCtx, args: AbsencePayload) {
  const user = await resolveUser(ctx, args.clockodoUserId, args.email);
  if (!user) {
    // No matching intranet account yet — nothing to mirror.
    return { status: "skipped" as const, reason: "no_matching_user" as const };
  }

  const fields = {
    userId: user._id,
    type: mapType(args.clockodoType),
    startDate: args.dateSince,
    endDate: args.dateUntil,
    halfDay: args.countDays === 0.5,
    reason: args.note,
    status: mapStatus(args.clockodoStatus),
    source: "clockodo" as const,
    externalId: args.externalId,
    clockodoType: args.clockodoType,
    clockodoStatus: args.clockodoStatus,
  };

  const existing = await ctx.db
    .query("absences")
    .withIndex("by_externalId", q => q.eq("externalId", args.externalId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { status: "updated" as const, absenceId: existing._id };
  }
  const absenceId = await ctx.db.insert("absences", {
    ...fields,
    createdAt: Date.now(),
  });
  return { status: "created" as const, absenceId };
}

async function recordSyncRun(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("activitySettings")
    .withIndex("by_key", q => q.eq("key", "absenceSync.lastRunAt"))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { value: String(now), updatedAt: now });
  } else {
    await ctx.db.insert("activitySettings", {
      key: "absenceSync.lastRunAt",
      value: String(now),
      updatedAt: now,
    });
  }
}

export const upsertAbsenceFromClockodo = mutation({
  args: { serverKey: v.string(), ...absencePayload },
  handler: async (ctx, { serverKey, ...args }) => {
    assertServerKey(serverKey);
    return await upsertAbsence(ctx, args);
  },
});

export const deleteAbsenceByExternalId = mutation({
  args: { serverKey: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const existing = await ctx.db
      .query("absences")
      .withIndex("by_externalId", q => q.eq("externalId", args.externalId))
      .first();
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

/**
 * Reconcile one Clockodo year against the mirror: upsert everything fetched,
 * then drop mirrored rows in that year whose Clockodo absence vanished (a
 * deletion the webhook missed). Called by the hourly sync action with the
 * complete unfiltered list for the year — pruning against a partial fetch
 * would delete valid mirrors.
 */
export const applySyncBatch = internalMutation({
  args: {
    year: v.number(),
    absences: v.array(v.object(absencePayload)),
  },
  handler: async (ctx, { year, absences }) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const absence of absences) {
      seen.add(absence.externalId);
      const result = await upsertAbsence(ctx, absence);
      if (result.status === "created") created++;
      else if (result.status === "updated") updated++;
      else skipped++;
    }

    let deleted = 0;
    const inYear = await ctx.db
      .query("absences")
      .withIndex("by_startDate", q =>
        q.gte("startDate", `${year}-01-01`).lte("startDate", `${year}-12-31`)
      )
      .collect();
    for (const mirror of inYear) {
      if (
        mirror.source === "clockodo" &&
        mirror.externalId &&
        !seen.has(mirror.externalId)
      ) {
        await ctx.db.delete(mirror._id);
        deleted++;
      }
    }

    await recordSyncRun(ctx);
    return { created, updated, skipped, deleted };
  },
});

/** Link an intranet user to their Clockodo coworker id (admin tooling). */
export const linkClockodoUserByEmail = mutation({
  args: {
    serverKey: v.string(),
    email: v.string(),
    clockodoUserId: v.number(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email.toLowerCase()))
      .first();
    if (!user) return { linked: false };
    await ctx.db.patch(user._id, { clockodoUserId: args.clockodoUserId });
    return { linked: true };
  },
});
