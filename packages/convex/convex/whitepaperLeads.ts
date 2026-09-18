import { v } from "convex/values";

import { mutation } from "./functions";

/**
 * Double opt-in lead capture for the marketing site's whitepaper page.
 *
 * Called server-to-server from `apps/marketing`'s `/api/whitepaper` routes —
 * the same shape as `emails.ts` — so the token itself is minted, hashed and
 * mailed there and only its digest ever reaches Convex.
 */

const leadFields = {
  email: v.string(),
  company: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  phone: v.string(),
  locale: v.string(),
  consentVersion: v.string(),
  confirmTokenHash: v.string(),
  confirmTokenExpiresAt: v.number(),
  requestIp: v.optional(v.string()),
};

/**
 * How long after a confirmation mail the same address stops earning another
 * one. Anyone can type any address into the form, so without this the form is
 * a mail cannon pointed at whoever they name.
 */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Records a request and arms its confirmation token. An address already on
 * file keeps its row (and its confirmation history) and has its details and
 * token refreshed, so re-submitting the form never forks a lead in two.
 *
 * Inside the cooldown the token is deliberately left alone: the caller skips
 * the mail, and the link already sitting in the recipient's inbox stays the
 * one that works.
 */
export const saveRequest = mutation({
  args: leadFields,
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const now = Date.now();

    const existing = await ctx.db
      .query("whitepaperLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      const throttled = (existing.confirmationSentAt ?? 0) > now - RESEND_COOLDOWN_MS;
      const { confirmTokenHash, confirmTokenExpiresAt, ...details } = args;

      await ctx.db.patch(existing._id, {
        ...(throttled ? details : args),
        email,
        requestedAt: now,
      });

      return { leadId: existing._id, throttled };
    }

    const leadId = await ctx.db.insert("whitepaperLeads", {
      ...args,
      email,
      status: "pending",
      requestedAt: now,
    });

    return { leadId, throttled: false };
  },
});

export const markConfirmationSent = mutation({
  args: {
    leadId: v.id("whitepaperLeads"),
    emailId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      confirmationSentAt: Date.now(),
      confirmationEmailId: args.emailId,
    });
  },
});

/**
 * Redeems a confirmation token.
 *
 * `alreadyDelivered` is what a second click on the same link gets: the lead
 * stays confirmed but the document is not mailed again, so the link can't be
 * replayed into a stream of mail. A confirmed lead whose delivery failed is
 * deliberately *not* in that state — it confirms again so the send retries.
 */
export const confirmRequest = mutation({
  args: {
    confirmTokenHash: v.string(),
    confirmIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("whitepaperLeads")
      .withIndex("by_confirmTokenHash", (q) => q.eq("confirmTokenHash", args.confirmTokenHash))
      .first();

    if (!lead) {
      return { status: "invalid" as const };
    }

    if ((lead.confirmTokenExpiresAt ?? 0) < Date.now()) {
      return { status: "expired" as const };
    }

    if (lead.deliveredAt) {
      return { status: "alreadyDelivered" as const, email: lead.email };
    }

    await ctx.db.patch(lead._id, {
      status: "confirmed",
      confirmedAt: lead.confirmedAt ?? Date.now(),
      confirmIp: args.confirmIp,
    });

    return {
      status: "confirmed" as const,
      leadId: lead._id,
      email: lead.email,
      company: lead.company,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      locale: lead.locale,
    };
  },
});

export const markDelivered = mutation({
  args: {
    leadId: v.id("whitepaperLeads"),
    emailId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      deliveredAt: args.error ? undefined : Date.now(),
      deliveryEmailId: args.emailId,
      deliveryError: args.error,
    });
  },
});
