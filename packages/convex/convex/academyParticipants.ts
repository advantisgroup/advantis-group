import { internalMutation, mutation, query } from "./functions";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc } from "./_generated/dataModel";
import { requireAcademyAdmin } from "./academySettings";
import { createNotification } from "./lib/notify";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function displayName(user: Doc<"users">): string {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
}

/**
 * Admin: create a participant and hand back their access code. Two invite
 * paths, same downstream flow (the participant still needs the code to get
 * in — linking never skips that):
 *  - plain email invite: `name`/`email` typed by the admin, code shared via
 *    a mailto the client composes itself (no server involvement).
 *  - "share with an intranet account" (`linkUserId` set): name/email are
 *    taken from that account, the participant row is linked immediately,
 *    and the account gets an in-app notification plus a real email with the
 *    code (see `outbound.sendNotificationEmail`'s "academy-invite" kind).
 */
export const create = mutation({
  args: {
    academyId: v.string(),
    name: v.string(),
    email: v.string(),
    linkUserId: v.optional(v.id("users")),
    pin: v.string(),
  },
  handler: async (ctx, { academyId, name, email, linkUserId, pin }) => {
    const admin = await requireAcademyAdmin(ctx, academyId, pin);
    const code = generateCode();
    const linkedUser = linkUserId ? await ctx.db.get(linkUserId) : null;
    const now = Date.now();

    // Only when the admin didn't pick an account themselves.
    const autoLinkedUser =
      !linkedUser && !linkUserId
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
            .unique()
        : null;
    const resolvedUser =
      linkedUser ?? (autoLinkedUser?.status === "active" ? autoLinkedUser : null);

    const participantId = await ctx.db.insert("academyParticipants", {
      academyId,
      name: resolvedUser ? displayName(resolvedUser) : name,
      email: resolvedUser ? resolvedUser.email : email,
      code,
      createdAt: now,
      ...(resolvedUser
        ? {
            linkedUserId: resolvedUser._id,
            linkedAt: now,
            ...(linkedUser
              ? { linkedByUserId: admin._id }
              : { autoLinkedVia: "email_match" as const }),
          }
        : {}),
    });

    if (linkedUser) {
      await createNotification(ctx, {
        userId: linkedUser._id,
        type: "academy_invite",
        title: "Du wurdest zur Wallbox Sales Academy eingeladen",
        body: `Dein Zugangscode: ${code}`,
        link: "/guidebooks/wallbox-sales-academy",
      });
      await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
        kind: "academy-invite",
        to: linkedUser.email,
        data: { code, invitedByName: displayName(admin) },
      });
    }

    return { participantId, code, linkedUserId: linkedUser?._id ?? null };
  },
});

/** Admin: every participant for the academy (Trainer area participant list). */
export const listAll = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    return ctx.db
      .query("academyParticipants")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
  },
});

/**
 * Participant login: resolve an access code to the participant it belongs
 * to. Deliberately public (no `requireUser`) — the code is the whole
 * credential, so external invitees without an intranet account can take the
 * training, same as the original standalone tool.
 */
export const findByCode = query({
  args: { academyId: v.string(), code: v.string() },
  handler: async (ctx, { academyId, code }) => {
    const participant = await ctx.db
      .query("academyParticipants")
      .withIndex("by_academy_code", (q) =>
        q.eq("academyId", academyId).eq("code", code.trim().toUpperCase()),
      )
      .unique();
    return participant ? { id: participant._id, name: participant.name } : null;
  },
});

export const remove = mutation({
  args: { participantId: v.id("academyParticipants"), pin: v.string() },
  handler: async (ctx, { participantId, pin }) => {
    const participant = await ctx.db.get(participantId);
    if (!participant) return;
    await requireAcademyAdmin(ctx, participant.academyId, pin);
    const results = await ctx.db
      .query("academyResults")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .collect();
    await Promise.all(results.map((r) => ctx.db.delete(r._id)));
    const questions = await ctx.db
      .query("academyQuestions")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .collect();
    await Promise.all(questions.map((q) => ctx.db.delete(q._id)));
    await ctx.db.delete(participantId);
  },
});

/** Admin (Trainer area): link a finished participant's results to a real
 * intranet account. */
export const linkToAccount = mutation({
  args: { participantId: v.id("academyParticipants"), userId: v.id("users"), pin: v.string() },
  handler: async (ctx, { participantId, userId, pin }) => {
    const participant = await ctx.db.get(participantId);
    if (!participant) return;
    const admin = await requireAcademyAdmin(ctx, participant.academyId, pin);
    await ctx.db.patch(participantId, {
      linkedUserId: userId,
      linkedAt: Date.now(),
      linkedByUserId: admin._id,
      // An admin picking the link by hand is always the human-linked case
      // from here on, whatever it was before.
      autoLinkedVia: undefined,
    });
  },
});

export const unlinkAccount = mutation({
  args: { participantId: v.id("academyParticipants"), pin: v.string() },
  handler: async (ctx, { participantId, pin }) => {
    const participant = await ctx.db.get(participantId);
    if (!participant) return;
    await requireAcademyAdmin(ctx, participant.academyId, pin);
    await ctx.db.patch(participantId, {
      linkedUserId: undefined,
      linkedAt: undefined,
      linkedByUserId: undefined,
      autoLinkedVia: undefined,
    });
  },
});

/** Nightly: links participants whose intranet account showed up later. Only
 * touches unlinked rows, so it never overrides an admin's choice. */
export const reconcileAutoLinks = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ linked: number }> => {
    const unlinked = (await ctx.db.query("academyParticipants").collect()).filter(
      (p) => !p.linkedUserId,
    );

    let linked = 0;
    for (const participant of unlinked) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", participant.email.trim().toLowerCase()))
        .unique();
      if (!user || user.status !== "active") continue;
      await ctx.db.patch(participant._id, {
        linkedUserId: user._id,
        linkedAt: Date.now(),
        autoLinkedVia: "email_match",
      });
      linked++;
    }
    return { linked };
  },
});
