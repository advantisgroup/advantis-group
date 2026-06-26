import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { isEmailDomainAllowed, requireManager } from "./lib/auth";

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
    if (!isEmailDomainAllowed(email)) {
      throw new ConvexError({
        code: "bad_request",
        message: "Email domain is not in the allowed company domains",
      });
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
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
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    let inviteId;
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        role: args.role,
        token,
        invitedByUserId: inviter._id,
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
      });
      inviteId = existingInvite._id;
    } else {
      inviteId = await ctx.db.insert("invites", {
        email,
        role: args.role,
        invitedByUserId: inviter._id,
        token,
        status: "pending",
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "invite",
      to: email,
      data: {
        role: args.role,
        token,
        invitedByName:
          [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
          inviter.email,
      },
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
    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "invite",
      to: invite.email,
      data: {
        role: invite.role,
        token,
        invitedByName:
          [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
          inviter.email,
      },
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
      ? invites.filter((i) => i.status === status)
      : invites;
    return Promise.all(
      filtered.map(async (invite) => {
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

/** Public-ish: validate an invite token for the sign-up landing screen. */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
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
