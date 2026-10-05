import { serverQuery, serverUserMutation, serverUserQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { safeEqual, sha256hex } from "../lib/crypto";
import { trackEvent } from "../lib/analytics";
import { notifySecurityChange } from "../lib/stepUp";
import { getServerCaller } from "../lib/caller";

const RECOVERY_CODE_COUNT = 8;
// Avoids 0/O/1/I/L so a printed code isn't ambiguous to read back.
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += RECOVERY_CODE_ALPHABET[bytes[i]! % RECOVERY_CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

export const apiStatus = serverUserQuery({
  args: {},
  returns: v.object({
    enrolled: v.boolean(),
    needsRotation: v.boolean(),
    recoveryCodesRemaining: v.number(),
    recoveryCodesTotal: v.number(),
  }),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    // Bounded by RECOVERY_CODE_COUNT per user, so collecting is safe here.
    const codes = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return {
      enrolled: Boolean(credential?.verifiedAt),
      needsRotation: Boolean(credential?.verifiedAt && credential.recoveryUsedAt),
      recoveryCodesRemaining: codes.filter((code) => code.usedAt === undefined).length,
      recoveryCodesTotal: codes.length,
    };
  },
});

/** Burns every existing code and issues a fresh set. Used both for "I've
 * spent a few and want a clean sheet" and for "I'm not sure where that
 * printout ended up" — which is why it replaces rather than tops up. */
export const apiRegenerateRecoveryCodes = serverUserMutation({
  args: {},
  returns: v.object({ recoveryCodes: v.array(v.string()) }),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential?.verifiedAt) {
      throw new ConvexError({ code: "invalid", message: "No authenticator app is set up" });
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("totpRecoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(existing.map((code) => ctx.db.delete(code._id)));

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
    await ctx.db.insert("totpAuditLog", {
      userId: user._id,
      event: "recovery_regenerated",
      at: now,
    });
    await notifySecurityChange(
      ctx,
      user,
      "Your recovery codes were replaced",
      "A new set of recovery codes was generated for your Advantis intranet account. Any codes you had written down no longer work.",
    );
    await trackEvent(ctx, {
      event: "mfa_recovery_codes_regenerated",
      distinctId: user.clerkUserId,
      properties: {},
    });
    return { recoveryCodes };
  },
});

export const apiEnrollmentContext = serverQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(v.null(), v.object({ email: v.string(), hasVerified: v.boolean() })),
  handler: async (ctx, args) => {
    const user = (await getServerCaller(ctx, args.clerkUserId))?.user;
    if (!user) return null;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    // A credential whose recovery code has been spent counts as absent here,
    // so "remove the old one first" doesn't block the very re-enrollment the
    // gate is asking for.
    return {
      email: user.email,
      hasVerified: Boolean(credential?.verifiedAt) && !credential?.recoveryUsedAt,
    };
  },
});

export const apiBeginEnrollment = serverUserMutation({
  args: { secretCiphertext: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const existing = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing?.verifiedAt && !existing.recoveryUsedAt) {
      throw new ConvexError({
        code: "conflict",
        message: "Remove your existing authenticator app before adding a new one",
      });
    }
    // Dropping a verified-but-spent row is the point: the authenticator it
    // describes is gone, and the new secret replaces it. The recovery codes
    // survive until `apiFinishEnrollment` reissues them, so an abandoned
    // re-setup doesn't strand the account.
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("totpCredentials", {
      userId: user._id,
      secretCiphertext: args.secretCiphertext,
      createdAt: Date.now(),
    });
    await trackEvent(ctx, {
      event: "mfa_enrollment_started",
      distinctId: user.clerkUserId,
      properties: {},
    });
    return { ok: true };
  },
});

export const apiPendingSecret = serverUserQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential || credential.verifiedAt) return null;
    return credential.secretCiphertext;
  },
});

export const apiFinishEnrollment = serverUserMutation({
  args: { usedStep: v.optional(v.number()) },
  returns: v.object({ recoveryCodes: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential || credential.verifiedAt) {
      throw new ConvexError({ code: "invalid", message: "Start authenticator setup again" });
    }
    const now = Date.now();
    // The enrollment code counts as spent too — otherwise the digits the user
    // just typed into setup would still clear a step-up prompt seconds later.
    await ctx.db.patch(credential._id, {
      verifiedAt: now,
      ...(args.usedStep !== undefined ? { lastUsedStep: args.usedStep } : {}),
    });

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

export const apiSecretForVerification = serverUserQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ secretCiphertext: v.string(), lastUsedStep: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!credential?.verifiedAt) return null;
    return {
      secretCiphertext: credential.secretCiphertext,
      lastUsedStep: credential.lastUsedStep ?? null,
    };
  },
});

export const apiRecordVerification = serverUserMutation({
  args: {
    ok: v.boolean(),
    /** The TOTP step the accepted code belonged to — burns that step so the
     * same digits can't be replayed for the rest of the drift window. */
    usedStep: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (credential?.verifiedAt && args.ok) {
      await ctx.db.patch(credential._id, {
        lastUsedAt: Date.now(),
        ...(args.usedStep !== undefined ? { lastUsedStep: args.usedStep } : {}),
      });
    }
    await ctx.db.insert("totpAuditLog", {
      userId: user._id,
      event: args.ok ? "verified" : "failed",
      at: Date.now(),
    });
    return { ok: true };
  },
});

export const apiVerifyRecoveryCode = serverUserMutation({
  args: { code: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
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
    const now = Date.now();
    await ctx.db.patch(match._id, { usedAt: now });
    // Nobody reaches for a recovery code while their authenticator still
    // works. Flagging the credential is what makes the sign-in gate ask for a
    // new one on the way in, rather than letting the account coast on an
    // authenticator its owner no longer has.
    const credential = await ctx.db
      .query("totpCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (credential && !credential.recoveryUsedAt) {
      await ctx.db.patch(credential._id, { recoveryUsedAt: now });
    }
    await notifySecurityChange(
      ctx,
      user,
      "A recovery code was used on your account",
      "Someone signed in to the Advantis intranet with one of your recovery codes. Your authenticator app is now marked as lost and has to be set up again.",
    );
    return { ok: true };
  },
});

export const apiRemove = serverUserMutation({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx) => {
    const user = ctx.caller.user;
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
    await notifySecurityChange(
      ctx,
      user,
      "Your authenticator app was removed",
      "The authenticator app for your Advantis intranet account was removed, along with its recovery codes.",
    );
    return { ok: true };
  },
});
