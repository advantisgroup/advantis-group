import { ConvexError, v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { internalMutation, mutation as baseMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { roleValidator } from "./schema";
import { clearVaultPasswordForUser } from "./applicantVault";
import {
  effectiveCustomRoleIds,
  effectiveRole,
  ensureUser,
  getCurrentUser,
  isApplicantEligible,
  isSandboxed,
  requireAdmin,
  requireApplicantDelegateOrAdmin,
  requireManager,
  requireRealAdmin,
  requireUser,
  requireVaultUnlocked,
} from "./lib/auth";
import { sandboxedAction as action, sandboxedMutation as mutation } from "./lib/sandbox";
import { listUserPermissions } from "./lib/permissions";
import { recordUnifiedAudit } from "./lib/auditLogWrite";
import { loadReportingLookup, reportingLines, resolveManager } from "./lib/reporting";
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
  const sandboxed = isSandboxed(user);
  const role = effectiveRole(user);
  const avatar = user.avatarStorageId
    ? await ctx.storage.getUrl(user.avatarStorageId)
    : (user.avatarUrl ?? null);
  const customRoleDocs = sandboxed
    ? []
    : await Promise.all(effectiveCustomRoleIds(user).map((id) => ctx.db.get(id)));
  const customRoles = customRoleDocs.filter((role): role is Doc<"customRoles"> => role !== null);
  return {
    _id: user._id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    role,
    actualRole: user.role,
    sandboxRole: user.sandboxRole ?? null,
    canUseSandbox: user.role === "admin",
    department: user.department ?? null,
    jobTitle: user.jobTitle ?? null,
    phone: user.phone ?? null,
    teams: user.teams ?? [],
    managingDirector: user.managingDirector ?? false,
    expertise: user.expertise ?? [],
    managerId: user.managerId ?? null,
    status: user.status,
    external: user.external ?? false,
    clockodoUserId: user.clockodoUserId ?? null,
    updatesEmailConsent: user.updatesEmailConsent ?? false,
    gfAccess: sandboxed ? false : (user.gfAccess ?? false),
    uploadRequestsEnabled: user.uploadRequestsEnabled !== false,
    /** `["gf_access", "upload_requests"]`-style — see lib/permissions.ts. */
    permissions: sandboxed ? [] : listUserPermissions(user),
    customRoleIds: customRoles.map((role) => role._id),
    // Per-role breakdown (name + that role's own capabilities), for UI that
    // needs to explain each grant individually rather than a flattened union.
    customRoles: customRoles.map((role) => ({
      _id: role._id,
      name: role.name,
      capabilities: role.capabilities,
    })),
    capabilities: [...new Set(customRoles.flatMap((role) => role.capabilities))],
    applicantAccessDelegate: sandboxed ? false : (user.applicantAccessDelegate ?? false),
    applicantAccess: sandboxed ? false : (user.applicantAccess ?? false),
    roleLabel: sandboxed ? null : (user.roleLabel ?? null),
    avatar,
    profileColor: user.profileColor ?? null,
    profileGradient: user.profileGradient ?? "aurora",
    lastSeenAt: user.lastSeenAt ?? null,
    createdAt: user.createdAt,
    dateOfBirth: user.dateOfBirth ?? null,
    showBirthdayPublicly: user.showBirthdayPublicly ?? false,
    hireDate: user.hireDate ?? null,
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return withAvatar(ctx, user);
  },
});

/** Provision the signed-in identity. Called by the intranet on app load. */
export const ensureCurrentUser = baseMutation({
  args: {},
  handler: async (ctx) => ensureUser(ctx),
});

/** Enter or leave a read-only base-role view. This deliberately bypasses the
 * normal write guard so an admin can always leave the sandbox again. */
export const setSandboxRole = baseMutation({
  args: {
    role: v.union(v.literal("manager"), v.literal("employee"), v.null()),
  },
  handler: async (ctx, { role }) => {
    const user = await requireRealAdmin(ctx);
    await ctx.db.patch(user._id, { sandboxRole: role ?? undefined });
    return { ok: true };
  },
});

const listArgs = {
  search: v.optional(v.string()),
  department: v.optional(v.string()),
  includeSuspended: v.optional(v.boolean()),
};

async function queryUsers(
  ctx: QueryCtx,
  args: { search?: string; department?: string; includeSuspended?: boolean },
) {
  // Most callers only want active users — use the `by_status` index to skip
  // suspended rows at the DB layer rather than fetching everyone and
  // filtering in JS.
  let users = args.includeSuspended
    ? await ctx.db.query("users").collect()
    : await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
  if (args.department) {
    users = users.filter((u) => u.department?.toLowerCase() === args.department!.toLowerCase());
  }
  if (args.search) {
    const q = args.search.toLowerCase();
    users = users.filter((u) =>
      [
        u.firstName,
        u.lastName,
        u.email,
        u.jobTitle,
        u.department,
        ...(u.teams ?? []),
        ...(u.expertise ?? []),
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }

  users.sort((a, b) => (a.firstName ?? a.email).localeCompare(b.firstName ?? b.email));

  const nameById = new Map(
    users.map((u) => [
      u._id as string,
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
    ]),
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
    const lookup = await loadReportingLookup(ctx);
    return Promise.all(
      users.map(async (u) => {
        const { managerId } = resolveManager(u, lookup);
        return {
          ...(await withAvatar(ctx, u)),
          managerName: managerId ? (nameById.get(managerId as string) ?? null) : null,
        };
      }),
    );
  },
});

/**
 * Directory page only: `list` plus live presence. Isolated from `list` so the
 * sitewide presence heartbeat only invalidates the one page that actually
 * renders online status, not every command palette / admin panel that merely
 * lists users. "Out today" absence status is fetched separately by the page
 * itself from apps/api's live Clockodo endpoint (this query can't — Convex
 * queries have no HTTP access, and absences aren't mirrored into Convex
 * anymore; see AGENTS.md's Clockodo section).
 */
export const directoryList = query({
  args: listArgs,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { users, nameById } = await queryUsers(ctx, args);

    const presenceRows = await ctx.db.query("presence").collect();
    const lastActiveByUser = new Map(presenceRows.map((p) => [p.userId, p.lastActiveAt]));
    const lookup = await loadReportingLookup(ctx);

    return Promise.all(
      users.map(async (u) => {
        const { managerId } = resolveManager(u, lookup);
        return {
          ...(await withAvatar(ctx, u)),
          managerId,
          lastActiveAt: lastActiveByUser.get(u._id) ?? null,
          managerName: managerId ? (nameById.get(managerId as string) ?? null) : null,
        };
      }),
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const person = await ctx.db
      .query("people")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
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
    if (!user) return { lines: [], reports: [], manualManagerId: null, departmentId: null };
    const lookup = await loadReportingLookup(ctx);
    const brief = async (u: Doc<"users">) => {
      const full = await withAvatar(ctx, u);
      return {
        _id: full._id,
        name: full.name,
        jobTitle: full.jobTitle,
        avatar: full.avatar,
      };
    };
    const lines = await Promise.all(
      reportingLines(user, lookup).map(async (line) => {
        const person = await ctx.db.get(line.userId);
        return person && person.status === "active"
          ? { person: await brief(person), via: line.via, label: line.label }
          : null;
      }),
    );
    const reports = (
      await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect()
    ).filter((u) => reportingLines(u, lookup).some((line) => line.userId === userId));
    return {
      lines: lines.filter((line) => line !== null),
      reports: await Promise.all(reports.map(brief)),
      manualManagerId: user.managerId ?? null,
      departmentId: user.departmentId ?? null,
    };
  },
});
const profileArgs = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  jobTitle: v.optional(v.string()),
  phone: v.optional(v.string()),
  avatarStorageId: v.optional(v.id("_storage")),
  profileColor: v.optional(v.union(v.string(), v.null())),
  profileGradient: v.optional(
    v.union(
      v.literal("aurora"),
      v.literal("ocean"),
      v.literal("sunset"),
      v.literal("violet"),
      v.literal("rose"),
    ),
  ),
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
    if (
      args.profileColor !== undefined &&
      args.profileColor !== null &&
      !/^#[0-9a-f]{6}$/i.test(args.profileColor)
    ) {
      throw new ConvexError("profile_color_invalid");
    }
    await ctx.db.patch(user._id, {
      ...(args.firstName !== undefined ? { firstName: args.firstName } : {}),
      ...(args.lastName !== undefined ? { lastName: args.lastName } : {}),
      ...(args.jobTitle !== undefined ? { jobTitle: args.jobTitle } : {}),
      ...(args.phone !== undefined ? { phone: args.phone } : {}),
      ...(args.avatarStorageId ? { avatarStorageId: args.avatarStorageId } : {}),
      ...(args.profileColor !== undefined ? { profileColor: args.profileColor ?? undefined } : {}),
      ...(args.profileGradient !== undefined ? { profileGradient: args.profileGradient } : {}),
      ...(args.dateOfBirth !== undefined ? { dateOfBirth: args.dateOfBirth } : {}),
      ...(args.showBirthdayPublicly !== undefined
        ? { showBirthdayPublicly: args.showBirthdayPublicly }
        : {}),
    });
    const avatarUrl = args.avatarStorageId ? await ctx.storage.getUrl(args.avatarStorageId) : null;
    return { clerkUserId: user.clerkUserId, avatarUrl };
  },
});

export const updateProfile = action({
  args: profileArgs,
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { clerkUserId, avatarUrl } = await ctx.runMutation(
      internal.users.applyProfileUpdate,
      args,
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
export const setExpertise = mutation({
  args: { tags: v.array(v.string()) },
  handler: async (ctx, { tags }) => {
    const user = await requireUser(ctx);
    const clean = [...new Set(tags.map((tag) => tag.trim().slice(0, 32)).filter(Boolean))].slice(
      0,
      12,
    );
    await ctx.db.patch(user._id, { expertise: clean });
    return { ok: true };
  },
});

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

/** Replace a member's full set of custom roles. Manager+. Same full-array-
 * replace convention as `setTeams` below. */
export const setCustomRoles = mutation({
  args: {
    userId: v.id("users"),
    customRoleIds: v.array(v.id("customRoles")),
  },
  handler: async (ctx, { userId, customRoleIds }) => {
    await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    const roles = await Promise.all(customRoleIds.map((id) => ctx.db.get(id)));
    if (roles.some((role) => !role)) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    // Clears the legacy singular field too — an explicit assignment is as
    // good a migration point as any for that holder.
    await ctx.db.patch(userId, { customRoleIds, customRoleId: undefined });
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
    const clean = [...new Set(teams.map((t) => t.trim()).filter(Boolean))];
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
    if (managerId === userId) {
      throw new ConvexError({ code: "bad_request", message: "Nobody can report to themselves" });
    }
    await ctx.db.patch(userId, { managerId, reportsVia: undefined });
    return { ok: true };
  },
});

/** Admin: mark someone as managing director (Geschäftsführer). */
export const setManagingDirector = mutation({
  args: { userId: v.id("users"), managingDirector: v.boolean() },
  handler: async (ctx, { userId, managingDirector }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { managingDirector: managingDirector || undefined });
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
    const { clerkUserId, gfAccess } = await ctx.runMutation(internal.users.applyGfAccess, args);
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
      args,
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
  handler: async (ctx) => {
    await requireUser(ctx);
    const now = new Date();
    const todayMonthDay = now.toISOString().slice(5, 10);
    const currentYear = now.getUTCFullYear();

    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const celebrations: Array<{
      userId: Doc<"users">["_id"];
      name: string;
      avatar: string | null;
      type: "birthday" | "anniversary";
      years: number | null;
    }> = [];

    for (const u of users) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      const avatar = u.avatarStorageId
        ? await ctx.storage.getUrl(u.avatarStorageId)
        : (u.avatarUrl ?? null);

      if (u.showBirthdayPublicly && u.dateOfBirth?.slice(5, 10) === todayMonthDay) {
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
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
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
      const customRoles = await Promise.all(
        effectiveCustomRoleIds(target).map((id) => ctx.db.get(id)),
      );
      if (!isApplicantEligible(target, customRoles)) {
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
  handler: async (ctx) => {
    await requireApplicantDelegateOrAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const customRoles = await ctx.db.query("customRoles").collect();
    const customRoleById = new Map(customRoles.map((r) => [r._id, r]));
    return users
      .filter((u) =>
        isApplicantEligible(
          u,
          effectiveCustomRoleIds(u).map((id) => customRoleById.get(id) ?? null),
        ),
      )
      .map((u) => ({
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

/** Everyone holding more than plain employee access, for the periodic access
 * review: who they are, what they hold, when they were last around, and when
 * someone last confirmed they still need it. */
export const accessReviewList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const roles = new Map((await ctx.db.query("customRoles").collect()).map((r) => [r._id, r]));
    const presence = new Map(
      (await ctx.db.query("presence").collect()).map((p) => [p.userId, p.lastActiveAt]),
    );
    const rows = users
      .map((u) => {
        const customRoles = effectiveCustomRoleIds(u)
          .map((id) => roles.get(id)?.name)
          .filter((name): name is string => !!name);
        const grants = [
          ...(u.gfAccess ? ["gfAccess"] : []),
          ...(u.applicantAccess ? ["applicantAccess"] : []),
          ...(u.applicantAccessDelegate ? ["applicantDelegate"] : []),
          ...(u.uploadRequestsEnabled ? ["uploads"] : []),
        ];
        return { u, customRoles, grants };
      })
      .filter(
        ({ u, customRoles, grants }) =>
          u.role !== "employee" || customRoles.length || grants.length,
      );
    return Promise.all(
      rows.map(async ({ u, customRoles, grants }) => {
        const reviewer = u.accessReviewedByUserId
          ? await ctx.db.get(u.accessReviewedByUserId)
          : null;
        return {
          _id: u._id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          role: u.role,
          customRoles,
          grants,
          lastActiveAt: presence.get(u._id) ?? null,
          reviewedAt: u.accessReviewedAt ?? null,
          reviewedByName: reviewer
            ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ") || reviewer.email
            : null,
        };
      }),
    );
  },
});

export const markAccessReviewed = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
    await ctx.db.patch(userId, { accessReviewedAt: Date.now(), accessReviewedByUserId: admin._id });
    return { ok: true };
  },
});

/** Everything the intranet keeps that belongs to the caller, for "download my
 * data". Other people's content (chat replies, comments) stays out. */
export const exportMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const strip = <T extends { _id: unknown; _creationTime: number }>(row: T) => {
      const { _id, _creationTime, ...rest } = row;
      return rest;
    };
    const [preferences, notificationPreferences, notifications, tickets, guidebookReads, aiRuns] =
      await Promise.all([
        ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique(),
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique(),
        ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(1000),
        ctx.db
          .query("itTickets")
          .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
          .collect(),
        ctx.db
          .query("guidebookReads")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect(),
        ctx.db
          .query("aiRuns")
          .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId))
          .order("desc")
          .take(500),
      ]);
    const suggestions = (await ctx.db.query("suggestions").collect()).filter(
      (s) => s.authorUserId === user._id,
    );
    const {
      clerkUserId: _clerk,
      webauthnUserId: _webauthn,
      oneDrivePermissionId: _onedrive,
      ...profile
    } = user;
    return {
      exportedAt: new Date().toISOString(),
      profile: strip(profile),
      preferences: preferences ? strip(preferences) : null,
      notificationPreferences: notificationPreferences ? strip(notificationPreferences) : null,
      notifications: notifications.map(strip),
      itTickets: tickets.map(strip),
      suggestions: suggestions.map(({ attachments: _a, ...s }) => strip(s)),
      guidebookReads: guidebookReads.map(({ slug, readAt }) => ({ slug, readAt })),
      aiRuns: aiRuns.map((run) => ({
        kind: run.kind,
        status: run.status,
        startedAt: run.startedAt,
        href: run.href ?? null,
      })),
    };
  },
});
