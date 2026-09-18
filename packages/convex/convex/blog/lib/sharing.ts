import { ConvexError } from "convex/values";
import { type MutationCtx } from "../../_generated/server";
import { type Id } from "../../_generated/dataModel";

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
export const CODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export const SHARE_CODE_LENGTH = 7;

export const MAX_CODE_ATTEMPTS = 5;

/** Not a secret — a guessed share code reveals a post that is already public,
 * and a guessed referral code only mis-attributes a visit. Bias from the
 * modulo is irrelevant at that stake. */
export function randomCode(length: number): string {
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
