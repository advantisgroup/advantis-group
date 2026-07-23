import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { roleValidator } from "./schema";
import { clearVaultPasswordForUser } from "./applicantVault";
import {
  ensureUser,
  getCurrentUser,
  isApplicantEligible,
  requireAdmin,
  requireApplicantDelegateOrAdmin,
  requireManager,
  requireUser,
  requireVaultUnlocked,
} from "./lib/auth";
import { listUserPermissions } from "./lib/permissions";
import { recordUnifiedAudit } from "./lib/auditLogWrite";
import {
  lockClerkUser,
  unlockClerkUser,
  updateClerkPublicMetadata,
  updateClerkUserAvatar,
  updateClerkUserName,
} from "./lib/clerk";

const roleArg = roleValidator;

/** Attach a resolved avatar URL to a user document. */
async function withAvatar(ctx: QueryCtx, user: Doc<"users">) {
  const avatar = user.avatarStorageId
    ? await ctx.storage.getUrl(user.avatarStorageId)
    : (user.avatarUrl ?? null);
  const customRole = user.customRoleId
    ? await ctx.db.get(user.customRoleId)
    : null;
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
    updatesEmailConsent: user.updatesEmailConsent ?? false,
    gfAccess: user.gfAccess ?? false,
    uploadRequestsEnabled: user.uploadRequestsEnabled !== false,
    /** `["gf_access", "upload_requests"]`-style — see lib/permissions.ts. */
    permissions: listUserPermissions(user),
    customRoleId: user.customRoleId ?? null,
    customRoleName: customRole?.name ?? null,
    capabilities: customRole?.capabilities ?? [],
    applicantAccessDelegate: user.applicantAccessDelegate ?? false,
    applicantAccess: user.applicantAccess ?? false,
    roleLabel: user.roleLabel ?? null,
    avatar,
    lastSeenAt: user.lastSeenAt ?? null,
    createdAt: user.createdAt,
    dateOfBirth: user.dateOfBirth ?? null,
    showBirthdayPublicly: user.showBirthdayPublicly ?? false,
    hireDate: user.hireDate ?? null,
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

const listArgs = {
  search: v.optional(v.string()),
  department: v.optional(v.string()),
  includeSuspended: v.optional(v.boolean()),
};

async function queryUsers(
  ctx: QueryCtx,
  args: { search?: string; department?: string; includeSuspended?: boolean }
) {
  // Most callers only want active users — use the `by_status` index to skip
  // suspended rows at the DB layer rather than fetching everyone and
  // filtering in JS.
  let users = args.includeSuspended
    ? await ctx.db.query("users").collect()
    : await ctx.db
        .query("users")
        .withIndex("by_status", q => q.eq("status", "active"))
        .collect();
  if (args.department) {
    users = users.filter(
      u => u.department?.toLowerCase() === args.department!.toLowerCase()
    );
  }
  if (args.search) {
    const q = args.search.toLowerCase();
    users = users.filter(u =>
      [
        u.firstName,
        u.lastName,
        u.email,
        u.jobTitle,
        u.department,
        ...(u.teams ?? []),
      ]
        .filter(Boolean)
        .some(field => field!.toLowerCase().includes(q))
    );
  }

  users.sort((a, b) =>
    (a.firstName ?? a.email).localeCompare(b.firstName ?? b.email)
  );

  const nameById = new Map(
    users.map(u => [
      u._id as string,
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
    ])
  );

  return { users, nameById };
}

/**
 * Plain user directory — every non-presence, non-absence consumer (command
 * palette, chat pickers, admin panels, people admin) uses this. Deliberately
 * stays clear of the `presence`/`absences` tables: those are written far more
 * often than `users` (presence on a sitewide ~60s heartbeat), and joining
 * them into this reactive query would re-run the whole directory for every
 * subscriber on every heartbeat from anyone. See `directoryList` for the
 * variant that needs that data.
 */
export const list = query({
  args: listArgs,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { users, nameById } = await queryUsers(ctx, args);
    return Promise.all(
      users.map(async u => ({
        ...(await withAvatar(ctx, u)),
        managerName: u.managerId
          ? (nameById.get(u.managerId as string) ?? null)
          : null,
      }))
    );
  },
});

/**
 * Directory page only: `list` plus live presence and "out today" absence
 * status. Isolated from `list` so the sitewide presence heartbeat only
 * invalidates the one page that actually renders online status, not every
 * command palette / admin panel that merely lists users.
 */
export const directoryList = query({
  args: listArgs,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { users, nameById } = await queryUsers(ctx, args);

    const presenceRows = await ctx.db.query("presence").collect();
    const lastActiveByUser = new Map(
      presenceRows.map(p => [p.userId, p.lastActiveAt])
    );
    const today = new Date().toISOString().slice(0, 10);
    const approved = await ctx.db
      .query("absences")
      .withIndex("by_status", q => q.eq("status", "approved"))
      .collect();
    const outByUser = new Map<string, string>();
    for (const a of approved) {
      if (a.startDate <= today && today <= a.endDate) {
        const prev = outByUser.get(a.userId);
        if (!prev || a.endDate > prev) outByUser.set(a.userId, a.endDate);
      }
    }

    return Promise.all(
      users.map(async u => ({
        ...(await withAvatar(ctx, u)),
        lastActiveAt: lastActiveByUser.get(u._id) ?? null,
        outUntil: outByUser.get(u._id) ?? null,
        managerName: u.managerId
          ? (nameById.get(u.managerId as string) ?? null)
          : null,
      }))
    );
  },
});

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", q => q.eq("userId", userId))
      .unique();
    return {
      ...(await withAvatar(ctx, user)),
      lastActiveAt: presence?.lastActiveAt ?? null,
    };
  },
});

/**
 * Integration link status for the settings "Connections" card: whether the
 * viewer's Clockodo absences can be mirrored (directly via
 * users.clockodoUserId, or through their ActivityTrack person record).
 */
export const myConnections = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const person = await ctx.db
      .query("people")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();
    return {
      clockodoDirect: user.clockodoUserId != null,
      personLinked: person != null,
      personName: person?.name ?? null,
      personHasClockodo: person?.clockodoUserId != null,
    };
  },
});

/** Manager + direct reports for the profile card's organisation section. */
export const orgContext = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return { manager: null, reports: [] };
    const manager = user.managerId ? await ctx.db.get(user.managerId) : null;
    const reports = (
      await ctx.db
        .query("users")
        .withIndex("by_managerId", q => q.eq("managerId", userId))
        .collect()
    ).filter(u => u.status === "active");
    const brief = async (u: Doc<"users">) => {
      const full = await withAvatar(ctx, u);
      return {
        _id: full._id,
        name: full.name,
        jobTitle: full.jobTitle,
        avatar: full.avatar,
      };
    };
    return {
      manager:
        manager && manager.status === "active" ? await brief(manager) : null,
      reports: await Promise.all(reports.map(brief)),
    };
  },
});

const profileArgs = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  jobTitle: v.optional(v.string()),
  department: v.optional(v.string()),
  phone: v.optional(v.string()),
  avatarStorageId: v.optional(v.id("_storage")),
  dateOfBirth: v.optional(v.string()),
  showBirthdayPublicly: v.optional(v.boolean()),
};

export const applyProfileUpdate = internalMutation({
  args: profileArgs,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
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
      ...(args.dateOfBirth !== undefined
        ? { dateOfBirth: args.dateOfBirth }
        : {}),
      ...(args.showBirthdayPublicly !== undefined
        ? { showBirthdayPublicly: args.showBirthdayPublicly }
        : {}),
    });
    const avatarUrl = args.avatarStorageId
      ? await ctx.storage.getUrl(args.avatarStorageId)
      : null;
    return { clerkUserId: user.clerkUserId, avatarUrl };
  },
});

export const updateProfile = action({
  args: profileArgs,
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { clerkUserId, avatarUrl } = await ctx.runMutation(
      internal.users.applyProfileUpdate,
      args
    );
    if (clerkUserId) {
      if (args.firstName !== undefined || args.lastName !== undefined) {
        await updateClerkUserName(clerkUserId, {
          firstName: args.firstName,
          lastName: args.lastName,
        });
      }
      if (avatarUrl) {
        await updateClerkUserAvatar(clerkUserId, avatarUrl);
      }
    }
    return { ok: true };
  },
});

/**
 * Self-service opt-in/out for "Updates" broadcast emails. Only externals can
 * toggle this — internal employees are always eligible and have no consent
 * to withdraw (see `updatesEmailConsent` on the `users` table).
 */
export const setUpdatesEmailConsent = mutation({
  args: { consent: v.boolean() },
  handler: async (ctx, { consent }) => {
    const user = await requireUser(ctx);
    if (!user.external) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only external users manage updates-email consent",
      });
    }
    await ctx.db.patch(user._id, { updatesEmailConsent: consent });
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

/** Assign or clear a member's custom role. Manager+. */
export const assignCustomRole = mutation({
  args: {
    userId: v.id("users"),
    customRoleId: v.optional(v.id("customRoles")),
  },
  handler: async (ctx, { userId, customRoleId }) => {
    await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    if (customRoleId) {
      const role = await ctx.db.get(customRoleId);
      if (!role) {
        throw new ConvexError({ code: "not_found", message: "Role not found" });
      }
    }
    await ctx.db.patch(userId, { customRoleId });
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

/** Manager+: set another user's hire date, for work-anniversary shoutouts. */
export const setHireDate = mutation({
  args: { userId: v.id("users"), hireDate: v.optional(v.string()) },
  handler: async (ctx, { userId, hireDate }) => {
    await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { hireDate });
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
    if (status === "suspended" && target.role === "admin") {
      throw new ConvexError({
        code: "bad_request",
        message: "Admins cannot be suspended — change their role first",
      });
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

// --- OneDrive permission flags (synced into Clerk public metadata) ----------

export const applyGfAccess = internalMutation({
  args: { userId: v.id("users"), gfAccess: v.boolean() },
  handler: async (ctx, { userId, gfAccess }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { gfAccess });
    const auditAt = Date.now();
    await ctx.db.insert("onedriveAudit", {
      actorUserId: admin._id,
      action: gfAccess ? "grant_gf_access" : "revoke_gf_access",
      target: target.email,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "onedrive",
      actorUserId: admin._id,
      action: gfAccess ? "grant_gf_access" : "revoke_gf_access",
      target: target.email,
      at: auditAt,
    });
    return { clerkUserId: target.clerkUserId, gfAccess };
  },
});

/** Grant/revoke Geschäftsführung access (admin only). Mirrors into Clerk. */
export const setGfAccess = action({
  args: { userId: v.id("users"), gfAccess: v.boolean() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { clerkUserId, gfAccess } = await ctx.runMutation(
      internal.users.applyGfAccess,
      args
    );
    if (clerkUserId) {
      await updateClerkPublicMetadata(clerkUserId, { gfAccess });
    }
    return { ok: true };
  },
});

export const applyUploadPermission = internalMutation({
  args: { userId: v.id("users"), enabled: v.boolean() },
  handler: async (ctx, { userId, enabled }) => {
    const actor = await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { uploadRequestsEnabled: enabled });
    const auditAt = Date.now();
    await ctx.db.insert("onedriveAudit", {
      actorUserId: actor._id,
      action: enabled ? "enable_uploads" : "disable_uploads",
      target: target.email,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "onedrive",
      actorUserId: actor._id,
      action: enabled ? "enable_uploads" : "disable_uploads",
      target: target.email,
      at: auditAt,
    });
    return { clerkUserId: target.clerkUserId, enabled };
  },
});

/** Enable/disable a user's ability to submit upload requests (manager+). */
export const setUploadPermission = action({
  args: { userId: v.id("users"), enabled: v.boolean() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { clerkUserId, enabled } = await ctx.runMutation(
      internal.users.applyUploadPermission,
      args
    );
    if (clerkUserId) {
      await updateClerkPublicMetadata(clerkUserId, {
        uploadRequestsEnabled: enabled,
      });
    }
    return { ok: true };
  },
});

/**
 * Today's birthdays (opt-in only) and work anniversaries, for the overview's
 * "celebrations" widget. Anniversaries are always shown (a hire date isn't
 * sensitive); birthdays only for users who set `showBirthdayPublicly`. Only
 * matches month/day, not year — `dateOfBirth`/`hireDate` are "YYYY-MM-DD".
 */
export const todaysCelebrations = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const now = new Date();
    const todayMonthDay = now.toISOString().slice(5, 10);
    const currentYear = now.getUTCFullYear();

    const users = await ctx.db
      .query("users")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();

    const celebrations: Array<{
      userId: Doc<"users">["_id"];
      name: string;
      avatar: string | null;
      type: "birthday" | "anniversary";
      years: number | null;
    }> = [];

    for (const u of users) {
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      const avatar = u.avatarStorageId
        ? await ctx.storage.getUrl(u.avatarStorageId)
        : (u.avatarUrl ?? null);

      if (
        u.showBirthdayPublicly &&
        u.dateOfBirth?.slice(5, 10) === todayMonthDay
      ) {
        celebrations.push({
          userId: u._id,
          name,
          avatar,
          type: "birthday",
          years: null,
        });
      }
      if (u.hireDate?.slice(5, 10) === todayMonthDay) {
        const hireYear = Number(u.hireDate.slice(0, 4));
        const years = currentYear - hireYear;
        if (years > 0) {
          celebrations.push({
            userId: u._id,
            name,
            avatar,
            type: "anniversary",
            years,
          });
        }
      }
    }

    return celebrations;
  },
});

/** Distinct department names for filters. */
export const departments = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();
    const set = new Set<string>();
    for (const u of users) if (u.department) set.add(u.department);
    return [...set].sort((a, b) => a.localeCompare(b));
  },
});

// --- Applicant Management (Bewerbermanagement) access -----------------------

/** Admin-only: designate/undesignate a user as an Applicant Access delegate. */
export const setApplicantDelegate = mutation({
  args: { userId: v.id("users"), delegate: v.boolean() },
  handler: async (ctx, { userId, delegate }) => {
    const admin = await requireAdmin(ctx);
    await requireVaultUnlocked(ctx, admin._id);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { applicantAccessDelegate: delegate });
    // Losing delegate rights only strips vault access if the user has no
    // other way into the area — their own granted `applicantAccess` (or
    // admin role) still lets them in, and their password should keep
    // working for that.
    if (!delegate && target.role !== "admin" && !target.applicantAccess) {
      await clearVaultPasswordForUser(ctx, userId);
    }
    const auditAt = Date.now();
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: admin._id,
      action: delegate ? "grant_delegate" : "revoke_delegate",
      target: target.email,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: admin._id,
      action: delegate ? "grant_delegate" : "revoke_delegate",
      target: target.email,
      at: auditAt,
    });
    return { ok: true };
  },
});

/**
 * Grant/revoke Applicant Management access. Callable by admins or designated
 * delegates. Granting requires the target to already qualify (Manager+, or a
 * custom role with `manage_members`) — enforced here even for admins, since
 * it's a data-sensitivity rule, not an authority one.
 */
export const setApplicantAccess = mutation({
  args: { userId: v.id("users"), access: v.boolean() },
  handler: async (ctx, { userId, access }) => {
    const actor = await requireApplicantDelegateOrAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    if (access) {
      const customRole = target.customRoleId
        ? await ctx.db.get(target.customRoleId)
        : null;
      if (!isApplicantEligible(target, customRole)) {
        throw new ConvexError({
          code: "forbidden",
          message:
            "This user must be at least Manager or hold a custom role with Manage Members before they can be granted Applicant Management access.",
        });
      }
    }
    await ctx.db.patch(userId, { applicantAccess: access });
    // Revoking access deletes the user's own vault password/unlock — for
    // security, a former member's password must not outlive their access.
    // If they're still a delegate (or admin) they keep their password,
    // since they can still reach the area.
    if (!access && target.role !== "admin" && !target.applicantAccessDelegate) {
      await clearVaultPasswordForUser(ctx, userId);
    }
    const auditAt = Date.now();
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: actor._id,
      action: access ? "grant_access" : "revoke_access",
      target: target.email,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: actor._id,
      action: access ? "grant_access" : "revoke_access",
      target: target.email,
      at: auditAt,
    });
    return { ok: true };
  },
});

/** Users eligible to be granted Applicant Management access, for the picker. */
export const eligibleForApplicantAccess = query({
  args: {},
  handler: async ctx => {
    await requireApplicantDelegateOrAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();
    const customRoles = await ctx.db.query("customRoles").collect();
    const customRoleById = new Map(customRoles.map(r => [r._id, r]));
    return users
      .filter(u =>
        isApplicantEligible(
          u,
          u.customRoleId ? (customRoleById.get(u.customRoleId) ?? null) : null
        )
      )
      .map(u => ({
        _id: u._id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        email: u.email,
        role: u.role,
        applicantAccess: u.applicantAccess ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Admin-only: set a cosmetic display-name override for a user's role badge. */
export const setRoleLabel = mutation({
  args: { userId: v.id("users"), roleLabel: v.optional(v.string()) },
  handler: async (ctx, { userId, roleLabel }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { roleLabel: roleLabel?.trim() || undefined });
    return { ok: true };
  },
});
