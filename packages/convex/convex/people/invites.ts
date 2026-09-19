import { internalMutation, query, userAction, userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { roleValidator } from "../schema";
import { getAllowedDomains, isEmailDomainAllowed } from "../lib/auth";
import { createClerkInvitation } from "../lib/clerk";
import { displayName } from "../lib/users";
import { pushToClerk } from "./clerkSync";

const roleArg = roleValidator;

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

/**
 * Validate + persist the invite row. Internal: only ever called from the
 * `create` action below, which has already checked who is inviting whom.
 */
export const createInviteRecord = internalMutation({
  args: {
    invitedByUserId: v.id("users"),
    email: v.string(),
    role: roleArg,
    departmentId: v.optional(v.id("departments")),
    teamIds: v.optional(v.array(v.id("teams"))),
    jobTitle: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    if (!email.includes("@")) {
      throw new ConvexError({ code: "bad_request", message: "Invalid email" });
    }
    // Emails outside the company domains are invited the same way as
    // company ones — a personal address works just as well for the intranet
    // account itself (Clerk auth doesn't care), and skips needing IT to
    // provision a company mailbox first. The UI still asks for an explicit
    // confirmation before sending, for both managers and admins.
    const external = !isEmailDomainAllowed(email);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.neq(q.field("status"), "removed"))
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

    const pendingProfile = {
      departmentId: args.departmentId,
      teamIds: args.teamIds,
      jobTitle: args.jobTitle,
      phone: args.phone,
    };

    let inviteId;
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        role: args.role,
        token,
        invitedByUserId: args.invitedByUserId,
        external,
        status: "pending",
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
        ...pendingProfile,
      });
      inviteId = existingInvite._id;
    } else {
      inviteId = await ctx.db.insert("invites", {
        email,
        role: args.role,
        invitedByUserId: args.invitedByUserId,
        external,
        token,
        status: "pending",
        expiresAt: now + INVITE_TTL_MS,
        createdAt: now,
        ...pendingProfile,
      });
    }

    return { inviteId, token, email, role: args.role };
  },
});

/**
 * Invite a user. Records the invite (source of truth for the granted role on
 * acceptance) and then asks Clerk to send the invitation email. Runs as an
 * action so the Clerk call is awaited and any failure surfaces to the admin
 * rather than disappearing into a background job.
 */
export const create = userAction({
  role: "manager",
  args: {
    email: v.string(),
    role: roleArg,
    departmentId: v.optional(v.id("departments")),
    teamIds: v.optional(v.array(v.id("teams"))),
    jobTitle: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inviteId: string; token: string }> => {
    // Only admins may grant admin/manager; managers can only invite employees.
    if (!ctx.caller.canGrant(args.role)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only admins can invite admins or managers",
      });
    }
    const rec = await ctx.runMutation(internal.people.invites.createInviteRecord, {
      ...args,
      invitedByUserId: ctx.caller.id,
    });
    await createClerkInvitation({
      email: rec.email,
      role: rec.role,
      invitedByName: displayName(ctx.caller.user),
    });
    return { inviteId: rec.inviteId, token: rec.token };
  },
});

/** Refresh a pending invite's token + expiry; returns what Clerk needs. */
export const refreshInviteToken = internalMutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
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
    return { email: invite.email, role: invite.role };
  },
});

export const resend = userAction({
  role: "manager",
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }): Promise<{ ok: true }> => {
    const rec = await ctx.runMutation(internal.people.invites.refreshInviteToken, {
      inviteId,
    });
    await createClerkInvitation({ ...rec, invitedByName: displayName(ctx.caller.user) });
    return { ok: true };
  },
});

/** Revoke an invite here and kill its Clerk-side link too. */
export const revoke = userMutation({
  role: "manager",
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) return { ok: false };
    await ctx.db.patch(inviteId, { status: "revoked" });
    await pushToClerk(ctx, { kind: "revokeInvitations", email: invite.email });
    return { ok: true };
  },
});

export const list = userQuery({
  role: "manager",
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const invites = await ctx.db.query("invites").order("desc").take(200);
    const filtered = status ? invites.filter((i) => i.status === status) : invites;
    return Promise.all(
      filtered.map(async (invite) => {
        const inviter = await ctx.db.get(invite.invitedByUserId);
        return {
          ...invite,
          invitedByName: inviter
            ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || inviter.email
            : "Unknown",
        };
      }),
    );
  },
});

/**
 * Invite-form config for managers: the configured company domains so the UI can
 * tell whether an entered address is external (and gate/confirm accordingly).
 * Empty list means no allowlist is configured (nothing is treated as external).
 */
export const config = userQuery({
  role: "manager",
  args: {},
  handler: async () => ({ allowedDomains: getAllowedDomains() }),
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
