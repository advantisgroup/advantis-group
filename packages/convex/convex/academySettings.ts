import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const DEFAULT_PIN = "1234";

/** Whether `pin` unlocks the academy's Trainer area — same client-side trust
 * model as the ported tool (knowing the PIN is the whole gate), except the
 * PIN itself is compared server-side and never sent to the client. */
export const checkPin = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("academySettings")
      .withIndex("by_academyId", q => q.eq("academyId", academyId))
      .unique();
    const current = row?.pin ?? DEFAULT_PIN;
    return current === pin.trim();
  },
});

export const setPin = mutation({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireUser(ctx);
    const trimmed = pin.trim();
    if (trimmed.length < 4) return;
    const row = await ctx.db
      .query("academySettings")
      .withIndex("by_academyId", q => q.eq("academyId", academyId))
      .unique();
    const now = Date.now();
    if (row) {
      await ctx.db.patch(row._id, { pin: trimmed, updatedAt: now });
    } else {
      await ctx.db.insert("academySettings", {
        academyId,
        pin: trimmed,
        updatedAt: now,
      });
    }
  },
});

/** Wipe every participant, result and question for the academy, and reset
 * the PIN back to the default — mirrors the original tool's "reset all
 * data" admin action. */
export const resetAll = mutation({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    await requireUser(ctx);

    const participants = await ctx.db
      .query("academyParticipants")
      .withIndex("by_academy", q => q.eq("academyId", academyId))
      .collect();
    await Promise.all(participants.map(p => ctx.db.delete(p._id)));

    const results = await ctx.db
      .query("academyResults")
      .withIndex("by_academy", q => q.eq("academyId", academyId))
      .collect();
    await Promise.all(results.map(r => ctx.db.delete(r._id)));

    const questions = await ctx.db
      .query("academyQuestions")
      .withIndex("by_academy", q => q.eq("academyId", academyId))
      .collect();
    await Promise.all(questions.map(q => ctx.db.delete(q._id)));

    const settings = await ctx.db
      .query("academySettings")
      .withIndex("by_academyId", q => q.eq("academyId", academyId))
      .unique();
    if (settings) await ctx.db.delete(settings._id);
  },
});
