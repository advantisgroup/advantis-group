import { ConvexError, v } from "convex/values";

import { mutation, query } from "../functions";
import { type MutationCtx } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { MAX_CODE_ATTEMPTS, randomCode } from "./lib/sharing";
const REFERRAL_CODE_LENGTH = 10;

async function mintReferralCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode(REFERRAL_CODE_LENGTH);
    const clash = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();
    if (!clash) return code;
  }
  throw new ConvexError({ code: "referral_code_exhausted", message: "Could not mint a code" });
}

/** Public, unauthenticated — this is what `/share/blog/{code}` resolves
 * against before redirecting to the post's real URL. */
export const resolveShare = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    if (code.length > 32) return null;
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_shareCode", (q) => q.eq("shareCode", code))
      .first();
    if (!post || post.status !== "published") return null;
    return { language: post.language, slug: post.slug };
  },
});

/**
 * What the share sheet needs to render. `available: false` means there's
 * nobody to credit — signed out, or signed in with an account the org has no
 * record of — and the sheet then shows a plain link with no toggle at all,
 * rather than a control that would silently do nothing.
 */
export const myReferralState = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { available: false, code: null, enabled: false };
    return {
      available: true,
      code: user.referralCode ?? null,
      // Undefined means "hasn't decided" — on by default, since a colleague
      // deliberately sharing company content is the case this exists for.
      enabled: user.referralSharingEnabled ?? true,
    };
  },
});

export const setReferralSharing = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "auth.forbidden", message: "No account to credit" });
    }

    // Only mint on the way *on* — someone who leaves this off never gets a
    // referral code written to their row at all.
    const code = enabled ? (user.referralCode ?? (await mintReferralCode(ctx))) : user.referralCode;

    await ctx.db.patch(user._id, {
      referralSharingEnabled: enabled,
      ...(code && code !== user.referralCode ? { referralCode: code } : {}),
    });

    return { code: enabled ? (code ?? null) : null, enabled };
  },
});
