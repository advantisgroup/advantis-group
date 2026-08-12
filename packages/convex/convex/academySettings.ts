import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { effectiveRole, requireUser } from "./lib/auth";

const DEFAULT_PIN = "1234";

async function resolveCurrentPin(ctx: QueryCtx | MutationCtx, academyId: string): Promise<string> {
  const row = await ctx.db
    .query("academySettings")
    .withIndex("by_academyId", (q) => q.eq("academyId", academyId))
    .unique();
  return row?.pin ?? DEFAULT_PIN;
}

/** Whether `pin` unlocks the academy's Trainer area — same client-side trust
 * model as the ported tool (knowing the PIN is the whole gate), except the
 * PIN itself is compared server-side and never sent to the client. */
export const checkPin = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireUser(ctx);
    const current = await resolveCurrentPin(ctx, academyId);
    return current === pin.trim();
  },
});

/**
 * Gate for every Trainer-area mutation: a real intranet admin bypasses the
 * PIN entirely (same rule the client's `AdminLogin`/`admin/layout` already
 * apply); everyone else must supply the academy's current PIN. Without this,
 * the PIN was only ever checked client-side (via `checkPin`) — any signed-in
 * employee could call the mutations below directly and skip it.
 */
export async function requireAcademyAdmin(
  ctx: QueryCtx | MutationCtx,
  academyId: string,
  pin: string,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (effectiveRole(user) === "admin") return user;
  const current = await resolveCurrentPin(ctx, academyId);
  if (current !== pin.trim()) {
    throw new ConvexError({
      code: "forbidden",
      message: "Falsche PIN.",
    });
  }
  return user;
}

export const setPin = mutation({
  args: { academyId: v.string(), authPin: v.string(), newPin: v.string() },
  handler: async (ctx, { academyId, authPin, newPin }) => {
    await requireAcademyAdmin(ctx, academyId, authPin);
    const trimmed = newPin.trim();
    if (trimmed.length < 4) return;
    const row = await ctx.db
      .query("academySettings")
      .withIndex("by_academyId", (q) => q.eq("academyId", academyId))
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
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireAcademyAdmin(ctx, academyId, pin);

    const participants = await ctx.db
      .query("academyParticipants")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
    await Promise.all(participants.map((p) => ctx.db.delete(p._id)));

    const results = await ctx.db
      .query("academyResults")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
    await Promise.all(results.map((r) => ctx.db.delete(r._id)));

    const questions = await ctx.db
      .query("academyQuestions")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
    await Promise.all(questions.map((q) => ctx.db.delete(q._id)));

    const settings = await ctx.db
      .query("academySettings")
      .withIndex("by_academyId", (q) => q.eq("academyId", academyId))
      .unique();
    if (settings) await ctx.db.delete(settings._id);
  },
});
