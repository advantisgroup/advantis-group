import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  getAllowedDomains,
  isEmailDomainAllowed,
  requireManager,
} from "./lib/auth";

const roleArg = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export const create = mutation({
  args: { email: v.string(), role: roleArg },
  handler: async (ctx, args) => {
    const inviter = await requireManager(ctx);
    const email = args.email.trim().toLowerCase();

    if (!email.includes("@")) {
      throw new ConvexError({ code: "bad_request", message: "Invalid email" });
    }
    // Only admins may grant admin/manager; managers can only invite employees.
    if (args.role !== "employee" && inviter.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only admins can invite admins or managers",
      });
    }
    // Emails outside the company domains can still be invited, but only by an
    // admin (the UI also asks for an explicit confirmation before sending).
    const external = !isEmailDomainAllowed(email);
    if (external && inviter.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only admins can invite external email addresses",
      });
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (existingUser) {
      throw new ConvexError({
        code: "conflict",
        message: "A user with that email already exists",
      });
    }

    const now = Date.now();
    const token = newToken();

    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_email", q => q.eq("email", email))
      .filter(q => q.eq(q.field("status"), "pending"))
      .first();

    let inviteId;
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        role: args.role,
        token,
        invitedByUserId: inviter._id,
        external,
        status: "pending",
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
      });
      inviteId = existingInvite._id;
    } else {
      inviteId = await ctx.db.insert("invites", {
        email,
        role: args.role,
        invitedByUserId: inviter._id,
        external,
        token,
        status: "pending",
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
      });
    }

    // Delivery is handled by Clerk's invitation flow (Clerk sends the email and
    // gates sign-up to the invited address, which also lets external domains in
    // past any Clerk sign-up restriction). The Convex invite row above remains
    // the source of truth for the granted role on acceptance (see ensureUser).
    await ctx.scheduler.runAfter(0, internal.outbound.sendClerkInvitation, {
      email,
      role: args.role,
      invitedByName:
        [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
        inviter.email,
    });

    return { inviteId, token };
  },
});

export const resend = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const inviter = await requireManager(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.status !== "pending") {
      throw new ConvexError({
        code: "not_found",
        message: "No pending invite to resend",
      });
    }
    const token = newToken();
    await ctx.db.patch(inviteId, {
      token,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });
    await ctx.scheduler.runAfter(0, internal.outbound.sendClerkInvitation, {
      email: invite.email,
      role: invite.role,
      invitedByName:
        [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
        inviter.email,
    });
    return { ok: true };
  },
});

export const revoke = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    await requireManager(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) return { ok: false };
    await ctx.db.patch(inviteId, { status: "revoked" });
    return { ok: true };
  },
});

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireManager(ctx);
    const invites = await ctx.db.query("invites").order("desc").take(200);
    const filtered = status
      ? invites.filter(i => i.status === status)
      : invites;
    return Promise.all(
      filtered.map(async invite => {
        const inviter = await ctx.db.get(invite.invitedByUserId);
        return {
          ...invite,
          invitedByName: inviter
            ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
              inviter.email
            : "Unknown",
        };
      })
    );
  },
});

/**
 * Invite-form config for managers: the configured company domains so the UI can
 * tell whether an entered address is external (and gate/confirm accordingly).
 * Empty list means no allowlist is configured (nothing is treated as external).
 */
export const config = query({
  args: {},
  handler: async ctx => {
    await requireManager(ctx);
    return { allowedDomains: getAllowedDomains() };
  },
});

/** Public-ish: validate an invite token for the sign-up landing screen. */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", q => q.eq("token", token))
      .first();
    if (!invite) return null;
    return {
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expired: invite.expiresAt < Date.now(),
    };
  },
});
