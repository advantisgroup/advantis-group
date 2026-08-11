import { ConvexError } from "convex/values";

import { safeEqual, sha256hex } from "../activity/lib/crypto";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";

/** How recently an admin must have entered a valid code before an action that
 * can hand out access to someone else's account goes through. One code clears
 * every gated action for this long, not just the one that prompted it. */
export const REVERIFICATION_MAX_AGE_MINUTES = 10;

/** How long a freshly-issued code stays enterable. Shorter than the
 * verified-window above on purpose — the code itself is a narrower, faster
 * credential than the "already proved it" grace period it unlocks. */
const CODE_TTL_MS = 10 * 60_000;

/** Failed guesses allowed against one code before it's invalidated outright
 * and a fresh one has to be mailed. Bounds blind-guessing a 6-digit code to a
 * handful of tries per minute even from a session that's already cleared
 * `requireAdmin`. */
const MAX_ATTEMPTS = 5;

/** Minimum gap between two code requests for the same admin — keeps a
 * compromised-but-still-admin session from turning this into an inbox flood. */
export const REQUEST_COOLDOWN_MS = 60_000;

/**
 * Shape returned in place of acting, when the caller's admin session hasn't
 * entered a code recently enough. The client checks for this discriminant and
 * opens the verification dialog instead of treating the call as done.
 */
export interface VerificationHint {
  needsVerification: true;
}

export function needsVerificationHint(): VerificationHint {
  return { needsVerification: true };
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = bytes[0]! % 1_000_000;
  return code.toString().padStart(6, "0");
}

/**
 * Mints and stores a fresh code for `admin`, replacing any code already
 * live for them, and returns the plaintext for the caller to mail out. Throws
 * if the admin is still inside the cooldown window from their last request.
 */
export async function issueCode(ctx: MutationCtx, admin: Doc<"users">): Promise<string> {
  const now = Date.now();
  const existing = await ctx.db
    .query("adminVerificationCodes")
    .withIndex("by_admin", (q) => q.eq("adminUserId", admin._id))
    .unique();
  if (existing && now - existing.createdAt < REQUEST_COOLDOWN_MS) {
    throw new ConvexError({
      code: "cooldown",
      message: "A code was just sent. Wait a moment before requesting another.",
    });
  }

  const code = generateCode();
  if (existing) await ctx.db.delete(existing._id);
  await ctx.db.insert("adminVerificationCodes", {
    adminUserId: admin._id,
    codeHash: await sha256hex(code),
    attempts: 0,
    expiresAt: now + CODE_TTL_MS,
    createdAt: now,
  });
  return code;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts"; attemptsLeft?: number }
  | { ok: false; reason: "wrong_code"; attemptsLeft: number };

/** Checks `code` against the admin's live row, consuming an attempt on a
 * miss and marking the row verified on a hit. */
export async function verifyCode(
  ctx: MutationCtx,
  adminId: Id<"users">,
  code: string,
): Promise<VerifyResult> {
  const row = await ctx.db
    .query("adminVerificationCodes")
    .withIndex("by_admin", (q) => q.eq("adminUserId", adminId))
    .unique();
  if (!row) return { ok: false, reason: "no_code" };
  if (row.expiresAt <= Date.now()) {
    await ctx.db.delete(row._id);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await ctx.db.delete(row._id);
    return { ok: false, reason: "too_many_attempts" };
  }

  const candidateHash = await sha256hex(code.trim());
  if (!safeEqual(candidateHash, row.codeHash)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(row._id);
      return { ok: false, reason: "too_many_attempts" };
    }
    await ctx.db.patch(row._id, { attempts });
    return { ok: false, reason: "wrong_code", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  await ctx.db.patch(row._id, { verifiedAt: Date.now() });
  return { ok: true };
}

/**
 * Whether `adminId` has entered a valid code recently enough to proceed with
 * a gated action. Failing closed on a missing/expired row is deliberate — see
 * `REVERIFICATION_MAX_AGE_MINUTES`.
 */
export async function isRecentlyVerified(
  ctx: QueryCtx | MutationCtx,
  adminId: Id<"users">,
): Promise<boolean> {
  const row = await ctx.db
    .query("adminVerificationCodes")
    .withIndex("by_admin", (q) => q.eq("adminUserId", adminId))
    .unique();
  if (!row || !row.verifiedAt) return false;
  return Date.now() - row.verifiedAt <= REVERIFICATION_MAX_AGE_MINUTES * 60_000;
}
