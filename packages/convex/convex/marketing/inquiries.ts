import { ConvexError, v, type Infer } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { serverMutation, serverQuery } from "../functions";
import { effectiveCustomRoleIds } from "../lib/auth";
import { notifyUsers } from "../lib/notify";
import { attachmentValidator } from "../lib/validators";
import { failureReasonValidator } from "../tables/marketing";
import {
  CUSTOMER_TRANSITIONS,
  classifyBounce,
  REF_MIN_LENGTH,
  refCandidate,
  referenceOf,
  isWithinCallbackHours,
  legacyDesiredAt,
} from "./lib/inquiry";

/**
 * The customer's side of a website inquiry, called server-to-server by
 * apps/marketing's API with the server key (the browser never talks to these
 * directly). Customers aren't intranet users, so there's no `ctx.caller`:
 * the API passes who they are as `account` — their Clerk id and every
 * verified address — and every read checks the row belongs to one of them.
 * See docs/inquiries.md.
 */

const accountValidator = v.object({ clerkUserId: v.string(), emails: v.array(v.string()) });
type Account = Infer<typeof accountValidator>;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const ALLOWED_TYPES =
  /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword)$/;

const owns = (row: Doc<"emails">, account: Account) =>
  (row.clerkUserId !== "" && row.clerkUserId === account.clerkUserId) ||
  account.emails.includes(row.accountEmail) ||
  account.emails.includes(row.email.toLowerCase());

async function ownedRow(ctx: QueryCtx, id: string, account: Account) {
  const inquiryId = ctx.db.normalizeId("emails", id);
  const row = inquiryId ? await ctx.db.get(inquiryId) : null;
  return row && owns(row, account) ? row : null;
}

async function requireOwnedRow(ctx: QueryCtx, id: string, account: Account) {
  const row = await ownedRow(ctx, id, account);
  if (!row) throw new ConvexError({ code: "not_found", message: "Inquiry not found" });
  return row;
}

/**
 * Who hears about new inquiries: admins, plus anyone whose custom role grants
 * `manage_inquiries` explicitly. Managers can open the inbox too (they hold
 * every capability) but aren't pinged for every website form.
 */
export async function inquiryWatchers(ctx: QueryCtx): Promise<Id<"users">[]> {
  const roles = await ctx.db.query("customRoles").collect();
  const granting = new Set(
    roles.filter((role) => role.capabilities.includes("manage_inquiries")).map((r) => r._id),
  );
  const users = await ctx.db.query("users").collect();
  return users
    .filter(
      (user) =>
        user.status === "active" &&
        (user.role === "admin" || effectiveCustomRoleIds(user).some((id) => granting.has(id))),
    )
    .map((user) => user._id);
}

/** The assignee if there is one, otherwise everyone who watches the inbox. */
async function notifyTeam(
  ctx: MutationCtx,
  row: Doc<"emails">,
  args: { title: string; body?: string },
) {
  const recipients = row.assignedToUserId ? [row.assignedToUserId] : await inquiryWatchers(ctx);
  await notifyUsers(ctx, recipients, {
    type: "inquiry_new",
    link: `/inquiries/${row._id}`,
    ...args,
  });
}

const personName = (row: Pick<Doc<"emails">, "firstName" | "lastName">) =>
  `${row.firstName} ${row.lastName}`.trim();

export const referenceFor = (row: Pick<Doc<"emails">, "ref" | "_id">) => referenceOf(row);

/**
 * Stores the inquiry's reference: the last REF_MIN_LENGTH characters of its
 * id, or one more for as long as another inquiry already answers to that —
 * whether it has a stored ref or is an older inquiry from before refs were
 * stored that already shows those six characters. Runs inside the creating mutation, so two
 * inquiries can't race to the same one.
 */
export async function assignRef(
  ctx: MutationCtx,
  id: Id<"emails">,
  // a batch migration passes this in once instead of re-reading it per row
  unstoredRows?: Doc<"emails">[],
) {
  const unstored =
    unstoredRows ??
    (await ctx.db
      .query("emails")
      .withIndex("by_ref", (q) => q.eq("ref", undefined))
      .take(2000));
  const created = (await ctx.db.get(id))?._creationTime ?? Date.now();
  for (let length = REF_MIN_LENGTH; length <= id.length; length++) {
    const candidate = refCandidate(id, length);
    const taken =
      (await ctx.db
        .query("emails")
        .withIndex("by_ref", (q) => q.eq("ref", candidate))
        .first()) ??
      // an older row without a stored ref already shows this; a newer one will yield to us
      unstored.find(
        (row) => row._creationTime < created && refCandidate(row._id, REF_MIN_LENGTH) === candidate,
      );
    if (!taken) {
      await ctx.db.patch(id, { ref: candidate });
      return candidate;
    }
  }
  // unreachable: the whole id is unique
  await ctx.db.patch(id, { ref: id.toLowerCase() });
  return id.toLowerCase();
}

/**
 * What a customer may see of their own row. Never the provider's raw error
 * text and never a staff member's id — staff appear by first name only.
 */
function forCustomer(row: Doc<"emails">) {
  return {
    _id: row._id,
    reference: referenceFor(row),
    submissionType: row.submissionType,
    subject: row.subject,
    message: row.message,
    notes: row.notes,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    company: row.company,
    topic: row.topic,
    topicKey: row.topicKey,
    accountEmail: row.accountEmail,
    locale: row.locale,
    sentAt: row.sentAt,
    lastActivityAt: row.lastActivityAt ?? row.sentAt,
    state: row.state ?? "open",
    seenAt: row.seenAt,
    firstResponseAt: row.firstResponseAt,
    closedAt: row.closedAt,
    desiredAt: row.desiredAt ?? legacyDesiredAt(row.desiredDateTime) ?? undefined,
    timeZone: row.timeZone,
    callbackStatus:
      row.callbackStatus ?? (row.submissionType === "callback" ? "requested" : undefined),
    callbackConfirmedAt: row.callbackConfirmedAt,
    delivery: {
      status: row.status,
      attempts: row.attempts ?? 1,
      lastAttemptAt: row.lastAttemptAt ?? row.sentAt,
      deliveredAt: row.deliveredAt,
      failureReason: row.failureReason,
    },
    copy: {
      status: row.copyStatus,
      skipReason: row.copySkipReason,
      failureReason: row.copyFailureReason,
      deliveredAt: row.copyDeliveredAt,
    },
    attachments: row.attachments ?? [],
  };
}

export type CustomerInquiry = ReturnType<typeof forCustomer>;

const staffFirstName = async (ctx: QueryCtx, userId: Id<"users"> | undefined) => {
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  return user?.firstName ?? undefined;
};

export async function checkAttachments(
  ctx: QueryCtx,
  attachments: Infer<typeof attachmentValidator>[] | undefined,
) {
  if (!attachments?.length) return;
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new ConvexError({ code: "invalid", message: "Too many attachments" });
  }
  for (const attachment of attachments) {
    const file = await ctx.db.system.get(attachment.storageId);
    if (!file) throw new ConvexError({ code: "invalid", message: "Attachment not found" });
    if (file.size > MAX_ATTACHMENT_BYTES || !ALLOWED_TYPES.test(file.contentType ?? "")) {
      throw new ConvexError({ code: "invalid", message: "Attachment not allowed" });
    }
  }
}

// --- Writing -------------------------------------------------------------------

export const createInquiry = serverMutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    company: v.optional(v.string()),
    submissionType: v.union(v.literal("message"), v.literal("callback"), v.literal("other")),
    topic: v.optional(v.string()),
    topicKey: v.optional(
      v.union(v.literal("withdrawal"), v.literal("question"), v.literal("legal")),
    ),
    desiredAt: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    notes: v.optional(v.string()),
    locale: v.string(),
    accountEmail: v.string(),
    accountName: v.string(),
    clerkUserId: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    await checkAttachments(ctx, args.attachments);
    const last = await ctx.db.query("emails").withIndex("by_nr").order("desc").first();
    const nr = (last?.nr ?? 0) + 1;
    const now = Date.now();

    const id = await ctx.db.insert("emails", {
      ...args,
      email: args.email.trim().toLowerCase(),
      accountEmail: args.accountEmail.trim().toLowerCase(),
      nr,
      sentAt: now,
      lastActivityAt: now,
      status: "queued",
      attempts: 0,
      state: "open",
      callbackStatus: args.submissionType === "callback" ? "requested" : undefined,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: id,
      type: "created",
      state: "open",
      actor: "customer",
      at: now,
    });

    await assignRef(ctx, id);

    const row = (await ctx.db.get(id))!;
    const reference = referenceFor(row);
    await notifyTeam(ctx, row, {
      title: "New website inquiry",
      body: `${reference} · ${personName(row)}${row.company ? ` · ${row.company}` : ""}`,
    });
    return { id, nr, reference };
  },
});

/** Records one attempt at the team mail. A retry updates the same row, never a new one. */
export const markTeamDelivery = serverMutation({
  args: {
    id: v.id("emails"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    failureReason: v.optional(failureReasonValidator),
  },
  handler: async (ctx, { id, status, messageId, error, failureReason }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    const now = Date.now();
    const attempts = (row.attempts ?? 0) + 1;

    await ctx.db.patch(id, {
      status,
      attempts,
      lastAttemptAt: now,
      messageId: messageId ?? row.messageId,
      error: status === "failed" ? error : undefined,
      failureReason: status === "failed" ? (failureReason ?? "unknown") : undefined,
    });
    if (status === "sent" && attempts > 1) {
      await ctx.db.insert("inquiryEvents", {
        inquiryId: id,
        type: "resent",
        actor: "customer",
        at: now,
      });
    }
  },
});

export const markReceiptDelivery = serverMutation({
  args: {
    id: v.id("emails"),
    copyStatus: v.union(v.literal("sent"), v.literal("skipped"), v.literal("failed")),
    copySkipReason: v.optional(v.union(v.literal("limit"), v.literal("preference"))),
    copyFailureReason: v.optional(failureReasonValidator),
    copyEmailId: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    if (await ctx.db.get(id)) await ctx.db.patch(id, fields);
  },
});

// only ever forward: a late "sent" webhook mustn't undo a "delivered"
const DELIVERY_RANK = { queued: 0, sent: 1, delayed: 2, delivered: 3, bounced: 4, failed: 4 };

/**
 * Resend's delivery webhooks, matched to an inquiry by the `inquiry_id` and
 * `mail` tags both submission mails carry. Called by apps/api /webhooks/resend.
 */
export const apiRecordMailEvent = serverMutation({
  args: {
    inquiryId: v.string(),
    mail: v.union(v.literal("team"), v.literal("receipt")),
    eventType: v.string(),
    bounceType: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (ctx, { inquiryId, mail, eventType, bounceType, occurredAt }) => {
    const id = ctx.db.normalizeId("emails", inquiryId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return { ok: false };

    const next = (
      {
        "email.sent": "sent",
        "email.delivery_delayed": "delayed",
        "email.delivered": "delivered",
        "email.bounced": "bounced",
      } as const
    )[eventType];
    if (!next) return { ok: true };

    const current = mail === "team" ? row.status : (row.copyStatus ?? "sent");
    if (current === "skipped" || DELIVERY_RANK[next] <= DELIVERY_RANK[current]) {
      return { ok: true };
    }

    const reason = next === "bounced" ? classifyBounce({ type: bounceType }) : undefined;
    await ctx.db.patch(
      row._id,
      mail === "team"
        ? {
            status: next,
            deliveredAt: next === "delivered" ? occurredAt : row.deliveredAt,
            failureReason: reason ?? (next === "delayed" ? "temporary" : row.failureReason),
          }
        : {
            copyStatus: next,
            copyDeliveredAt: next === "delivered" ? occurredAt : row.copyDeliveredAt,
            copyFailureReason: reason ?? (next === "delayed" ? "temporary" : row.copyFailureReason),
          },
    );
    return { ok: true };
  },
});

export const setStateByCustomer = serverMutation({
  args: {
    account: accountValidator,
    id: v.string(),
    action: v.union(v.literal("withdraw"), v.literal("resolve"), v.literal("reopen")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { account, id, action, note }) => {
    const row = await requireOwnedRow(ctx, id, account);
    const from = row.state ?? "open";
    const { from: allowed, to } = CUSTOMER_TRANSITIONS[action];
    if (!allowed.includes(from)) {
      throw new ConvexError({ code: "invalid_state", message: `Can't ${action} from ${from}` });
    }
    const now = Date.now();

    await ctx.db.patch(row._id, {
      state: to,
      lastActivityAt: now,
      closedAt: to === "closed" ? now : row.closedAt,
      callbackStatus:
        action === "withdraw" && row.submissionType === "callback"
          ? "cancelled"
          : row.callbackStatus,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: row._id,
      type: action === "withdraw" ? "withdrawn" : "state",
      state: to,
      actor: "customer",
      at: now,
    });
    if (note?.trim()) {
      await ctx.db.insert("inquiryMessages", {
        inquiryId: row._id,
        author: "customer",
        body: note.trim().slice(0, 5000),
        via: "web",
        createdAt: now,
      });
    }

    const verb = { withdraw: "withdrew", resolve: "closed", reopen: "reopened" }[action];
    await notifyTeam(ctx, row, {
      title: `${personName(row)} ${verb} ${referenceFor(row)}`,
      body: note?.trim().slice(0, 120),
    });
    return { state: to };
  },
});

export const addCustomerMessage = serverMutation({
  args: {
    account: accountValidator,
    id: v.string(),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, { account, id, body, attachments }) => {
    const row = await requireOwnedRow(ctx, id, account);
    if (row.state === "withdrawn") {
      throw new ConvexError({ code: "invalid_state", message: "This inquiry was withdrawn" });
    }
    const text = body.trim();
    if (!text && !attachments?.length) {
      throw new ConvexError({ code: "invalid", message: "Empty message" });
    }
    await checkAttachments(ctx, attachments);
    const now = Date.now();

    await ctx.db.insert("inquiryMessages", {
      inquiryId: row._id,
      author: "customer",
      body: text.slice(0, 5000),
      attachments,
      via: "web",
      createdAt: now,
    });
    const reopened = row.state === "answered" || row.state === "closed";
    await ctx.db.patch(row._id, {
      lastActivityAt: now,
      state: reopened ? "in_progress" : row.state,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: row._id,
      type: "customer_reply",
      state: reopened ? "in_progress" : undefined,
      actor: "customer",
      at: now,
    });
    await notifyTeam(ctx, row, {
      title: `${personName(row)} replied on ${referenceFor(row)}`,
      body: text.slice(0, 120),
    });
  },
});

/**
 * A customer answering one of our mails from their mail client (apps/api
 * /webhooks/resend, after checking the signed reply address). Only accepted
 * from an address the inquiry already knows, so a forwarded mail can't post
 * into someone else's thread.
 */
export const apiAddInboundReply = serverMutation({
  args: { inquiryId: v.string(), from: v.string(), body: v.string() },
  handler: async (ctx, { inquiryId, from, body }) => {
    const id = ctx.db.normalizeId("emails", inquiryId);
    const row = id ? await ctx.db.get(id) : null;
    const sender = /<([^>]+)>/.exec(from)?.[1] ?? from;
    const known = [row?.email, row?.accountEmail].filter(Boolean);
    if (!row || !known.includes(sender.trim().toLowerCase()) || !body.trim()) {
      return { accepted: false };
    }
    const now = Date.now();
    await ctx.db.insert("inquiryMessages", {
      inquiryId: row._id,
      author: "customer",
      body: body.trim().slice(0, 5000),
      via: "email",
      createdAt: now,
    });
    const reopened = row.state === "answered" || row.state === "closed";
    await ctx.db.patch(row._id, {
      lastActivityAt: now,
      state: reopened ? "in_progress" : row.state,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: row._id,
      type: "customer_reply",
      state: reopened ? "in_progress" : undefined,
      actor: "customer",
      at: now,
    });
    await notifyTeam(ctx, row, {
      title: `${personName(row)} replied on ${referenceFor(row)}`,
      body: body.trim().slice(0, 120),
    });
    return { accepted: true };
  },
});

export const generateUploadUrl = serverMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

// --- Reading -------------------------------------------------------------------

/**
 * Everything the account sent: rows linked to the Clerk id, rows sent while
 * signed in with one of its addresses, and rows sent signed out *from* one of
 * them (those land in the same inbox, so nothing new is revealed). Changing
 * the primary address in Clerk no longer hides history.
 */
export const listForAccount = serverQuery({
  args: { account: accountValidator, limit: v.optional(v.number()) },
  handler: async (ctx, { account, limit: requested }) => {
    const limit = Math.min(Math.max(requested ?? 50, 1), 200);
    const sources: Doc<"emails">[][] = [];

    if (account.clerkUserId) {
      sources.push(
        await ctx.db
          .query("emails")
          .withIndex("by_clerkUserId_sentAt", (q) => q.eq("clerkUserId", account.clerkUserId))
          .order("desc")
          .take(limit + 1),
      );
    }
    for (const email of account.emails) {
      for (const index of ["by_accountEmail_sentAt", "by_email_sentAt"] as const) {
        const field = index === "by_accountEmail_sentAt" ? "accountEmail" : "email";
        sources.push(
          await ctx.db
            .query("emails")
            .withIndex(index, (q) => q.eq(field, email))
            .order("desc")
            .take(limit + 1),
        );
      }
    }

    const merged = new Map<Id<"emails">, Doc<"emails">>();
    for (const rows of sources) for (const row of rows) merged.set(row._id, row);
    const sorted = [...merged.values()].sort((a, b) => b.sentAt - a.sentAt);

    return {
      submissions: sorted.slice(0, limit).map(forCustomer),
      hasMore: sorted.length > limit || sources.some((rows) => rows.length > limit),
    };
  },
});

export const getForAccount = serverQuery({
  args: { account: accountValidator, id: v.string() },
  handler: async (ctx, { account, id }) => {
    const row = await ownedRow(ctx, id, account);
    if (!row) return null;

    const events = await ctx.db
      .query("inquiryEvents")
      .withIndex("by_inquiry_at", (q) => q.eq("inquiryId", row._id))
      .take(200);
    const messages = await ctx.db
      .query("inquiryMessages")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", row._id))
      .take(500);

    return {
      inquiry: forCustomer(row),
      seenBy: await staffFirstName(ctx, row.seenByUserId),
      assignee: await staffFirstName(ctx, row.assignedToUserId),
      events: await Promise.all(
        events.map(async (event) => ({
          type: event.type,
          state: event.state,
          actor: event.actor,
          staffName: await staffFirstName(ctx, event.actorUserId),
          at: event.at,
        })),
      ),
      messages: await Promise.all(
        messages.map(async (message) => ({
          _id: message._id,
          author: message.author,
          staffName: await staffFirstName(ctx, message.staffUserId),
          body: message.body,
          attachments: message.attachments ?? [],
          via: message.via,
          createdAt: message.createdAt,
        })),
      ),
    };
  },
});

/** The full stored row, for the API to re-send a failed team mail. Never goes to the browser. */
export const getOwnedRow = serverQuery({
  args: { account: accountValidator, id: v.string() },
  handler: async (ctx, { account, id }) => await ownedRow(ctx, id, account),
});

/** A short-lived link to one attachment, if it's on this account's inquiry. */
export const attachmentUrlForAccount = serverQuery({
  args: { account: accountValidator, id: v.string(), storageId: v.string() },
  handler: async (ctx, { account, id, storageId }) => {
    const row = await ownedRow(ctx, id, account);
    if (!row) return null;
    const messages = await ctx.db
      .query("inquiryMessages")
      .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", row._id))
      .take(500);
    const known = [...(row.attachments ?? []), ...messages.flatMap((m) => m.attachments ?? [])];
    const match = known.find((attachment) => attachment.storageId === storageId);
    return match ? await ctx.storage.getUrl(match.storageId) : null;
  },
});

// --- Callback links (work signed out) --------------------------------------------

async function rowForToken(ctx: QueryCtx, tokenHash: string) {
  const row = await ctx.db
    .query("emails")
    .withIndex("by_actionTokenHash", (q) => q.eq("actionTokenHash", tokenHash))
    .first();
  if (!row || (row.actionTokenExpiresAt ?? 0) < Date.now()) return null;
  return row;
}

export const getByActionToken = serverQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await rowForToken(ctx, tokenHash);
    if (!row) return null;
    return {
      reference: referenceFor(row),
      firstName: row.firstName,
      locale: row.locale,
      state: row.state ?? "open",
      callbackStatus: row.callbackStatus ?? "requested",
      desiredAt: row.desiredAt ?? legacyDesiredAt(row.desiredDateTime) ?? undefined,
      callbackConfirmedAt: row.callbackConfirmedAt,
      timeZone: row.timeZone,
    };
  },
});

export const cancelByToken = serverMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await rowForToken(ctx, tokenHash);
    if (!row) return { status: "invalid" as const };
    if (row.callbackStatus === "cancelled") return { status: "cancelled" as const };
    const now = Date.now();
    const open = row.state === undefined || row.state === "open" || row.state === "in_progress";

    await ctx.db.patch(row._id, {
      callbackStatus: "cancelled",
      state: open ? "withdrawn" : row.state,
      lastActivityAt: now,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: row._id,
      type: "callback_cancelled",
      state: open ? "withdrawn" : undefined,
      actor: "customer",
      at: now,
    });
    await notifyTeam(ctx, row, { title: `${personName(row)} cancelled their callback` });
    return { status: "cancelled" as const };
  },
});

export const rescheduleByToken = serverMutation({
  args: { tokenHash: v.string(), desiredAt: v.number(), timeZone: v.optional(v.string()) },
  handler: async (ctx, { tokenHash, desiredAt, timeZone }) => {
    const row = await rowForToken(ctx, tokenHash);
    if (!row) return { status: "invalid" as const };
    if (desiredAt < Date.now() || !isWithinCallbackHours(desiredAt)) {
      return { status: "outside_hours" as const };
    }
    const now = Date.now();

    await ctx.db.patch(row._id, {
      desiredAt,
      timeZone: timeZone ?? row.timeZone,
      callbackStatus: "requested",
      callbackConfirmedAt: undefined,
      state: row.state === "withdrawn" ? "open" : row.state,
      lastActivityAt: now,
    });
    await ctx.db.insert("inquiryEvents", {
      inquiryId: row._id,
      type: "callback_rescheduled",
      actor: "customer",
      at: now,
    });
    await notifyTeam(ctx, row, { title: `${personName(row)} asked for another callback time` });
    return { status: "requested" as const };
  },
});

// --- Accounts ----------------------------------------------------------------------

/**
 * Clerk `user.deleted` from outside the account page (e.g. the Clerk
 * dashboard): unlink the rows but keep the correspondence with the team.
 * Deleting from /account/privacy erases instead — see marketing/account.ts.
 */
export const detachAccount = serverMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    if (!clerkUserId) return { detached: 0 };
    const rows = await ctx.db
      .query("emails")
      .withIndex("by_clerkUserId_sentAt", (q) => q.eq("clerkUserId", clerkUserId))
      .take(1000);
    for (const row of rows) {
      await ctx.db.patch(row._id, { clerkUserId: "", accountEmail: "", accountName: "" });
    }
    return { detached: rows.length };
  },
});
