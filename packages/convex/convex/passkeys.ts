import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, internalMutation, mutation, query } from "./_generated/server";
import { getUserByClerkId } from "./lib/auth";

const transportValidator = v.union(
  v.literal("ble"),
  v.literal("cable"),
  v.literal("hybrid"),
  v.literal("internal"),
  v.literal("nfc"),
  v.literal("smart-card"),
  v.literal("usb"),
);

const passkeyValidator = v.object({
  _id: v.id("passkeys"),
  name: v.string(),
  deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
  backedUp: v.boolean(),
  createdAt: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
});

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

export const apiRegistrationContext = mutation({
  args: {
    serverKey: v.string(),
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
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user || user.status !== "active") return null;
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

export const apiCreateChallenge = mutation({
  args: {
    serverKey: v.string(),
    flowId: v.string(),
    challenge: v.string(),
    kind: v.union(v.literal("registration"), v.literal("authentication")),
    clerkUserId: v.optional(v.string()),
    expiresAt: v.number(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    let userId: Id<"users"> | undefined;
    if (args.clerkUserId) {
      userId = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId))._id;
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

export const apiAuthenticationContext = query({
  args: { serverKey: v.string(), flowId: v.string(), credentialId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      challenge: v.string(),
      credential: v.object({
        id: v.string(),
        publicKey: v.string(),
        counter: v.number(),
        transports: v.optional(v.array(transportValidator)),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
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
    if (!credential) return null;
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

export const apiRegistrationChallenge = query({
  args: { serverKey: v.string(), flowId: v.string(), clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    if (!user || user.status !== "active") return null;
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

export const apiCompleteRegistration = mutation({
  args: {
    serverKey: v.string(),
    flowId: v.string(),
    clerkUserId: v.string(),
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
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
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

export const apiCompleteAuthentication = mutation({
  args: {
    serverKey: v.string(),
    flowId: v.string(),
    credentialId: v.string(),
    newCounter: v.number(),
    deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
    backedUp: v.boolean(),
  },
  returns: v.object({ clerkUserId: v.string() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
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
    const user = requireActiveUser(await ctx.db.get(passkey.userId));
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
    return { clerkUserId: user.clerkUserId };
  },
});

export const apiListForUser = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: v.array(passkeyValidator),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const passkeys = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    return passkeys.map(toPasskeyView);
  },
});

export const apiRenameForUser = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    passkeyId: v.id("passkeys"),
    name: v.string(),
  },
  returns: passkeyValidator,
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
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

export const apiRemoveForUser = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), passkeyId: v.id("passkeys") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = requireActiveUser(await getUserByClerkId(ctx, args.clerkUserId));
    const passkey = await readPasskeyForUser(ctx, user._id, args.passkeyId);
    await ctx.db.delete(passkey._id);
    await ctx.db.insert("passkeyAuditLog", {
      userId: user._id,
      event: "removed",
      at: Date.now(),
    });
    return { ok: true };
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
