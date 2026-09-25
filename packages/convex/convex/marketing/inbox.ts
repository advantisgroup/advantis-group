import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { attachmentValidator } from "../lib/validators";
import { inquiryStateValidator } from "../tables/marketing";
import { referenceFor } from "./inquiries";
import { legacyDesiredAt, replyDueAt } from "./lib/inquiry";

/**
 * The team's side of website inquiries — the intranet's `/inquiries` page.
 * Everyone with `manage_inquiries` (and every manager) can read and work
 * the whole inbox. Customer-facing mails go out a few minutes after a state
 * change, from `marketing/mail.ts`. See docs/inquiries.md.
 */

const inbox = { can: "manage_inquiries" } as const;

// a few quick clicks in the inbox should reach the customer as one mail, or none
const STATE_MAIL_DELAY_MS = 5 * 60 * 1000;

const viewValidator = v.union(
  v.literal("open"),
  v.literal("answered"),
  v.literal("closed"),
  v.literal("failed"),
  v.literal("all"),
);

const stateOf = (row: Doc<"emails">) => row.state ?? "open";

const inView = (row: Doc<"emails">, view: string) => {
  const state = stateOf(row);
  switch (view) {
    case "open":
      return state === "open" || state === "in_progress";
    case "answered":
      return state === "answered";
    case "closed":
      return state === "closed" || state === "withdrawn";
    case "failed":
      return row.status === "failed" || row.status === "bounced";
    default:
      return true;
  }
};

async function userName(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : undefined;
}

function forStaff(row: Doc<"emails">) {
  const { actionTokenHash: _hash, actionTokenExpiresAt: _expires, ...rest } = row;
  const state = stateOf(row);
  const dueAt = replyDueAt(row.sentAt);
  return {
    ...rest,
    state,
    reference: referenceFor(row),
    desiredAt: row.desiredAt ?? legacyDesiredAt(row.desiredDateTime) ?? undefined,
    lastActivityAt: row.lastActivityAt ?? row.sentAt,
    dueAt,
    overdue:
      (state === "open" || state === "in_progress") && !row.firstResponseAt && dueAt < Date.now(),
  };
}

async function requireRow(ctx: QueryCtx, id: Id<"emails">) {
  const row = await ctx.db.get(id);
  if (!row) throw new ConvexError({ code: "not_found", message: "Inquiry not found" });
  return row;
}

export const list = userQuery({
  ...inbox,
  args: { view: viewValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { view, paginationOpts }) => {
    // the emails table grows without bound, so this pages newest-activity first
    const page = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt")
      .order("desc")
      .filter((q) => q.eq(q.field("anonymizedAt"), undefined))
      .paginate(paginationOpts);
    const rows = page.page.filter((row) => inView(row, view));
    return {
      ...page,
      page: await Promise.all(
        rows.map(async (row) => ({
          ...forStaff(row),
          assigneeName: await userName(ctx, row.assignedToUserId),
        })),
      ),
    };
  },
});

/** Numbers for the tabs, the sidebar badge and the dashboard. */
export const counts = userQuery({
  ...inbox,
  args: {},
  handler: async (ctx) => {
    const count = async (state: Doc<"emails">["state"]) =>
      (
        await ctx.db
          .query("emails")
          .withIndex("by_state_lastActivityAt", (q) => q.eq("state", state))
          .take(500)
      ).length;
    const [open, legacyOpen, inProgress, answered] = await Promise.all([
      count("open"),
      count(undefined),
      count("in_progress"),
      count("answered"),
    ]);
    const recent = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt")
      .order("desc")
      .take(300);
    return {
      open: open + legacyOpen,
      inProgress,
      answered,
      unanswered: open + legacyOpen + inProgress,
      failed: recent.filter((row) => row.status === "failed" || row.status === "bounced").length,
      unseen: recent.filter((row) => !row.seenAt && stateOf(row) === "open").length,
    };
  },
});

export const get = userQuery({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    const events = await ctx.db
      .query("inquiryEvents")
      .withIndex("by_inquiry_at", (q) => q.eq("inquiryId", id))
      .take(300);
    const messages = await ctx.db
      .query("inquiryMessages")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", id))
      .take(500);
    const withUrls = (attachments: Doc<"inquiryMessages">["attachments"]) =>
      Promise.all(
        (attachments ?? []).map(async (attachment) => ({
          ...attachment,
          url: await ctx.storage.getUrl(attachment.storageId),
        })),
      );

    return {
      inquiry: forStaff(row),
      attachments: await withUrls(row.attachments),
      assigneeName: await userName(ctx, row.assignedToUserId),
      seenByName: await userName(ctx, row.seenByUserId),
      events: await Promise.all(
        events.map(async (event) => ({
          ...event,
          actorName: await userName(ctx, event.actorUserId),
        })),
      ),
      messages: await Promise.all(
        messages.map(async (message) => ({
          ...message,
          staffName: await userName(ctx, message.staffUserId),
          attachments: await withUrls(message.attachments),
        })),
      ),
    };
  },
});

/** The first time anyone in the team opens it — the customer sees "Seen". */
export const markSeen = userMutation({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const row = await requireRow(ctx, id);
    if (row.seenAt) return;
    const now = Date.now();
    await ctx.db.patch(id, { seenAt: now, seenByUserId: ctx.caller.user._id });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "seen",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
  },
});

export const setState = userMutation({
  ...inbox,
  args: { id: v.id("emails"), state: inquiryStateValidator },
  handler: async (ctx, { id, state }) => {
    const row = await requireRow(ctx, id);
    if (stateOf(row) === state) return;
    const now = Date.now();
    await ctx.db.patch(id, {
      state,
      lastActivityAt: now,
      closedAt: state === "closed" ? now : row.closedAt,
      seenAt: row.seenAt ?? now,
      seenByUserId: row.seenByUserId ?? ctx.caller.user._id,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "state",
      state,
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
    if (state === "in_progress" || state === "answered") {
      await ctx.scheduler.runAfter(STATE_MAIL_DELAY_MS, internal.marketing.mail.sendStateUpdate, {
        id,
        state,
      });
    }
  },
});

export const assign = userMutation({
  ...inbox,
  args: { id: v.id("emails"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { id, userId }) => {
    const row = await requireRow(ctx, id);
    const now = Date.now();
    await ctx.db.patch(id, {
      assignedToUserId: userId,
      assignedAt: userId ? now : undefined,
      lastActivityAt: now,
      // picking it up is working on it
      state: userId && stateOf(row) === "open" ? "in_progress" : row.state,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "assigned",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
  },
});

/** A reply to the customer: shown on their inquiry page and mailed to them straight away. */
export const reply = userMutation({
  ...inbox,
  args: {
    id: v.id("emails"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, { id, body, attachments }) => {
    const row = await requireRow(ctx, id);
    const text = body.trim();
    if (!text && !attachments?.length) {
      throw new ConvexError({ code: "invalid", message: "Empty reply" });
    }
    const now = Date.now();
    const messageId = await ctx.db.insert("inquiryMessages", {
      inquiryId: id,
      author: "staff",
      staffUserId: ctx.caller.user._id,
      body: text.slice(0, 10000),
      attachments,
      via: "web",
      createdAt: now,
    });
    await ctx.db.patch(id, {
      state: "answered",
      // the reply mail says it all, so the "answered" status mail would only repeat it
      notifiedState: "answered",
      firstResponseAt: row.firstResponseAt ?? now,
      lastActivityAt: now,
      seenAt: row.seenAt ?? now,
      seenByUserId: row.seenByUserId ?? ctx.caller.user._id,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "reply",
      state: "answered",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.marketing.mail.sendReply, { id, messageId });
  },
});

export const generateUploadUrl = userMutation({
  ...inbox,
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Confirms (or moves) the callback slot; the customer gets the time, an .ics and change/cancel links. */
export const confirmCallback = userMutation({
  ...inbox,
  args: { id: v.id("emails"), at: v.number() },
  handler: async (ctx, { id, at }) => {
    const row = await requireRow(ctx, id);
    if (row.submissionType !== "callback") {
      throw new ConvexError({ code: "invalid", message: "Not a callback" });
    }
    const now = Date.now();
    await ctx.db.patch(id, {
      callbackStatus: "confirmed",
      callbackConfirmedAt: at,
      state: stateOf(row) === "open" ? "in_progress" : row.state,
      lastActivityAt: now,
      seenAt: row.seenAt ?? now,
      seenByUserId: row.seenByUserId ?? ctx.caller.user._id,
      firstResponseAt: row.firstResponseAt ?? now,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "callback_confirmed",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.marketing.mail.sendCallbackConfirmed, { id });
  },
});

export const cancelCallback = userMutation({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const row = await requireRow(ctx, id);
    if (row.callbackStatus === "cancelled") return;
    const now = Date.now();
    await ctx.db.patch(id, { callbackStatus: "cancelled", lastActivityAt: now });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "callback_cancelled",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.marketing.mail.sendCallbackCancelled, { id });
  },
});

/** Shown beside the "Website contact forms" flag: how many people get mailed when it goes back on. */
export const waitingCount = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => (await ctx.db.query("notifyEmails").take(1000)).length,
});
