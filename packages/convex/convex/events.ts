import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { audienceValidator } from "./schema";
import { userMatchesAudience } from "./lib/audience";

function displayName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
    allDay: v.boolean(),
    color: v.optional(v.string()),
    audience: audienceValidator,
    guestVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireManager(ctx);
    if (args.end < args.start) {
      throw new ConvexError({
        code: "bad_request",
        message: "End must be after start",
      });
    }
    const id = await ctx.db.insert("events", {
      ...args,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    allDay: v.optional(v.boolean()),
    color: v.optional(v.string()),
    audience: v.optional(audienceValidator),
    guestVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, { eventId, ...patch }) => {
    const user = await requireManager(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new ConvexError({ code: "not_found", message: "Event not found" });
    }
    if (event.createdByUserId !== user._id && user.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the creator or an admin can edit this event",
      });
    }
    await ctx.db.patch(eventId, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireManager(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) return { ok: false };
    if (event.createdByUserId !== user._id && user.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the creator or an admin can delete this event",
      });
    }
    await ctx.db.delete(eventId);
    return { ok: true };
  },
});

/** Events overlapping [start, end] visible to the current user's audience. */
export const listForRange = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, { start, end }) => {
    const user = await requireUser(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_start", q => q.lte("start", end))
      .collect();
    const visible = events.filter(
      e => e.end >= start && userMatchesAudience(user, e.audience)
    );
    return Promise.all(
      visible.map(async e => ({
        _id: e._id,
        title: e.title,
        description: e.description ?? null,
        location: e.location ?? null,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        color: e.color ?? null,
        createdByUserId: e.createdByUserId,
        createdByName: displayName(await ctx.db.get(e.createdByUserId)),
      }))
    );
  },
});
