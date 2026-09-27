import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";

/** German states (ISO 3166-2:DE suffixes) with holidays beyond the
 *  nationwide ones. The dates themselves are computed in the intranet
 *  (lib/holidays.ts); this only stores which state applies. */
export const HOLIDAY_REGIONS = [
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything the calendar needs to mark days off in a range: the holiday
 *  region and the closures overlapping `[start, end]` (inclusive ISO). */
export const inRange = userQuery({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, { start, end }) => {
    const settings = await ctx.db.query("officeCalendarSettings").first();
    const closures = await ctx.db
      .query("officeClosures")
      .withIndex("by_endDate", (q) => q.gte("endDate", start))
      .collect();
    return {
      region: settings?.region ?? null,
      closures: closures
        .filter((c) => c.startDate <= end)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((c) => ({
          _id: c._id,
          title: c.title,
          startDate: c.startDate,
          endDate: c.endDate,
          note: c.note ?? null,
        })),
    };
  },
});

export const setRegion = userMutation({
  role: "admin",
  args: { region: v.optional(v.string()) },
  handler: async (ctx, { region }) => {
    if (region !== undefined && !(HOLIDAY_REGIONS as readonly string[]).includes(region)) {
      throw new ConvexError({ code: "bad_request", message: "Unknown region" });
    }
    const existing = await ctx.db.query("officeCalendarSettings").first();
    const row = { region, updatedBy: ctx.caller.user._id, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("officeCalendarSettings", row);
  },
});

export const addClosure = userMutation({
  role: "admin",
  args: {
    title: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new ConvexError({ code: "bad_request", message: "A title is required" });
    if (!ISO_DATE.test(args.startDate) || !ISO_DATE.test(args.endDate)) {
      throw new ConvexError({ code: "bad_request", message: "Dates must be YYYY-MM-DD" });
    }
    if (args.endDate < args.startDate) {
      throw new ConvexError({ code: "bad_request", message: "The end can't be before the start" });
    }
    return ctx.db.insert("officeClosures", {
      title,
      startDate: args.startDate,
      endDate: args.endDate,
      note: args.note?.trim() || undefined,
      createdBy: ctx.caller.user._id,
      createdAt: Date.now(),
    });
  },
});

export const removeClosure = userMutation({
  role: "admin",
  args: { id: v.id("officeClosures") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
