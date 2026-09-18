import { ConvexError, v } from "convex/values";

import { mutation, query } from "./functions";
import { type MutationCtx } from "./_generated/server";
import { type Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";

/**
 * Short share links (`/share/blog/{code}`) and the opt-in that credits the
 * colleague who shared one.
 *
 * The two codes here are deliberately different things: a post's `shareCode`
 * is public and permanent (it's the URL), while a user's `referralCode` is an
 * opaque handle that only means something to us — it rides along in a link
 * that gets pasted into group chats, so it must not leak who they are to
 * anyone reading the URL.
 */

// No 0/O/1/l/I — these codes get read aloud, retyped and screenshotted.
const CODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const SHARE_CODE_LENGTH = 7;
const REFERRAL_CODE_LENGTH = 10;
const MAX_CODE_ATTEMPTS = 5;

/** Not a secret — a guessed share code reveals a post that is already public,
 * and a guessed referral code only mis-attributes a visit. Bias from the
 * modulo is irrelevant at that stake. */
function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/**
 * Mints a post's share code, or returns the one it already has. Never
 * regenerates: links that are already out in the world have to keep working,
 * which also means unpublishing and republishing a post keeps its link alive.
 */
export async function ensureShareCode(ctx: MutationCtx, postId: Id<"blogPosts">): Promise<string> {
  const post = await ctx.db.get(postId);
  if (!post) throw new ConvexError({ code: "not_found", message: "Not found" });
  if (post.shareCode) return post.shareCode;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode(SHARE_CODE_LENGTH);
    const clash = await ctx.db
      .query("blogPosts")
      .withIndex("by_shareCode", (q) => q.eq("shareCode", code))
      .first();
    if (!clash) {
      await ctx.db.patch(postId, { shareCode: code });
      return code;
    }
  }
  throw new ConvexError({ code: "share_code_exhausted", message: "Could not mint a share code" });
}

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
