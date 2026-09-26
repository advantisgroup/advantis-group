import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { attachmentValidator } from "../lib/validators";
import { inquiryStateValidator } from "../tables/marketing";
import { checkAttachments, inquiryWatchers, referenceFor } from "./inquiries";
import {
  REF_MIN_LENGTH,
  formatReference,
  legacyDesiredAt,
  refCandidate,
  replyDueAt,
} from "./lib/inquiry";

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

/**
 * Whatever someone has in hand for an inquiry: its id, its reference
 * ("#841KGR", "841kgr"), or one of the "AG-0042" numbers a few early mails
 * carried.
 */
export async function findByReference(ctx: QueryCtx, input: string) {
  const raw = input.trim();
  const byId = ctx.db.normalizeId("emails", raw);
  if (byId) return await ctx.db.get(byId);

  const code = raw.replace(/^#/, "").trim().toLowerCase();
  if (/^[a-z0-9]{4,}$/.test(code)) {
    const stored = await ctx.db
      .query("emails")
      .withIndex("by_ref", (q) => q.eq("ref", code))
      .first();
    if (stored) return stored;
    // rows from before refs were stored answer to the first six characters of their id's end
    if (code.length === REF_MIN_LENGTH) {
      const unstored = await ctx.db
        .query("emails")
        .withIndex("by_ref", (q) => q.eq("ref", undefined))
        .take(2000);
      const legacy = unstored.find((row) => refCandidate(row._id, REF_MIN_LENGTH) === code);
      if (legacy) return legacy;
    }
  }

  const numbered = /^(?:ag[-\s]?)?0*(\d+)$/.exec(code);
  if (numbered) {
    return await ctx.db
      .query("emails")
      .withIndex("by_nr", (q) => q.eq("nr", Number(numbered[1])))
      .first();
  }
  return null;
}

// how far back search reads; a website inbox this size is years of inquiries
const SEARCH_SCAN = 1000;
const SEARCH_LIMIT = 50;

const digits = (value: string) => value.replace(/\D/g, "");
/** A phone's digits, plus its German domestic form ("+49 911 …" → "0911…"), as people type both. */
const phoneForms = (phone: string | undefined) => {
  if (!phone) return [];
  const all = digits(phone).replace(/^00/, "");
  return all.startsWith("49") ? [all, `0${all.slice(2)}`] : [all];
};
const isPhoneLike = (term: string) => /^[\d\s+()/.-]+$/.test(term) && digits(term).length >= 3;

/** Everything someone might type to find an inquiry, lowercased into one string. */
function haystack(row: Doc<"emails">) {
  return [
    referenceFor(row),
    row.nr !== undefined ? formatReference(row.nr) : "",
    row._id,
    row.firstName,
    row.lastName,
    row.email,
    row.accountEmail,
    row.company,
    row.phone,
    ...phoneForms(row.phone),
    row.subject,
    row.topic,
    row.message,
    row.notes,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

/**
 * Search by reference (whole or partial), id, name, address, company, phone
 * or anything in the message. Every word typed has to match somewhere. Reads
 * the most recent SEARCH_SCAN inquiries; an exact reference or id is found
 * however old it is.
 */
export const search = userQuery({
  ...inbox,
  args: { q: v.string(), view: viewValidator },
  handler: async (ctx, { q, view }) => {
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/^#/, ""))
      .filter(Boolean);
    if (!terms.length) return { results: [], truncated: false };

    const recent = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt")
      .order("desc")
      .take(SEARCH_SCAN);
    const exact = await findByReference(ctx, q);

    const matches = recent.filter((row) => {
      if (row.anonymizedAt !== undefined || !inView(row, view)) return false;
      const text = haystack(row);
      // a phone typed with other punctuation ("0911/377-") also matches the stored phone's digits
      return terms.every(
        (term) => text.includes(term) || (isPhoneLike(term) && text.includes(digits(term))),
      );
    });
    if (
      exact &&
      exact.anonymizedAt === undefined &&
      !matches.some((row) => row._id === exact._id)
    ) {
      matches.unshift(exact);
    }

    const results = await Promise.all(
      matches.slice(0, SEARCH_LIMIT).map(async (row) => ({
        ...forStaff(row),
        assigneeName: await userName(ctx, row.assignedToUserId),
      })),
    );
    return { results, truncated: recent.length === SEARCH_SCAN };
  },
});

export const get = userQuery({
  ...inbox,
  // an id, or a reference pasted into the URL (/inquiries/AG-0042, /inquiries/841kgr)
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const row = await findByReference(ctx, args.id);
    if (!row) return null;
    const id = row._id;
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
    await checkAttachments(ctx, attachments);
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

/** Who an inquiry can be handed to: the same people who hear about new ones. */
export const staff = userQuery({
  ...inbox,
  args: {},
  handler: async (ctx) => {
    const ids = await inquiryWatchers(ctx);
    const rows = await Promise.all(
      ids.map(async (id) => ({ id, name: (await userName(ctx, id)) ?? "" })),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Shown beside the "Website contact forms" flag: how many people get mailed when it goes back on. */
export const waitingCount = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => (await ctx.db.query("notifyEmails").take(1000)).length,
});
