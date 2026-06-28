import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  getUserByClerkId,
  isEmailDomainAllowed,
  requireManager,
} from "./lib/auth";
import { notifyUsers } from "./lib/notify";

const roleArg = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

async function managerIds(ctx: MutationCtx): Promise<Doc<"users">["_id"][]> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", q => q.eq("role", "admin"))
    .collect();
  const managers = await ctx.db
    .query("users")
    .withIndex("by_role", q => q.eq("role", "manager"))
    .collect();
  return [...admins, ...managers]
    .filter(u => u.status === "active")
    .map(u => u._id);
}

/**
 * Filed by a signed-in Clerk identity that has no intranet account yet. The
 * email/name/clerkUserId come from the verified JWT identity, never the client.
 */
export const create = mutation({
  args: { message: v.optional(v.string()) },
  handler: async (ctx, { message }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Not signed in",
      });
    }
    // Already provisioned? Nothing to request.
    const existing = await getUserByClerkId(ctx, identity.subject);
    if (existing) return { status: "already_member" as const };

    const email = (identity.email ?? "").toLowerCase();
    if (!email) {
      throw new ConvexError({
        code: "bad_request",
        message: "Your account has no email address",
      });
    }
    if (!isEmailDomainAllowed(email)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Your email domain is not permitted to access the intranet",
      });
    }

    const prior = await ctx.db
      .query("accessRequests")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .filter(q => q.eq(q.field("status"), "pending"))
      .first();
    if (prior) return { status: "pending" as const };

    await ctx.db.insert("accessRequests", {
      email,
      clerkUserId: identity.subject,
      name: identity.name ?? undefined,
      message,
      status: "pending",
      createdAt: Date.now(),
    });

    await notifyUsers(ctx, await managerIds(ctx), {
      type: "access_request",
      title: "New access request",
      body: `${identity.name ?? email} requested access to the intranet`,
      link: "/admin/access",
    });

    return { status: "pending" as const };
  },
});

/** Current user's own latest request status (for the request-access screen). */
export const myStatus = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const member = await getUserByClerkId(ctx, identity.subject);
    if (member) return { status: "member" as const };
    const request = await ctx.db
      .query("accessRequests")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .order("desc")
      .first();
    return {
      status: request?.status ?? ("none" as const),
      email: identity.email ?? null,
      domainAllowed: identity.email
        ? isEmailDomainAllowed(identity.email)
        : false,
    };
  },
});

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireManager(ctx);
    const requests = await ctx.db
      .query("accessRequests")
      .order("desc")
      .take(200);
    return status ? requests.filter(r => r.status === status) : requests;
  },
});

export const approve = mutation({
  args: { requestId: v.id("accessRequests"), role: v.optional(roleArg) },
  handler: async (ctx, { requestId, role }) => {
    const reviewer = await requireManager(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({
        code: "not_found",
        message: "No pending request",
      });
    }
    const grantedRole = role ?? "employee";
    if (grantedRole !== "employee" && reviewer.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only admins can grant manager/admin roles",
      });
    }

    // Create the user row keyed to their Clerk id so ensureUser picks it up.
    const existing = await getUserByClerkId(ctx, request.clerkUserId);
    if (!existing) {
      const now = Date.now();
      await ctx.db.insert("users", {
        clerkUserId: request.clerkUserId,
        email: request.email,
        firstName: request.name?.split(" ")[0],
        lastName: request.name?.split(" ").slice(1).join(" ") || undefined,
        role: grantedRole,
        status: "active",
        external: !isEmailDomainAllowed(request.email),
        createdAt: now,
      });
    }

    await ctx.db.patch(requestId, {
      status: "approved",
      reviewedByUserId: reviewer._id,
      reviewedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "access-approved",
      to: request.email,
      data: { role: grantedRole },
    });

    return { ok: true };
  },
});

export const deny = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, { requestId }) => {
    const reviewer = await requireManager(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({
        code: "not_found",
        message: "No pending request",
      });
    }
    await ctx.db.patch(requestId, {
      status: "denied",
      reviewedByUserId: reviewer._id,
      reviewedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "access-denied",
      to: request.email,
      data: {},
    });
    return { ok: true };
  },
});
