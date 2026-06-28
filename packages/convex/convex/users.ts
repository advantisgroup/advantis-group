import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ensureUser,
  getCurrentUser,
  requireAdmin,
  requireUser,
} from "./lib/auth";
import { lockClerkUser, unlockClerkUser } from "./lib/clerk";

const roleArg = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

/** Attach a resolved avatar URL to a user document. */
async function withAvatar(ctx: QueryCtx, user: Doc<"users">) {
  const avatar = user.avatarStorageId
    ? await ctx.storage.getUrl(user.avatarStorageId)
    : (user.avatarUrl ?? null);
  return {
    _id: user._id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    role: user.role,
    department: user.department ?? null,
    jobTitle: user.jobTitle ?? null,
    phone: user.phone ?? null,
    teams: user.teams ?? [],
    managerId: user.managerId ?? null,
    status: user.status,
    external: user.external ?? false,
    avatar,
    lastSeenAt: user.lastSeenAt ?? null,
    createdAt: user.createdAt,
  };
}

export const me = query({
  args: {},
  handler: async ctx => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return withAvatar(ctx, user);
  },
});

/** Provision the signed-in identity. Called by the intranet on app load. */
export const ensureCurrentUser = mutation({
  args: {},
  handler: async ctx => ensureUser(ctx),
});

export const list = query({
  args: {
    search: v.optional(v.string()),
    department: v.optional(v.string()),
    includeSuspended: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let users = await ctx.db.query("users").collect();

    if (!args.includeSuspended) {
      users = users.filter(u => u.status === "active");
    }
    if (args.department) {
      users = users.filter(
        u => u.department?.toLowerCase() === args.department!.toLowerCase()
      );
    }
    if (args.search) {
      const q = args.search.toLowerCase();
      users = users.filter(u =>
        [u.firstName, u.lastName, u.email, u.jobTitle, u.department]
          .filter(Boolean)
          .some(field => field!.toLowerCase().includes(q))
      );
    }

    users.sort((a, b) =>
      (a.firstName ?? a.email).localeCompare(b.firstName ?? b.email)
    );
    return Promise.all(users.map(u => withAvatar(ctx, u)));
  },
});

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return withAvatar(ctx, user);
  },
});

export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // If replacing the avatar, clean up the old stored object.
    if (
      args.avatarStorageId &&
      user.avatarStorageId &&
      args.avatarStorageId !== user.avatarStorageId
    ) {
      await ctx.storage.delete(user.avatarStorageId);
    }
    await ctx.db.patch(user._id, {
      ...(args.firstName !== undefined ? { firstName: args.firstName } : {}),
      ...(args.lastName !== undefined ? { lastName: args.lastName } : {}),
      ...(args.jobTitle !== undefined ? { jobTitle: args.jobTitle } : {}),
      ...(args.department !== undefined ? { department: args.department } : {}),
      ...(args.phone !== undefined ? { phone: args.phone } : {}),
      ...(args.avatarStorageId
        ? { avatarStorageId: args.avatarStorageId }
        : {}),
    });
    return { ok: true };
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleArg },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id && role !== "admin") {
      throw new ConvexError({
        code: "bad_request",
        message: "You cannot remove your own admin role",
      });
    }
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { role });
    return { ok: true };
  },
});

export const setTeams = mutation({
  args: { userId: v.id("users"), teams: v.array(v.string()) },
  handler: async (ctx, { userId, teams }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    // De-dupe and drop blanks.
    const clean = [...new Set(teams.map(t => t.trim()).filter(Boolean))];
    await ctx.db.patch(userId, { teams: clean });
    return { ok: true };
  },
});

export const setManager = mutation({
  args: {
    userId: v.id("users"),
    managerId: v.optional(v.id("users")),
  },
  handler: async (ctx, { userId, managerId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { managerId });
    return { ok: true };
  },
});

export const applyStatus = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended")),
  },
  handler: async (ctx, { userId, status }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id && status === "suspended") {
      throw new ConvexError({
        code: "bad_request",
        message: "You cannot suspend yourself",
      });
    }
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { status });
    return { clerkUserId: target.clerkUserId };
  },
});

/** Suspend or re-activate a member using Clerk's lock feature. */
export const setStatus = action({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended")),
  },
  handler: async (ctx, { userId, status }): Promise<{ ok: true }> => {
    const { clerkUserId } = await ctx.runMutation(internal.users.applyStatus, {
      userId,
      status,
    });
    if (clerkUserId) {
      if (status === "suspended") {
        await lockClerkUser(clerkUserId);
      } else {
        await unlockClerkUser(clerkUserId);
      }
    }
    return { ok: true };
  },
});

/** Distinct department names for filters. */
export const departments = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const set = new Set<string>();
    for (const u of users) if (u.department) set.add(u.department);
    return [...set].sort((a, b) => a.localeCompare(b));
  },
});
