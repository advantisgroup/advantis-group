import {
  internalMutation,
  serverMutation,
  serverQuery,
  serverUserMutation,
  serverUserQuery,
} from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { trackEvent } from "../lib/analytics";
import { notifySecurityChange } from "../lib/stepUp";
import { getServerCaller, loadCaller, requireServerCaller } from "../lib/caller";

const transportValidator = v.union(
  v.literal("ble"),
  v.literal("cable"),
  v.literal("hybrid"),
  v.literal("internal"),
  v.literal("nfc"),
  v.literal("smart-card"),
  v.literal("usb"),
);

const MAX_PASSKEYS = 10;

const passkeyValidator = v.object({
  _id: v.id("passkeys"),
  name: v.string(),
  deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
  backedUp: v.boolean(),
  createdAt: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
});

const acceptedCredentialsSignalValidator = v.object({
  userId: v.string(),
  allAcceptedCredentialIds: v.array(v.string()),
});

function toPasskeyView(passkey: Doc<"passkeys">) {
  return {
    _id: passkey._id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt ?? null,
  };
}

async function readPasskeyForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  passkeyId: Id<"passkeys">,
): Promise<Doc<"passkeys">> {
  const passkey = await ctx.db.get(passkeyId);
  if (!passkey || passkey.userId !== userId) {
    throw new ConvexError({ code: "not_found", message: "Passkey not found" });
  }
  return passkey;
}

export const apiRegistrationContext = serverMutation({
  args: {
    clerkUserId: v.string(),
    webauthnUserId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      email: v.string(),
      displayName: v.string(),
      webauthnUserId: v.string(),
      credentials: v.array(
        v.object({ id: v.string(), transports: v.optional(v.array(transportValidator)) }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = (await getServerCaller(ctx, args.clerkUserId))?.user;
    if (!user) return null;
    const webauthnUserId = user.webauthnUserId ?? args.webauthnUserId;
    if (!user.webauthnUserId) {
      await ctx.db.patch(user._id, { webauthnUserId });
    }
    const credentials = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    return {
      userId: user._id,
      email: user.email,
      displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      webauthnUserId,
      credentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports,
      })),
    };
  },
});

export const apiCreateChallenge = serverMutation({
  args: {
    flowId: v.string(),
    challenge: v.string(),
    kind: v.union(v.literal("registration"), v.literal("authentication")),
    clerkUserId: v.optional(v.string()),
    expiresAt: v.number(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    let userId: Id<"users"> | undefined;
    if (args.clerkUserId) {
      userId = (await requireServerCaller(ctx, args.clerkUserId)).id;
    }
    await ctx.db.insert("passkeyChallenges", {
      flowId: args.flowId,
      challenge: args.challenge,
      kind: args.kind,
      userId,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const apiAuthenticationContext = serverQuery({
  args: { flowId: v.string(), credentialId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      challenge: v.string(),
      credential: v.union(
        v.object({
          id: v.string(),
          publicKey: v.string(),
          counter: v.number(),
          transports: v.optional(v.array(transportValidator)),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
      .unique();
    if (!challenge || challenge.kind !== "authentication" || challenge.expiresAt <= Date.now()) {
      return null;
    }
    const credential = await ctx.db
      .query("passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (!credential) return { challenge: challenge.challenge, credential: null };
    return {
      challenge: challenge.challenge,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      },
    };
  },
});

export const apiRegistrationChallenge = serverQuery({
  args: { flowId: v.string(), clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = (await getServerCaller(ctx, args.clerkUserId))?.user;
    if (!user) return null;
    const challenge = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
      .unique();
    if (
      !challenge ||
      challenge.kind !== "registration" ||
      challenge.userId !== user._id ||
      challenge.expiresAt <= Date.now()
    ) {
      return null;
    }
    return challenge.challenge;
  },
});

export const apiCompleteRegistration = serverUserMutation({
  args: {
    flowId: v.string(),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.optional(v.array(transportValidator)),
    deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
    backedUp: v.boolean(),
    name: v.string(),
  },
  returns: passkeyValidator,
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const name = args.name.trim();
    if (!name || name.length > 80) {
      throw new ConvexError({ code: "invalid", message: "Enter a passkey name" });
    }
    const challenge = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
      .unique();
    if (
      !challenge ||
      challenge.kind !== "registration" ||
      challenge.userId !== user._id ||
      challenge.expiresAt <= Date.now()
    ) {
      throw new ConvexError({ code: "invalid", message: "This passkey request has expired" });
    }
    const existing = await ctx.db
      .query("passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "conflict", message: "This passkey is already registered" });
    }
    const passkeys = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_PASSKEYS);
    if (passkeys.length >= MAX_PASSKEYS) {
      throw new ConvexError({ code: "invalid", message: "You can register up to ten passkeys" });
    }
    const now = Date.now();
    const passkeyId = await ctx.db.insert("passkeys", {
      userId: user._id,
      credentialId: args.credentialId,
      publicKey: args.publicKey,
      counter: args.counter,
      transports: args.transports,
      deviceType: args.deviceType,
      backedUp: args.backedUp,
      name,
      createdAt: now,
    });
    await ctx.db.delete(challenge._id);
    await ctx.db.insert("passkeyAuditLog", {
      userId: user._id,
      passkeyId,
      event: "created",
      at: now,
    });
    await trackEvent(ctx, {
      event: "passkey_enrollment_completed",
      distinctId: user.clerkUserId,
      properties: {},
    });
    await notifySecurityChange(
      ctx,
      user,
      "A passkey was added to your account",
      `A new passkey named "${name}" can now sign in to the Advantis intranet as you.`,
    );
    return {
      _id: passkeyId,
      name,
      deviceType: args.deviceType,
      backedUp: args.backedUp,
      createdAt: now,
      lastUsedAt: null,
    };
  },
});

export const apiCompleteAuthentication = serverMutation({
  args: {
    flowId: v.string(),
    credentialId: v.string(),
    newCounter: v.number(),
    deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
    backedUp: v.boolean(),
  },
  returns: v.object({
    clerkUserId: v.string(),
    signal: v.optional(acceptedCredentialsSignalValidator),
  }),
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
      .unique();
    if (!challenge || challenge.kind !== "authentication" || challenge.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "invalid", message: "This passkey request has expired" });
    }
    const passkey = await ctx.db
      .query("passkeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (!passkey) {
      throw new ConvexError({ code: "not_found", message: "Passkey not found" });
    }
    if (
      args.newCounter < passkey.counter ||
      (passkey.counter > 0 && args.newCounter === passkey.counter)
    ) {
      throw new ConvexError({ code: "invalid", message: "Passkey could not be verified" });
    }
    const user = (await loadCaller(ctx, await ctx.db.get(passkey.userId)))?.user;
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
    const now = Date.now();
    await ctx.db.patch(passkey._id, {
      counter: args.newCounter,
      deviceType: args.deviceType,
      backedUp: args.backedUp,
      lastUsedAt: now,
    });
    await ctx.db.delete(challenge._id);
    await ctx.db.insert("passkeyAuditLog", {
      userId: user._id,
      passkeyId: passkey._id,
      event: "used",
      at: now,
    });
    const acceptedPasskeys = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_PASSKEYS);
    return {
      clerkUserId: user.clerkUserId,
      ...(user.webauthnUserId
        ? {
            signal: {
              userId: user.webauthnUserId,
              allAcceptedCredentialIds: acceptedPasskeys.map((passkey) => passkey.credentialId),
            },
          }
        : {}),
    };
  },
});

export const apiListForUser = serverUserQuery({
  args: {},
  returns: v.array(passkeyValidator),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const passkeys = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    return passkeys.map(toPasskeyView);
  },
});

export const apiRenameForUser = serverUserMutation({
  args: {
    passkeyId: v.id("passkeys"),
    name: v.string(),
  },
  returns: passkeyValidator,
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const name = args.name.trim();
    if (!name || name.length > 80) {
      throw new ConvexError({ code: "invalid", message: "Enter a passkey name" });
    }
    const passkey = await readPasskeyForUser(ctx, user._id, args.passkeyId);
    await ctx.db.patch(passkey._id, { name });
    await ctx.db.insert("passkeyAuditLog", {
      userId: user._id,
      passkeyId: passkey._id,
      event: "renamed",
      at: Date.now(),
    });
    return toPasskeyView({ ...passkey, name });
  },
});

export const apiRemoveForUser = serverUserMutation({
  args: { passkeyId: v.id("passkeys") },
  returns: v.object({ ok: v.boolean(), signal: v.optional(acceptedCredentialsSignalValidator) }),
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const passkey = await readPasskeyForUser(ctx, user._id, args.passkeyId);
    await ctx.db.delete(passkey._id);
    await ctx.db.insert("passkeyAuditLog", {
      userId: user._id,
      event: "removed",
      at: Date.now(),
    });
    await notifySecurityChange(
      ctx,
      user,
      "A passkey was removed from your account",
      `The passkey named "${passkey.name}" can no longer sign in to the Advantis intranet.`,
    );
    const acceptedPasskeys = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_PASSKEYS);
    return {
      ok: true,
      ...(user.webauthnUserId
        ? {
            signal: {
              userId: user.webauthnUserId,
              allAcceptedCredentialIds: acceptedPasskeys.map(
                (acceptedPasskey) => acceptedPasskey.credentialId,
              ),
            },
          }
        : {}),
    };
  },
});

export const purgeExpiredChallenges = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const challenges = await ctx.db
      .query("passkeyChallenges")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(500);
    await Promise.all(challenges.map((challenge) => ctx.db.delete(challenge._id)));
    return { deleted: challenges.length };
  },
});
