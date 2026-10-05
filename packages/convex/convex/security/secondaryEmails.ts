import { serverUserMutation, serverUserQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { safeEqual, sha256hex } from "../lib/crypto";
import { type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { trackEvent } from "../lib/analytics";
import { notifySecurityChange } from "../lib/stepUp";

/**
 * Extra addresses an intranet account has proven it owns, via the same
 * 6-digit code flow as `lib/stepUp.ts`. Server-key-gated: only apps/api's
 * `/secondary-emails/*` routes call these.
 */

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const REQUEST_COOLDOWN_MS = 60_000;
/** A handful is plenty for "a work address, an HR address" — bounds the
 * table against someone scripting an unbounded pile of pending adds. */
const MAX_SECONDARY_EMAILS = 5;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return (bytes[0]! % 1_000_000).toString().padStart(6, "0");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether `email` is already spoken for — someone's primary address, or
 * another account's already-verified secondary one. Checked both when a
 * code is requested and again when it's confirmed, since the world can
 * change in between. Never blocks the *same* account re-adding or
 * re-verifying its own pending row. */
async function isClaimedByAnotherAccount(
  ctx: QueryCtx | MutationCtx,
  email: string,
  userId: Id<"users">,
): Promise<boolean> {
  const ownedByOther = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (ownedByOther && ownedByOther._id !== userId) return true;

  const rows = await ctx.db
    .query("userSecondaryEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  return rows.some((r) => r.userId !== userId && r.verifiedAt !== undefined);
}

export const apiList = serverUserQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("userSecondaryEmails"),
      email: v.string(),
      verified: v.boolean(),
      addedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("userSecondaryEmails")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows
      .map((r) => ({
        _id: r._id,
        email: r.email,
        verified: r.verifiedAt !== undefined,
        addedAt: r.addedAt,
      }))
      .sort((a, b) => a.addedAt - b.addedAt);
  },
});

export const apiRequestCode = serverUserMutation({
  args: { email: v.string() },
  returns: v.object({ alreadyVerified: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const email = normalizeEmail(args.email);
    if (!email.includes("@") || email.length > 254) {
      throw new ConvexError({ code: "validation", message: "Enter a valid email address." });
    }
    if (email === user.email.toLowerCase()) {
      throw new ConvexError({
        code: "validation",
        message: "That's already your account's own email.",
      });
    }
    if (await isClaimedByAnotherAccount(ctx, email, user._id)) {
      throw new ConvexError({ code: "conflict", message: "That email is already in use." });
    }

    const existingOwn = await ctx.db
      .query("userSecondaryEmails")
      .withIndex("by_user_email", (q) => q.eq("userId", user._id).eq("email", email))
      .unique();
    if (existingOwn?.verifiedAt !== undefined) {
      return { alreadyVerified: true };
    }
    if (!existingOwn) {
      const current = await ctx.db
        .query("userSecondaryEmails")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      if (current.length >= MAX_SECONDARY_EMAILS) {
        throw new ConvexError({
          code: "limit",
          message: `You can register up to ${MAX_SECONDARY_EMAILS} secondary emails.`,
        });
      }
    }

    const now = Date.now();
    const existingChallenge = await ctx.db
      .query("userSecondaryEmailChallenges")
      .withIndex("by_user_email", (q) => q.eq("userId", user._id).eq("email", email))
      .unique();
    if (existingChallenge && now - existingChallenge.createdAt < REQUEST_COOLDOWN_MS) {
      throw new ConvexError({
        code: "cooldown",
        message: "A code was just sent. Wait a moment before requesting another.",
      });
    }

    const code = generateCode();
    if (existingChallenge) await ctx.db.delete(existingChallenge._id);
    await ctx.db.insert("userSecondaryEmailChallenges", {
      userId: user._id,
      email,
      codeHash: await sha256hex(code),
      attempts: 0,
      expiresAt: now + CODE_TTL_MS,
      createdAt: now,
    });

    if (existingOwn) {
      await ctx.db.patch(existingOwn._id, { addedAt: now });
    } else {
      await ctx.db.insert("userSecondaryEmails", { userId: user._id, email, addedAt: now });
    }

    await ctx.scheduler.runAfter(0, internal.notifications.email.sendNotificationEmail, {
      kind: "secondary-email-code",
      to: email,
      data: { code, expiresInMinutes: 10, accountName: user.firstName ?? user.email },
    });
    await trackEvent(ctx, {
      event: "secondary_email_code_requested",
      distinctId: user.clerkUserId,
    });
    return { alreadyVerified: false };
  },
});

export const apiVerifyCode = serverUserMutation({
  args: { email: v.string(), code: v.string() },
  returns: v.object({ ok: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const email = normalizeEmail(args.email);

    const challenge = await ctx.db
      .query("userSecondaryEmailChallenges")
      .withIndex("by_user_email", (q) => q.eq("userId", user._id).eq("email", email))
      .unique();
    if (!challenge) return { ok: false, message: "No code is waiting. Request one first." };
    if (challenge.expiresAt <= Date.now()) {
      await ctx.db.delete(challenge._id);
      return { ok: false, message: "This code has expired. Request a new one." };
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(challenge._id);
      return { ok: false, message: "Too many incorrect attempts. Request a new code." };
    }

    const candidateHash = await sha256hex(args.code.trim());
    if (!safeEqual(candidateHash, challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await ctx.db.delete(challenge._id);
        return { ok: false, message: "Too many incorrect attempts. Request a new code." };
      }
      await ctx.db.patch(challenge._id, { attempts });
      return {
        ok: false,
        message: `Incorrect code. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left.`,
      };
    }

    const row = await ctx.db
      .query("userSecondaryEmails")
      .withIndex("by_user_email", (q) => q.eq("userId", user._id).eq("email", email))
      .unique();
    if (!row) {
      await ctx.db.delete(challenge._id);
      return { ok: false, message: "No pending request for that email. Request a new code." };
    }
    // Re-checked here, not just at request time — the address could have
    // been claimed by someone else in the meantime.
    if (await isClaimedByAnotherAccount(ctx, email, user._id)) {
      await ctx.db.delete(challenge._id);
      return { ok: false, message: "That email is already in use." };
    }

    await ctx.db.patch(row._id, { verifiedAt: Date.now() });
    await ctx.db.delete(challenge._id);
    // A verified secondary address can auto-approve password resets for
    // linked areas, so the account's own inbox hears about every new one.
    await notifySecurityChange(
      ctx,
      user,
      "An email address was added to your account",
      `${email} can now be used for sign-in and password resets on your Advantis intranet account.`,
    );
    await trackEvent(ctx, { event: "secondary_email_verified", distinctId: user.clerkUserId });
    return { ok: true };
  },
});

export const apiRemove = serverUserMutation({
  args: {
    secondaryEmailId: v.id("userSecondaryEmails"),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const row = await ctx.db.get(args.secondaryEmailId);
    if (!row || row.userId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Not found." });
    }
    await ctx.db.delete(row._id);
    const challenge = await ctx.db
      .query("userSecondaryEmailChallenges")
      .withIndex("by_user_email", (q) => q.eq("userId", user._id).eq("email", row.email))
      .unique();
    if (challenge) await ctx.db.delete(challenge._id);
    return { ok: true };
  },
});
