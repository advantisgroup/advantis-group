import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { serverUserQuery, userMutation, userQuery } from "../functions";
import { attachmentValidator } from "../lib/validators";
import { inquiryStateValidator } from "../tables/marketing";
import { checkAttachments, inquiryWatchers, referenceFor } from "./inquiries";
import {
  REF_MIN_LENGTH,
  formatReference,
  legacyDesiredAt,
  VIEWER_STALE_MS,
  normalizeTags,
  refCandidate,
  replyDueAt,
  sameCustomer,
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

const hasTag = (row: Doc<"emails">, tag: string | undefined) => !tag || !!row.tags?.includes(tag);

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
  args: {
    view: viewValidator,
    tag: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { view, tag, paginationOpts }) => {
    // the emails table grows without bound, so this pages newest-activity first
    const page = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt")
      .order("desc")
      .filter((q) => q.eq(q.field("anonymizedAt"), undefined))
      .paginate(paginationOpts);
    const rows = page.page.filter((row) => inView(row, view) && hasTag(row, tag));
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
    ...(row.tags ?? []).map((tag) => `#${tag}`),
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
  args: { q: v.string(), view: viewValidator, tag: v.optional(v.string()) },
  handler: async (ctx, { q, view, tag }) => {
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
      if (row.anonymizedAt !== undefined || !inView(row, view) || !hasTag(row, tag)) return false;
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
    const notes = await ctx.db
      .query("inquiryNotes")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", id))
      .take(500);
    const withUrls = (attachments: Doc<"inquiryMessages">["attachments"]) =>
      Promise.all(
        (attachments ?? []).map(async (attachment) => ({
          ...attachment,
          url: await ctx.storage.getUrl(attachment.storageId),
        })),
      );

    const referenceOfId = async (other: Id<"emails"> | undefined) => {
      const related = other ? await ctx.db.get(other) : null;
      return related ? { id: related._id, reference: referenceFor(related) } : undefined;
    };

    return {
      inquiry: forStaff(row),
      mergedInto: await referenceOfId(row.mergedIntoId),
      attachments: await withUrls(row.attachments),
      assigneeName: await userName(ctx, row.assignedToUserId),
      seenByName: await userName(ctx, row.seenByUserId),
      events: await Promise.all(
        events.map(async (event) => ({
          ...event,
          actorName: await userName(ctx, event.actorUserId),
          related: await referenceOfId(event.relatedInquiryId),
        })),
      ),
      messages: await Promise.all(
        messages.map(async (message) => ({
          ...message,
          staffName: await userName(ctx, message.staffUserId),
          attachments: await withUrls(message.attachments),
        })),
      ),
      notes: await Promise.all(
        notes.map(async (note) => ({
          ...note,
          authorName: await userName(ctx, note.authorUserId),
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
    const pickedUp = Boolean(userId) && stateOf(row) === "open";
    await ctx.db.patch(id, {
      assignedToUserId: userId,
      assignedAt: userId ? now : undefined,
      lastActivityAt: now,
      // picking it up is working on it
      state: pickedUp ? "in_progress" : row.state,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "assigned",
      actor: "staff",
      actorUserId: ctx.caller.user._id,
      at: now,
    });
    // the same "someone is on it" mail as setting the state; it goes out once either way
    if (pickedUp) {
      await ctx.scheduler.runAfter(STATE_MAIL_DELAY_MS, internal.marketing.mail.sendStateUpdate, {
        id,
        state: "in_progress",
      });
    }
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
    if (row.mergedIntoId) {
      throw new ConvexError({ code: "merged", message: "Reply on the inquiry it was merged into" });
    }
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

// --- Tags --------------------------------------------------------------------------

export const setTags = userMutation({
  ...inbox,
  args: { id: v.id("emails"), tags: v.array(v.string()) },
  handler: async (ctx, { id, tags }) => {
    await requireRow(ctx, id);
    const next = normalizeTags(tags);
    // labels are the team's own bookkeeping: no event, no activity bump, nothing for the customer
    await ctx.db.patch(id, { tags: next.length ? next : undefined });
    return next;
  },
});

/** Every tag in use on recent inquiries, most used first — the filter and the tag input's suggestions. */
export const tagSuggestions = userQuery({
  ...inbox,
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt")
      .order("desc")
      .take(SEARCH_SCAN);
    const counts = new Map<string, number>();
    for (const row of recent) {
      for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  },
});

// --- Internal notes ------------------------------------------------------------------

const MAX_NOTE_LENGTH = 5000;

async function requireOwnNote(ctx: QueryCtx, noteId: Id<"inquiryNotes">, userId: Id<"users">) {
  const note = await ctx.db.get(noteId);
  if (!note) throw new ConvexError({ code: "not_found", message: "Note not found" });
  if (note.authorUserId !== userId) {
    throw new ConvexError({ code: "forbidden", message: "Only the author can change a note" });
  }
  return note;
}

/** A note for the team only: never mailed, never on the customer's page. */
export const addNote = userMutation({
  ...inbox,
  args: { id: v.id("emails"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    const row = await requireRow(ctx, id);
    const text = body.trim();
    if (!text) throw new ConvexError({ code: "invalid", message: "Empty note" });
    const now = Date.now();
    await ctx.db.insert("inquiryNotes", {
      inquiryId: id,
      authorUserId: ctx.caller.user._id,
      body: text.slice(0, MAX_NOTE_LENGTH),
      createdAt: now,
    });
    // writing a note is looking at it
    if (!row.seenAt) await ctx.db.patch(id, { seenAt: now, seenByUserId: ctx.caller.user._id });
  },
});

export const editNote = userMutation({
  ...inbox,
  args: { noteId: v.id("inquiryNotes"), body: v.string() },
  handler: async (ctx, { noteId, body }) => {
    await requireOwnNote(ctx, noteId, ctx.caller.user._id);
    const text = body.trim();
    if (!text) throw new ConvexError({ code: "invalid", message: "Empty note" });
    await ctx.db.patch(noteId, { body: text.slice(0, MAX_NOTE_LENGTH), editedAt: Date.now() });
  },
});

// A hard delete, not the trash: a note is personal data about the customer, and
// erasure (which never sees trashed rows) has to be able to remove every one.
export const deleteNote = userMutation({
  ...inbox,
  args: { noteId: v.id("inquiryNotes") },
  handler: async (ctx, { noteId }) => {
    await requireOwnNote(ctx, noteId, ctx.caller.user._id);
    await ctx.db.delete(noteId);
  },
});

// --- Who else is on it ----------------------------------------------------------------

/**
 * "I have this open" (and "I'm writing a reply"), sent every few seconds by
 * the inquiry page. Also sweeps anyone on this inquiry who stopped beating.
 */
export const heartbeat = userMutation({
  ...inbox,
  args: { id: v.id("emails"), typing: v.boolean() },
  handler: async (ctx, { id, typing }) => {
    const now = Date.now();
    const userId = ctx.caller.user._id;
    const rows = await ctx.db
      .query("inquiryViewers")
      .withIndex("by_inquiry", (q) => q.eq("inquiryId", id))
      .take(50);
    const mine = rows.find((row) => row.userId === userId);
    if (mine) await ctx.db.patch(mine._id, { typing, at: now });
    else await ctx.db.insert("inquiryViewers", { inquiryId: id, userId, typing, at: now });
    for (const row of rows) {
      if (row.userId !== userId && row.at < now - VIEWER_STALE_MS) await ctx.db.delete(row._id);
    }
  },
});

export const leave = userMutation({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const mine = await ctx.db
      .query("inquiryViewers")
      .withIndex("by_inquiry_user", (q) => q.eq("inquiryId", id).eq("userId", ctx.caller.user._id))
      .first();
    if (mine) await ctx.db.delete(mine._id);
  },
});

/**
 * Everyone else with this inquiry open, with when they last beat. The page
 * drops anyone older than VIEWER_STALE_MS on its own clock: a query doesn't
 * re-run just because time passes.
 */
export const viewers = userQuery({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const rows = await ctx.db
      .query("inquiryViewers")
      .withIndex("by_inquiry", (q) => q.eq("inquiryId", id))
      .take(50);
    return await Promise.all(
      rows
        .filter((row) => row.userId !== ctx.caller.user._id)
        .map(async (row) => ({
          userId: row.userId,
          name: (await userName(ctx, row.userId)) ?? "",
          typing: row.typing,
          at: row.at,
        })),
    );
  },
});

// --- Same customer, and merging ----------------------------------------------------------

const RELATED_LIMIT = 20;

/** The customer's other inquiries: same address, same account. Newest first. */
export const related = userQuery({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const row = await requireRow(ctx, id);
    const candidates = new Map<Id<"emails">, Doc<"emails">>();
    const add = (rows: Doc<"emails">[]) =>
      rows.forEach((other) => candidates.set(other._id, other));

    for (const address of new Set([row.email, row.accountEmail].filter(Boolean))) {
      add(
        await ctx.db
          .query("emails")
          .withIndex("by_email_sentAt", (q) => q.eq("email", address))
          .order("desc")
          .take(RELATED_LIMIT),
      );
      add(
        await ctx.db
          .query("emails")
          .withIndex("by_accountEmail_sentAt", (q) => q.eq("accountEmail", address))
          .order("desc")
          .take(RELATED_LIMIT),
      );
    }
    if (row.clerkUserId) {
      add(
        await ctx.db
          .query("emails")
          .withIndex("by_clerkUserId_sentAt", (q) => q.eq("clerkUserId", row.clerkUserId))
          .order("desc")
          .take(RELATED_LIMIT),
      );
    }

    return [...candidates.values()]
      .filter(
        (other) => other._id !== id && other.anonymizedAt === undefined && sameCustomer(row, other),
      )
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, RELATED_LIMIT)
      .map((other) => ({
        ...forStaff(other),
        // what the merge button needs to know without another round trip
        mergeable: canMerge(other, row) === null,
      }));
  },
});

const ACTIVE_CALLBACK = new Set(["requested", "confirmed"]);

/** Why `source` can't be merged into `target`, or null if it can. */
function canMerge(source: Doc<"emails">, target: Doc<"emails">) {
  if (source._id === target._id) return "same";
  if (source.anonymizedAt !== undefined || target.anonymizedAt !== undefined) return "anonymized";
  if (source.mergedIntoId || target.mergedIntoId) return "already_merged";
  if (!sameCustomer(source, target)) return "different_customer";
  // a callback still waiting to happen has its own time, links and calendar invite
  if (
    source.submissionType === "callback" &&
    ACTIVE_CALLBACK.has(source.callbackStatus ?? "requested")
  ) {
    return "active_callback";
  }
  return null;
}

/**
 * Folds `id` into `into`: its message becomes the first customer message in
 * the target's thread (with its attachments), its replies and notes move
 * across, tags are combined, and `id` is closed with a pointer to `into`.
 * Only for two inquiries from the same customer; nothing is mailed.
 */
export const merge = userMutation({
  ...inbox,
  args: { id: v.id("emails"), into: v.id("emails") },
  handler: async (ctx, { id, into }) => {
    const source = await requireRow(ctx, id);
    const target = await requireRow(ctx, into);
    const refused = canMerge(source, target);
    if (refused) throw new ConvexError({ code: refused, message: `Can't merge: ${refused}` });

    const now = Date.now();
    const staffId = ctx.caller.user._id;

    const opening = [source.message.trim(), source.notes?.trim()].filter(Boolean).join("\n\n");
    if (opening || source.attachments?.length) {
      await ctx.db.insert("inquiryMessages", {
        inquiryId: into,
        author: "customer",
        body: opening,
        attachments: source.attachments,
        via: "web",
        createdAt: source.sentAt,
      });
    }
    for (const table of ["inquiryMessages", "inquiryNotes"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", id))
        .take(500);
      for (const doc of rows) await ctx.db.patch(doc._id, { inquiryId: into });
    }

    const sourceActive = ["open", "in_progress"].includes(stateOf(source));
    const targetDone = ["answered", "closed", "withdrawn"].includes(stateOf(target));
    const reopen = sourceActive && targetDone;
    const tags = normalizeTags([...(target.tags ?? []), ...(source.tags ?? [])]);
    await ctx.db.patch(into, {
      tags: tags.length ? tags : undefined,
      lastActivityAt: now,
      // an open question folded into a finished one is open again
      state: reopen ? "in_progress" : target.state,
    });
    await ctx.db.patch(id, {
      state: "closed",
      closedAt: now,
      lastActivityAt: now,
      mergedIntoId: into,
      // they live on the target's thread now; one owner, so erasure deletes each file once
      attachments: undefined,
      seenAt: source.seenAt ?? now,
      seenByUserId: source.seenByUserId ?? staffId,
    });

    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "merged",
      state: "closed",
      actor: "staff",
      actorUserId: staffId,
      relatedInquiryId: into,
      at: now,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: into,
      type: "merged_in",
      state: reopen ? "in_progress" : undefined,
      actor: "staff",
      actorUserId: staffId,
      relatedInquiryId: id,
      at: now,
    });
    return { into };
  },
});

// --- AI ----------------------------------------------------------------------------------

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} …` : text);
const iso = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

/**
 * What an AI summary or reply draft of one inquiry is given, for apps/api's
 * `/inquiries/:id/ai`. The customer's words, the thread and the team's notes;
 * never an address or phone number, which neither job needs. Built with the
 * asking person's own access (`manage_inquiries`).
 */
export const apiAiContext = serverUserQuery({
  ...inbox,
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const row = await requireRow(ctx, id);
    if (row.anonymizedAt !== undefined) {
      throw new ConvexError({
        code: "invalid",
        message: "Anonymized inquiries can't be summarized",
      });
    }
    const messages = await ctx.db
      .query("inquiryMessages")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", id))
      .take(100);
    const notes = await ctx.db
      .query("inquiryNotes")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", id))
      .take(50);
    const reference = referenceFor(row);
    const desiredAt = row.desiredAt ?? legacyDesiredAt(row.desiredDateTime) ?? undefined;

    const lines = [
      `Reference: ${reference}`,
      `Type: ${row.submissionType}${row.topicKey ? ` (${row.topicKey})` : row.topic ? ` (${row.topic})` : ""}`,
      `Received: ${iso(row.sentAt)} UTC`,
      `Status: ${stateOf(row)}`,
      `Customer: ${`${row.firstName} ${row.lastName}`.trim() || "(no name)"}${row.company ? `, ${row.company}` : ""}`,
      `Customer's language: ${row.locale ?? "de"}`,
      ...(row.subject ? [`Subject: ${clip(row.subject, 300)}`] : []),
      ...(desiredAt
        ? [
            `Callback requested for: ${iso(desiredAt)} UTC (${row.callbackStatus ?? "requested"}${
              row.callbackConfirmedAt ? `, confirmed for ${iso(row.callbackConfirmedAt)} UTC` : ""
            })`,
          ]
        : []),
      ...(row.tags?.length ? [`Team tags: ${row.tags.join(", ")}`] : []),
      "",
      "Customer's message:",
      clip([row.message, row.notes].filter((part) => part?.trim()).join("\n\n") || "(empty)", 6000),
    ];
    for (const message of messages) {
      const who =
        message.author === "staff"
          ? `Team (${(await userName(ctx, message.staffUserId)) ?? "someone"})`
          : "Customer";
      lines.push("", `${who}, ${iso(message.createdAt)} UTC:`, clip(message.body, 4000));
    }
    if (notes.length) {
      lines.push("", "Internal team notes (never shown to the customer):");
      for (const note of notes) {
        lines.push(`- ${iso(note.createdAt)} UTC: ${clip(note.body, 1000)}`);
      }
    }

    return {
      reference,
      locale: row.locale ?? "de",
      firstName: row.firstName,
      text: lines.join("\n"),
      href: `/inquiries/${id}`,
      sources: [{ label: `Anfrage ${reference}`, href: `/inquiries/${id}` }],
    };
  },
});
