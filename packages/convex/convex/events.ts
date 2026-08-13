import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { isOwnerOrAdmin, requireCapability, requireUser } from "./lib/auth";
import { userMatchesAudience } from "./lib/audience";
import { audienceValidator, richDateKindValidator } from "./schema";

function displayName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
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
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "manage_announcements");
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

/** Creates a short, explicit weekly series. Each occurrence stays a normal
 * event so editing or deleting one never needs recurrence-rule machinery. */
export const createWeeklySeries = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
    allDay: v.boolean(),
    color: v.optional(v.string()),
    audience: audienceValidator,
    occurrences: v.number(),
  },
  handler: async (ctx, { occurrences, ...event }) => {
    const user = await requireCapability(ctx, "manage_announcements");
    if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 12) {
      throw new ConvexError({ code: "bad_request", message: "Choose 2 to 12 occurrences" });
    }
    if (event.end < event.start) {
      throw new ConvexError({ code: "bad_request", message: "End must be after start" });
    }
    const now = Date.now();
    const ids = [];
    for (let index = 0; index < occurrences; index++) {
      ids.push(
        await ctx.db.insert("events", {
          ...event,
          start: event.start + index * 7 * 24 * 60 * 60 * 1000,
          end: event.end + index * 7 * 24 * 60 * 60 * 1000,
          createdByUserId: user._id,
          createdAt: now,
        }),
      );
    }
    return { ids };
  },
});

export const addRichDateToMine = mutation({
  args: {
    richDateId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
    allDay: v.boolean(),
    kind: v.optional(richDateKindValidator),
    automatic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const richDateId = args.richDateId.trim();
    const title = args.title.trim();
    if (!richDateId || !title) {
      throw new ConvexError({ code: "bad_request", message: "Date and title are required" });
    }
    if (args.allDay ? args.end < args.start : args.end <= args.start) {
      throw new ConvexError({ code: "bad_request", message: "End must be after start" });
    }

    const existing = await ctx.db
      .query("events")
      .withIndex("by_personal_rich_date", (q) =>
        q.eq("personalForUserId", user._id).eq("sourceRichDateId", richDateId),
      )
      .unique();
    const event = {
      title,
      description: args.description?.trim() || undefined,
      location: args.location?.trim() || undefined,
      start: args.start,
      end: args.end,
      allDay: args.allDay,
      kind: args.kind,
    };
    if (existing) {
      if (existing.dismissedAt && args.automatic) {
        return { id: existing._id, created: false, updated: false };
      }
      const changed =
        existing.dismissedAt !== undefined ||
        existing.title !== event.title ||
        existing.description !== event.description ||
        existing.location !== event.location ||
        existing.start !== event.start ||
        existing.end !== event.end ||
        existing.allDay !== event.allDay ||
        existing.kind !== event.kind;
      if (!changed) {
        return { id: existing._id, created: false, updated: false };
      }
      await ctx.db.patch(existing._id, {
        ...event,
        dismissedAt: undefined,
        updatedAt: Date.now(),
      });
      return { id: existing._id, created: false, updated: true };
    }

    const id = await ctx.db.insert("events", {
      ...event,
      createdByUserId: user._id,
      sourceRichDateId: richDateId,
      personalForUserId: user._id,
      audience: { kind: "users", userIds: [user._id] },
      createdAt: Date.now(),
    });
    return { id, created: true, updated: false };
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
  },
  handler: async (ctx, { eventId, ...patch }) => {
    const user = await requireCapability(ctx, "manage_announcements");
    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new ConvexError({ code: "not_found", message: "Event not found" });
    }
    if (!isOwnerOrAdmin(user, event.createdByUserId)) {
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
    const user = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) return { ok: false };
    if (event.personalForUserId === user._id) {
      // Keep the source ID so automatic saves do not recreate an event the user removed.
      await ctx.db.patch(eventId, { dismissedAt: Date.now(), updatedAt: Date.now() });
      return { ok: true };
    }
    const manager = await requireCapability(ctx, "manage_announcements");
    if (!isOwnerOrAdmin(manager, event.createdByUserId)) {
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
      .withIndex("by_start", (q) => q.lte("start", end))
      .collect();
    const visible = events.filter(
      (e) => !e.dismissedAt && e.end >= start && userMatchesAudience(user, e.audience),
    );
    return Promise.all(
      visible.map(async (e) => ({
        _id: e._id,
        title: e.title,
        description: e.description ?? null,
        location: e.location ?? null,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        kind: e.kind ?? null,
        color: e.color ?? null,
        audience: e.audience,
        createdByUserId: e.createdByUserId,
        personalForUserId: e.personalForUserId ?? null,
        createdByName: displayName(await ctx.db.get(e.createdByUserId)),
      })),
    );
  },
});
