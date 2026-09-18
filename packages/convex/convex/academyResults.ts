import { mutation, query } from "./functions";
import { v } from "convex/values";

import { requireAcademyAdmin } from "./academySettings";
import { notifyUsers } from "./lib/notify";

function isFinished(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return Boolean((JSON.parse(raw) as { finished?: unknown }).finished);
  } catch {
    return false;
  }
}

// getMine/saveMine are deliberately public (no `requireUser`) — knowing the
// participantId is only possible after resolving an access code via
// academyParticipants.findByCode, which is itself the real (and only) gate.
// This lets external, account-less invitees load and save their own
// progress. Everything below (listAll) stays intranet-gated for the
// Trainer area.

export const getMine = query({
  args: { participantId: v.id("academyParticipants") },
  handler: async (ctx, { participantId }) => {
    const row = await ctx.db
      .query("academyResults")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .unique();
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  },
});

/** Saves the participant's progress; when this save is the one that flips
 * `finished` from unset to set, notifies every manager/admin (the academy
 * has no fixed "trainer" account list — PIN access, not a role, is what
 * makes someone a trainer — so managers/admins are the closest stand-in
 * audience for "new results came in"). */
export const saveMine = mutation({
  args: {
    academyId: v.string(),
    participantId: v.id("academyParticipants"),
    data: v.string(),
  },
  handler: async (ctx, { academyId, participantId, data }) => {
    const existing = await ctx.db
      .query("academyResults")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .unique();
    const now = Date.now();
    const justFinished = !isFinished(existing?.data) && isFinished(data);

    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: now });
    } else {
      await ctx.db.insert("academyResults", {
        academyId,
        participantId,
        data,
        updatedAt: now,
      });
    }

    if (justFinished) {
      const participant = await ctx.db.get(participantId);
      const [managers, admins] = await Promise.all([
        ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "manager"))
          .collect(),
        ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "admin"))
          .collect(),
      ]);
      await notifyUsers(
        ctx,
        [...managers, ...admins].map((u) => u._id),
        {
          type: "academy_finished",
          title: participant
            ? `${participant.name} hat die Wallbox Sales Academy abgeschlossen`
            : "Ein Teilnehmer hat die Wallbox Sales Academy abgeschlossen",
          body: participant?.email,
          link: `/guidebooks/wallbox-sales-academy/admin/teilnehmer/${participantId}`,
        },
      );
    }
  },
});

/** Admin (Trainer area): every participant's results for the academy. */
export const listAll = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    return ctx.db
      .query("academyResults")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
  },
});
