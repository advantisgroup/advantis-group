import { serverMutation } from "../functions";
import { v } from "convex/values";

/**
 * Everything here is called server-to-server from apps/marketing's API with
 * the Convex server key. They used to be plain public functions, which meant
 * anyone with the (public) Convex URL could read someone's inquiries by email
 * or edit the notify list directly, skipping every check the API does.
 */

export const saveNotifyEmail = serverMutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notifyEmails")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      return { duplicate: true };
    }

    await ctx.db.insert("notifyEmails", {
      email: args.email,
      createdAt: Date.now(),
    });

    return { duplicate: false };
  },
});

export const deleteNotifyEmail = serverMutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notifyEmails")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!existing) {
      return {
        deleted: false,
        email: null,
        error: "No email found in database matching arg",
      };
    }

    try {
      await ctx.db.delete(existing._id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { deleted: false, email: existing.email, error: message };
    }

    return { deleted: true, email: existing.email, error: null };
  },
});

// --- Notify list: proving you own the address -------------------------------

const notifyAction = v.union(v.literal("subscribe"), v.literal("unsubscribe"));

// a resend inside this window keeps the code already in the inbox
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

/** Arms a fresh code for this address + action, unless one just went out. */
export const startNotifyCode = serverMutation({
  args: {
    email: v.string(),
    action: notifyAction,
    codeHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const now = Date.now();
    const existing = await ctx.db
      .query("notifyCodes")
      .withIndex("by_email_action", (q) => q.eq("email", email).eq("action", args.action))
      .first();

    if (existing && existing.sentAt > now - CODE_RESEND_COOLDOWN_MS) {
      return { throttled: true };
    }

    const row = { email, action: args.action, codeHash: args.codeHash, expiresAt: args.expiresAt };
    if (existing) {
      await ctx.db.patch(existing._id, { ...row, sentAt: now, attempts: 0 });
    } else {
      await ctx.db.insert("notifyCodes", { ...row, sentAt: now, attempts: 0 });
    }
    return { throttled: false };
  },
});

/**
 * Checks a code and, if it matches, does what it was for. Wrong guesses count
 * up and the code dies after a handful, so six digits can't be brute-forced.
 * Unsubscribing reports success whether or not the address was on the list,
 * so the answer never tells anyone who's subscribed.
 */
export const redeemNotifyCode = serverMutation({
  args: {
    email: v.string(),
    action: notifyAction,
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const code = await ctx.db
      .query("notifyCodes")
      .withIndex("by_email_action", (q) => q.eq("email", email).eq("action", args.action))
      .first();

    if (!code) return { status: "invalid" as const };
    if (code.expiresAt < Date.now()) return { status: "expired" as const };
    if (code.attempts >= CODE_MAX_ATTEMPTS) return { status: "locked" as const };

    if (code.codeHash !== args.codeHash) {
      const attempts = code.attempts + 1;
      await ctx.db.patch(code._id, { attempts });
      return { status: attempts >= CODE_MAX_ATTEMPTS ? ("locked" as const) : ("invalid" as const) };
    }

    await ctx.db.delete(code._id);

    const existing = await ctx.db
      .query("notifyEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (args.action === "unsubscribe") {
      if (existing) await ctx.db.delete(existing._id);
      return { status: "unsubscribed" as const };
    }

    if (existing) return { status: "duplicate" as const };
    await ctx.db.insert("notifyEmails", { email, createdAt: Date.now() });
    return { status: "subscribed" as const };
  },
});
