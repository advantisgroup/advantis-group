import { v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc } from "../_generated/dataModel";
import { sha256hex } from "../lib/crypto";
import { internalAction, internalMutation, internalQuery } from "../functions";
import { internalApiFetch } from "../lib/internalApi";
import { inquiryStateValidator } from "../tables/marketing";
import { referenceFor } from "./inquiries";
import { buildIcs, inquiryTitleParts, legacyDesiredAt } from "./lib/inquiry";

/**
 * Mails the team's actions send to a customer — a status change, a reply, a
 * confirmed or cancelled callback, the forms reopening. Each goes out through
 * apps/api's `/internal/notifications` like every other transactional mail;
 * apps/api owns the templates and builds the links. See docs/inquiries.md.
 */

// how long the reschedule/cancel links in a callback mail keep working after the slot
const TOKEN_GRACE_MS = 24 * 60 * 60 * 1000;
const NOTIFY_BATCH = 50;

type Kind =
  | "inquiry-update"
  | "inquiry-reply"
  | "callback-confirmed"
  | "callback-cancelled"
  | "forms-reopened";

async function send(kind: Kind, to: string, data: Record<string, unknown>) {
  const res = await internalApiFetch("/internal/notifications", { kind, to, data });
  if (!res) {
    console.warn(`[inquiry-mail] skipping ${kind} to ${to} — API_URL/CONVEX_SERVER_KEY not set`);
    return false;
  }
  if (!res.ok) {
    console.error(`[inquiry-mail] ${kind} failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

const titleOf = (row: Doc<"emails">) => {
  const parts = inquiryTitleParts(row);
  return parts.kind === "text" || parts.kind === "subject" ? parts.text : undefined;
};

/** What every customer mail needs from the row. */
const common = (row: Doc<"emails">) => ({
  inquiryId: row._id,
  reference: referenceFor(row),
  firstName: row.firstName,
  locale: row.locale ?? "de",
  title: titleOf(row),
  submissionType: row.submissionType,
});

export const row = internalQuery({
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const found = await ctx.db.get(id);
    return found && !found.anonymizedAt ? found : null;
  },
});

export const markNotified = internalMutation({
  args: { id: v.id("emails"), state: inquiryStateValidator },
  handler: async (ctx, { id, state }) => {
    await ctx.db.patch(id, { notifiedState: state });
  },
});

export const setActionToken = internalMutation({
  args: { id: v.id("emails"), tokenHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, { id, tokenHash, expiresAt }) => {
    await ctx.db.patch(id, { actionTokenHash: tokenHash, actionTokenExpiresAt: expiresAt });
  },
});

export const staffName = internalQuery({
  args: { messageId: v.id("inquiryMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    const user = message?.staffUserId ? await ctx.db.get(message.staffUserId) : null;
    return { body: message?.body ?? "", staffName: user?.firstName ?? undefined };
  },
});

/**
 * Scheduled a few minutes after the team changes the state. Only sends if the
 * inquiry is still in that state and the customer hasn't already been told.
 */
export const sendStateUpdate = internalAction({
  args: { id: v.id("emails"), state: inquiryStateValidator },
  handler: async (ctx, { id, state }) => {
    const inquiry = await ctx.runQuery(internal.marketing.mail.row, { id });
    if (!inquiry || (inquiry.state ?? "open") !== state || inquiry.notifiedState === state) return;
    if (await send("inquiry-update", inquiry.email, { ...common(inquiry), state })) {
      await ctx.runMutation(internal.marketing.mail.markNotified, { id, state });
    }
  },
});

export const sendReply = internalAction({
  args: { id: v.id("emails"), messageId: v.id("inquiryMessages") },
  handler: async (ctx, { id, messageId }) => {
    const inquiry = await ctx.runQuery(internal.marketing.mail.row, { id });
    if (!inquiry) return;
    const { body, staffName } = await ctx.runQuery(internal.marketing.mail.staffName, {
      messageId,
    });
    await send("inquiry-reply", inquiry.email, { ...common(inquiry), body, staffName });
  },
});

async function mintToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { token, tokenHash: await sha256hex(token) };
}

export const sendCallbackConfirmed = internalAction({
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const inquiry = await ctx.runQuery(internal.marketing.mail.row, { id });
    const startAt = inquiry?.callbackConfirmedAt;
    if (!inquiry || !startAt) return;

    // minted here so the plain token only ever exists in the mail
    const { token, tokenHash } = await mintToken();
    await ctx.runMutation(internal.marketing.mail.setActionToken, {
      id,
      tokenHash,
      expiresAt: startAt + TOKEN_GRACE_MS,
    });
    await send("callback-confirmed", inquiry.email, {
      ...common(inquiry),
      startAt,
      timeZone: inquiry.timeZone,
      phone: inquiry.phone,
      token,
      ics: buildIcs({
        uid: inquiry._id,
        start: startAt,
        title: `ADVANTIS GROUP · ${referenceFor(inquiry)}`,
        description: inquiry.phone,
        method: "REQUEST",
      }),
    });
  },
});

export const sendCallbackCancelled = internalAction({
  args: { id: v.id("emails") },
  handler: async (ctx, { id }) => {
    const inquiry = await ctx.runQuery(internal.marketing.mail.row, { id });
    if (!inquiry) return;
    const startAt =
      inquiry.callbackConfirmedAt ??
      inquiry.desiredAt ??
      legacyDesiredAt(inquiry.desiredDateTime) ??
      undefined;
    await send("callback-cancelled", inquiry.email, {
      ...common(inquiry),
      startAt,
      timeZone: inquiry.timeZone,
      ics: startAt
        ? buildIcs({
            uid: inquiry._id,
            start: startAt,
            title: `ADVANTIS GROUP · ${referenceFor(inquiry)}`,
            method: "CANCEL",
            sequence: 1,
          })
        : undefined,
    });
  },
});

// --- Forms reopened ------------------------------------------------------------

export const notifyBatch = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("notifyEmails").take(NOTIFY_BATCH),
});

export const dropNotified = internalMutation({
  args: { ids: v.array(v.id("notifyEmails")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id);
  },
});

/**
 * "Tell me when the forms reopen" is a one-off promise: everyone on the list
 * gets one mail in their own language and then comes off it. Runs in
 * batches, scheduling itself until the list is empty.
 */
export const sendFormsReopened = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runQuery(internal.marketing.mail.notifyBatch, {});
    if (rows.length === 0) return;
    const sent: Doc<"notifyEmails">["_id"][] = [];
    for (const row of rows) {
      if (await send("forms-reopened", row.email, { locale: row.locale ?? "de" }))
        sent.push(row._id);
    }
    await ctx.runMutation(internal.marketing.mail.dropNotified, { ids: sent });
    // stop rather than loop if the API is down; the rest stay on the list for next time
    if (sent.length === rows.length && rows.length === NOTIFY_BATCH) {
      await ctx.scheduler.runAfter(0, internal.marketing.mail.sendFormsReopened, {});
    }
  },
});
