import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { safeEqual, sha256hex } from "./activity/lib/crypto";
import { type Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getUserByClerkId } from "./lib/auth";
import { trackEvent } from "./lib/analytics";

const RECOVERY_CODE_COUNT = 8;
// Avoids 0/O/1/I/L so a printed code isn't ambiguous to read back.
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

function requireActiveUser(user: Doc<"users"> | null): Doc<"users"> {
  if (!user || user.status !== "active") {
    throw new ConvexError({ code: "not_found", message: "User not found" });
  }
  return user;
}

function randomRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += RECOVERY_CODE_ALPHABET[bytes[i]! % RECOVERY_CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

export const apiStatus = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.object({ enrolled: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { enrolled: Boolean(credential?.verifiedAt) };
  },
});

export const apiEnrollmentContext = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.union(v.null(), v.object({ email: v.string(), hasVerified: v.boolean() })),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user || user.status !== "active") return null;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { email: user.email, hasVerified: Boolean(credential?.verifiedAt) };
  },
});

export const apiBeginEnrollment = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), secretCiphertext: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const existing = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing?.verifiedAt) {
      throw new ConvexError({
        code: "conflict",
        message: "Remove your existing authenticator app before adding a new one",
      });
    }
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("totpCredentials", {
      userId: user._id,
      secretCiphertext: args.secretCiphertext,
      createdAt: Date.now(),
    });
    await trackEvent(ctx, { event: "mfa_enrollment_started", distinctId: user.clerkUserId, properties: {} });
    return { ok: true };
  },
});

export const apiPendingSecret = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential || credential.verifiedAt) return null;
    return credential.secretCiphertext;
  },
});

export const apiFinishEnrollment = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.object({ recoveryCodes: v.array(v.string()) }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential || credential.verifiedAt) {
      throw new ConvexError({ code: "invalid", message: "Start authenticator setup again" });
    }
    const now = Date.now();
    await ctx.db.patch(credential._id, { verifiedAt: now });

    const existingCodes = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(existingCodes.map((code) => ctx.db.delete(code._id)));

    const recoveryCodes: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const code = randomRecoveryCode();
      recoveryCodes.push(code);
      await ctx.db.insert("totpRecoveryCodes", {
        userId: user._id,
        codeHash: await sha256hex(code),
        createdAt: now,
      });
    }
    await ctx.db.insert("totpAuditLog", { userId: user._id, event: "enrolled", at: now });
    await trackEvent(ctx, {
      event: "mfa_enrollment_completed",
      distinctId: user.clerkUserId,
      properties: {},
    });
    return { recoveryCodes };
  },
});

export const apiSecretForVerification = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential?.verifiedAt) return null;
    return credential.secretCiphertext;
  },
});

export const apiRecordVerification = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), ok: v.boolean() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (credential?.verifiedAt && args.ok) {
      await ctx.db.patch(credential._id, { lastUsedAt: Date.now() });
    }
    await ctx.db.insert("totpAuditLog", {
      userId: user._id,
      event: args.ok ? "verified" : "failed",
      at: Date.now(),
    });
    return { ok: true };
  },
});

export const apiVerifyRecoveryCode = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), code: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const candidateHash = await sha256hex(args.code.trim().toUpperCase());
    const unused = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .collect();
    const match = unused.find((row) => safeEqual(row.codeHash, candidateHash));
    await ctx.db.insert("totpAuditLog", {
      userId: user._id,
      event: match ? "recovery_used" : "failed",
      at: Date.now(),
    });
    if (!match) return { ok: false };
    await ctx.db.patch(match._id, { usedAt: Date.now() });
    return { ok: true };
  },
});

export const apiRemove = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (credential) await ctx.db.delete(credential._id);
    const codes = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(codes.map((code) => ctx.db.delete(code._id)));
    await ctx.db.insert("totpAuditLog", { userId: user._id, event: "removed", at: Date.now() });
    return { ok: true };
  },
});
