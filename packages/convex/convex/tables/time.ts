import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Zeiterfassung: working time and absences, owned by the intranet (replaces
 * Clockodo for these two things). Spec: docs/future-features/04a_zeiterfassung-spec.md.
 * Pure calculations live in `time/lib/*`; every write goes through
 * `time/lib/audit.ts` and nothing here is ever hard-deleted.
 */

export const timeEntryKindValidator = v.union(v.literal("work"), v.literal("break"));
export const timeEntrySourceValidator = v.union(
  v.literal("clock"),
  v.literal("manual"),
  v.literal("auto18"),
  v.literal("import"),
);
export const timeEntryStatusValidator = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("rejected"),
  v.literal("deleted"),
);
export const correctionActionValidator = v.union(
  v.literal("add"),
  v.literal("edit"),
  v.literal("delete"),
);
/** `overtime` = Überstundenabbau: a day off paid from the hours account, so
 *  unlike the others it does not lower the day's target. */
export const timeAbsenceTypeValidator = v.union(
  v.literal("vacation"),
  v.literal("sick"),
  v.literal("special"),
  v.literal("overtime"),
  v.literal("other"),
);
export const timeAbsenceStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
);

export const timeTables = {
  /**
   * One clocked or booked segment. `kind: "break"` segments sit inside a work
   * segment and are subtracted from it. A pending row is a correction request:
   * `correctionOf` names the entry it replaces (edit) or removes (delete), and
   * nothing pending, rejected or deleted counts towards any total.
   */
  timeEntries: defineTable({
    userId: v.id("users"),
    kind: timeEntryKindValidator,
    start: v.number(),
    end: v.optional(v.number()),
    source: timeEntrySourceValidator,
    status: timeEntryStatusValidator,
    autoClosed: v.optional(v.boolean()),
    note: v.optional(v.string()),
    correctionOf: v.optional(v.id("timeEntries")),
    correctionAction: v.optional(correctionActionValidator),
    /** Why the person asks for the correction (shown to the approving admin). */
    reason: v.optional(v.string()),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    /** Source id of an imported row (`clockodo:<id>`), so re-running the
     *  import updates instead of duplicating. */
    importId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user_start", ["userId", "start"])
    .index("by_status", ["status"])
    .index("by_end", ["end"])
    .index("by_import", ["importId"]),

  /** Target minutes per weekday (Mon..Sun) from `validFrom` (YYYY-MM-DD) on. */
  workSchedules: defineTable({
    userId: v.id("users"),
    validFrom: v.string(),
    minutesPerWeekday: v.array(v.number()),
    updatedAt: v.number(),
  }).index("by_user_validFrom", ["userId", "validFrom"]),

  /** Named `timeAbsences` because a legacy `absences` table may still hold
   *  old Clockodo-mirror rows in production. Dates are inclusive YYYY-MM-DD. */
  timeAbsences: defineTable({
    userId: v.id("users"),
    type: timeAbsenceTypeValidator,
    startDate: v.string(),
    endDate: v.string(),
    halfDayStart: v.boolean(),
    halfDayEnd: v.boolean(),
    status: timeAbsenceStatusValidator,
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    /** See `timeEntries.importId`. */
    importId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user_start", ["userId", "startDate"])
    .index("by_status", ["status"])
    .index("by_end", ["endDate"])
    .index("by_import", ["importId"]),

  /** Vacation entitlement per person and year. No row = the 24-day default. */
  vacationAllowances: defineTable({
    userId: v.id("users"),
    year: v.number(),
    days: v.number(),
    carriedOver: v.number(),
    /** YYYY-MM-DD, normally 31 March of `year`. */
    carriedOverExpires: v.string(),
    /** Set once the expiry job has run: how many carried-over days lapsed. */
    carriedOverExpiredDays: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_year", ["userId", "year"])
    .index("by_year", ["year"]),

  /** Opening hours-account balance (from the Clockodo import); the account
   *  counts from `openingDate` on. */
  timeBalances: defineTable({
    userId: v.id("users"),
    openingMinutes: v.number(),
    openingDate: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Public holidays plus company days off; `fraction` 0.5 = half day. */
  holidays: defineTable({
    date: v.string(),
    name: v.string(),
    fraction: v.number(),
    region: v.string(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  /** A month (YYYY-MM) locks by itself on the 15th of the next month; a row
   *  records the lock job, an early manual lock, or an admin unlock. Locked
   *  when `lockedAt` is later than `unlockedAt`. */
  monthLocks: defineTable({
    month: v.string(),
    lockedAt: v.optional(v.number()),
    lockedBy: v.optional(v.id("users")),
    unlockedAt: v.optional(v.number()),
    unlockedBy: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  }).index("by_month", ["month"]),

  /** Worked/target minutes of one full month, cached when the month locks so
   *  the hours account doesn't re-read years of entries. Deleted whenever
   *  anything feeding it changes; a missing row is computed live. */
  timeMonthTotals: defineTable({
    userId: v.id("users"),
    month: v.string(),
    workedMinutes: v.number(),
    targetMinutes: v.number(),
    computedAt: v.number(),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_month", ["month"]),

  /** Append-only. `actorId` unset = a scheduled job. Kept at least 2 years. */
  timeAuditLog: defineTable({
    actorId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    entity: v.union(
      v.literal("entry"),
      v.literal("absence"),
      v.literal("schedule"),
      v.literal("allowance"),
      v.literal("balance"),
      v.literal("holiday"),
      v.literal("monthLock"),
      v.literal("import"),
    ),
    entityId: v.string(),
    action: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    reason: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_subject_at", ["subjectUserId", "at"]),
};
