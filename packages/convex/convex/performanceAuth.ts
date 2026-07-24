import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  hashPassword,
  randomToken,
  verifyPassword,
} from "./activity/lib/crypto";
import { getCurrentUser } from "./lib/auth";
import { PERMISSIONS, type Permission } from "./performance/lib/permissions";

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
}

/** Emails allowed to be bootstrapped as a Performance admin via the old,
 * global `PERFORMANCE_ADMIN_EMAILS` env var. Superseded by each company's
 * own `adminBootstrapEmails`, but grandfathered in for the Advantis company
 * specifically (see `isEligibleBootstrapEmail`) so the pre-multi-tenant
 * deploy's existing config keeps working unchanged. */
export function getSeedAdminEmails(): string[] {
  return parseEmailList(process.env.PERFORMANCE_ADMIN_EMAILS);
}

/** Emails allowed to self-claim a cross-company `isSuperAdmin` login, from
 * `PERFORMANCE_SUPER_ADMIN_EMAILS` — the one piece of Performance config
 * that legitimately stays global rather than per-company, since a
 * super-admin is cross-company by definition and isn't something any
 * "create company" flow would ever set. */
export function getSuperAdminEmails(): string[] {
  return parseEmailList(process.env.PERFORMANCE_SUPER_ADMIN_EMAILS);
}

function isEligibleBootstrapEmail(company: Doc<"companies">, email: string): boolean {
  if (company.adminBootstrapEmails.includes(email)) return true;
  return company.slug === "advantis" && getSeedAdminEmails().includes(email);
}

// --------------------------------------------------------------- lookups

export const getLoginByCompanyEmail = internalQuery({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (
    ctx,
    { companyId, email }
  ): Promise<Doc<"performanceLogins"> | null> =>
    await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", q =>
        q.eq("companyId", companyId).eq("email", email)
      )
      .unique(),
});

/** A super-admin login has no `companyId`, so it can't use
 * `by_company_email` — email uniqueness for super-admins is enforced in
 * application code (collect the handful of same-email rows across
 * companies, filter for the one flagged `isSuperAdmin`) rather than via a
 * dedicated index, since super-admin logins are expected to be rare. */
export const getSuperAdminLoginByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (
    ctx,
    { email }
  ): Promise<Doc<"performanceLogins"> | null> => {
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", email))
      .collect();
    return candidates.find(c => c.isSuperAdmin === true) ?? null;
  },
});

export const createLoginIfMissing = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    companyId: v.id("companies"),
    roleId: v.id("companyRoles"),
  },
  handler: async (
    ctx,
    { email, name, passwordHash, companyId, roleId }
  ): Promise<{ created: boolean }> => {
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", q =>
        q.eq("companyId", companyId).eq("email", email)
      )
      .unique();
    if (existing) return { created: false };
    await ctx.db.insert("performanceLogins", {
      email,
      name,
      passwordHash,
      companyId,
      roleId,
      active: true,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

export const createSuperAdminLoginIfMissing = internalMutation({
  args: { email: v.string(), name: v.string(), passwordHash: v.string() },
  handler: async (
    ctx,
    { email, name, passwordHash }
  ): Promise<{ created: boolean }> => {
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", email))
      .collect();
    if (candidates.some(c => c.isSuperAdmin === true)) return { created: false };
    await ctx.db.insert("performanceLogins", {
      email,
      name,
      passwordHash,
      isSuperAdmin: true,
      active: true,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

/** Whether `email` is still eligible for this company's self-service admin
 * setup: present in its (or, for Advantis, the legacy global) bootstrap
 * allowlist and not already claimed. */
export const canSetUpAccount = query({
  args: { slug: v.string(), email: v.string() },
  handler: async (ctx, { slug, email }): Promise<boolean> => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", q => q.eq("slug", slug))
      .unique();
    if (!company || company.status !== "active") return false;
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEligibleBootstrapEmail(company, normalizedEmail)) return false;
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", q =>
        q.eq("companyId", company._id).eq("email", normalizedEmail)
      )
      .unique();
    return !existing;
  },
});

/**
 * Self-service first-time setup: an email on a company's
 * `adminBootstrapEmails` list claims that company's built-in Admin role by
 * choosing its own password, right in the app UI — no CLI, no Convex
 * Dashboard, no env var ever holds a password. Only works once per
 * (company, email) — a second attempt fails the same generic way as an
 * email that was never eligible, so this can't be used to probe which
 * emails are eligible.
 */
export const setupAccount = action({
  args: {
    slug: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    { slug, email, name, password }
  ): Promise<{
    token: string;
    expiresAt: number;
    companyId: Id<"companies">;
    roleId: Id<"companyRoles">;
    name: string;
  }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const notAllowed = () =>
      new ConvexError({
        code: "not_allowed",
        message: "This email can't be set up right now.",
      });
    if (password.length < 8) {
      throw new ConvexError({
        code: "validation",
        message: "Password must be at least 8 characters.",
      });
    }

    const company = await ctx.runQuery(internal.companies.getBySlugInternal, {
      slug,
    });
    if (!company || company.status !== "active") throw notAllowed();
    if (!isEligibleBootstrapEmail(company, normalizedEmail)) throw notAllowed();

    const adminRole = await ctx.runQuery(internal.companies.getRoleByName, {
      companyId: company._id,
      name: "Admin",
    });
    // Shouldn't happen — every company is seeded with an Admin role at
    // creation time (`companies.upsertProvisioningRow`).
    if (!adminRole) throw notAllowed();

    const passwordHash = await hashPassword(password);
    const { created } = await ctx.runMutation(
      internal.performanceAuth.createLoginIfMissing,
      {
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        companyId: company._id,
        roleId: adminRole._id,
      }
    );
    if (!created) throw notAllowed(); // already claimed

    const loginRow = await ctx.runQuery(
      internal.performanceAuth.getLoginByCompanyEmail,
      { companyId: company._id, email: normalizedEmail }
    );
    if (!loginRow) throw notAllowed(); // shouldn't happen; defensive

    const session = await ctx.runMutation(
      internal.performanceAuth.createSession,
      { loginId: loginRow._id }
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      companyId: company._id,
      roleId: adminRole._id,
      name: loginRow.name,
    };
  },
});

/** Same self-service shape as `canSetUpAccount`/`setupAccount`, for the one
 * login that isn't scoped to any company: the platform-level super-admin,
 * bootstrapped via `PERFORMANCE_SUPER_ADMIN_EMAILS` instead of a
 * per-company list. */
export const canSetUpSuperAdmin = query({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!getSuperAdminEmails().includes(normalizedEmail)) return false;
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", normalizedEmail))
      .collect();
    return !candidates.some(c => c.isSuperAdmin === true);
  },
});

export const setupSuperAdminAccount = action({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, name, password }
  ): Promise<{ token: string; expiresAt: number; name: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const notAllowed = () =>
      new ConvexError({
        code: "not_allowed",
        message: "This email can't be set up right now.",
      });
    if (!getSuperAdminEmails().includes(normalizedEmail)) throw notAllowed();
    if (password.length < 8) {
      throw new ConvexError({
        code: "validation",
        message: "Password must be at least 8 characters.",
      });
    }
    const passwordHash = await hashPassword(password);
    const { created } = await ctx.runMutation(
      internal.performanceAuth.createSuperAdminLoginIfMissing,
      { email: normalizedEmail, name: name.trim(), passwordHash }
    );
    if (!created) throw notAllowed();

    const loginRow = await ctx.runQuery(
      internal.performanceAuth.getSuperAdminLoginByEmail,
      { email: normalizedEmail }
    );
    if (!loginRow) throw notAllowed();

    const session = await ctx.runMutation(
      internal.performanceAuth.createSession,
      { loginId: loginRow._id }
    );
    return { token: session.token, expiresAt: session.expiresAt, name: loginRow.name };
  },
});

export const createSession = internalMutation({
  args: { loginId: v.id("performanceLogins") },
  handler: async (
    ctx,
    { loginId }
  ): Promise<{ token: string; expiresAt: number }> => {
    const now = Date.now();
    const token = randomToken();
    const login = await ctx.db.get(loginId);
    await ctx.db.insert("performanceSessions", {
      token,
      loginId,
      companyId: login?.companyId,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
      lastUsedAt: now,
    });
    return { token, expiresAt: now + SESSION_DURATION_MS };
  },
});

/** Verify email+password and start a session. `slug` omitted means "this is
 * a super-admin login attempt" (no company to scope by); runs as an action
 * so it can use Web Crypto (PBKDF2) to verify, matching the applicant
 * vault's and the tray-app debug login's existing pattern. */
export const login = action({
  args: {
    slug: v.optional(v.string()),
    email: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    { slug, email, password }
  ): Promise<{
    token: string;
    expiresAt: number;
    companyId: Id<"companies"> | null;
    isSuperAdmin: boolean;
    name: string;
  }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const invalid = () =>
      new ConvexError({
        code: "invalid_credentials",
        message: "Email or password is incorrect.",
      });

    let loginRow: Doc<"performanceLogins"> | null;
    if (slug) {
      const company = await ctx.runQuery(internal.companies.getBySlugInternal, {
        slug,
      });
      if (!company || company.status !== "active") throw invalid();
      loginRow = await ctx.runQuery(
        internal.performanceAuth.getLoginByCompanyEmail,
        { companyId: company._id, email: normalizedEmail }
      );
    } else {
      loginRow = await ctx.runQuery(
        internal.performanceAuth.getSuperAdminLoginByEmail,
        { email: normalizedEmail }
      );
    }
    if (!loginRow || !loginRow.active) throw invalid();

    const ok = await verifyPassword(password, loginRow.passwordHash);
    if (!ok) throw invalid();

    const session = await ctx.runMutation(
      internal.performanceAuth.createSession,
      { loginId: loginRow._id }
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      companyId: loginRow.companyId ?? null,
      isSuperAdmin: loginRow.isSuperAdmin ?? false,
      name: loginRow.name,
    };
  },
});

/** Alternative to the password-session token: if the caller is signed into
 * the intranet via Clerk and an admin has linked their account to a
 * Performance login (`performanceLogins.linkedUserId`, set via the
 * Benutzer page's "Intranet account" field), that login authenticates
 * them without a separate password. Never throws — just returns null when
 * there's no Clerk identity or no matching active login, so callers fall
 * through to "please sign in" the same as an invalid password token.
 *
 * Generalized to any company's logins (not hardcoded to Advantis) — in
 * practice it only has eligible link targets for companies whose staff
 * have an intranet Clerk `users` row, which today is Advantis only. */
async function resolveClerkLinkedLogin(
  ctx: QueryCtx | MutationCtx
): Promise<{ session: null; login: Doc<"performanceLogins"> } | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const login = await ctx.db
    .query("performanceLogins")
    .withIndex("by_linkedUserId", q => q.eq("linkedUserId", user._id))
    .first();
  if (!login || !login.active) return null;
  return { session: null, login };
}

export async function resolveActiveSession(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<{
  session: Doc<"performanceSessions"> | null;
  login: Doc<"performanceLogins">;
} | null> {
  if (token) {
    const session = await ctx.db
      .query("performanceSessions")
      .withIndex("by_token", q => q.eq("token", token))
      .unique();
    if (session && session.expiresAt >= Date.now()) {
      const login = await ctx.db.get(session.loginId);
      if (login && login.active) return { session, login };
    }
  }
  return resolveClerkLinkedLogin(ctx);
}

// ------------------------------------------------------- permission gates

/** Whether `login` holds `permission`, either directly (via its role's
 * bundle) or by being a cross-company super-admin (always true). Doesn't
 * check company scoping itself — see `requirePermission` for the
 * throw-or-scope-checked version most call sites want. */
export async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  login: Doc<"performanceLogins">,
  permission: Permission
): Promise<boolean> {
  if (login.isSuperAdmin) return true;
  if (!login.roleId) return false;
  const role = await ctx.db.get(login.roleId);
  return role?.permissions.includes(permission) ?? false;
}

/** The universal permission gate every Performance query/mutation/action
 * uses. `companyId`, when supplied, is the company whose data is actually
 * being touched (e.g. a specific employee's `companyId`) — a company-scoped
 * login must match it exactly; a super-admin bypasses this check entirely,
 * including for companies that don't exist yet at the time it was granted. */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  login: Doc<"performanceLogins">,
  permission: Permission,
  companyId?: Id<"companies">
): Promise<void> {
  if (login.isSuperAdmin) return;
  if (companyId !== undefined && login.companyId !== companyId) {
    throw new ConvexError({
      code: "forbidden",
      message: "You can't act on this company.",
    });
  }
  if (!(await hasPermission(ctx, login, permission))) {
    throw new ConvexError({
      code: "forbidden",
      message: "You don't have permission to do this.",
    });
  }
}

/** Require a valid session belonging to a login that can manage other
 * logins (`manage_logins`) — the closest equivalent to the old fixed
 * "admin" role, used to gate the user-management surface (`listLogins`,
 * `createLogin`, `updateLogin`, and the upload/export server-key path via
 * `assertAdminSession`). */
export async function requireAdminLogin(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<Doc<"performanceLogins">> {
  const resolved = await resolveActiveSession(ctx, token);
  if (!resolved) {
    throw new ConvexError({
      code: "forbidden",
      message: "Admin session required.",
    });
  }
  await requirePermission(ctx, resolved.login, "manage_logins");
  return resolved.login;
}

/** Require a valid session belonging to the cross-company super-admin —
 * gates platform-level actions like creating a company, which isn't a
 * per-company permission at all. */
export async function requireSuperAdminLogin(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<Doc<"performanceLogins">> {
  const resolved = await resolveActiveSession(ctx, token);
  if (!resolved || !resolved.login.isSuperAdmin) {
    throw new ConvexError({
      code: "forbidden",
      message: "Super-admin session required.",
    });
  }
  return resolved.login;
}

/**
 * Require *any* valid Performance session (not necessarily privileged) and
 * return its login row; throws `unauthenticated` otherwise.
 */
export async function requireSessionLogin(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<Doc<"performanceLogins">> {
  const resolved = await resolveActiveSession(ctx, token);
  if (!resolved) {
    throw new ConvexError({
      code: "unauthenticated",
      message: "Please sign in.",
    });
  }
  return resolved.login;
}

/** Mirrors the reference script's `may_view_employee`: a super-admin or a
 * login with `view_all_employees` for `employee`'s company sees it; a plain
 * login only ever sees its own linked employee. Takes the employee **doc**
 * (not just its id) so it can read `employee.companyId` — every call site
 * needs the doc in hand before calling this. */
export async function requireCanViewEmployee(
  ctx: QueryCtx | MutationCtx,
  login: Doc<"performanceLogins">,
  employee: Doc<"performanceEmployees">
): Promise<void> {
  if (login.isSuperAdmin) return;
  if (login.employeeId === employee._id) return;
  await requirePermission(ctx, login, "view_all_employees", employee.companyId);
}

/** Resolves which company a company-scoped query/mutation should act on:
 * the caller's own for a normal login, or — for a cross-company
 * super-admin, who has no `companyId` of their own — whichever `companyId`
 * they explicitly passed in. Shared by every Performance module (queries,
 * import, topics) that takes an optional `companyId` arg for this reason. */
export function resolveCompanyId(
  login: Doc<"performanceLogins">,
  companyIdArg: Id<"companies"> | undefined
): Id<"companies"> {
  if (login.isSuperAdmin) {
    if (!companyIdArg) {
      throw new ConvexError({
        code: "validation",
        message: "companyId is required.",
      });
    }
    return companyIdArg;
  }
  if (!login.companyId) {
    throw new ConvexError({
      code: "forbidden",
      message: "This login has no company.",
    });
  }
  return login.companyId;
}

export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) return { valid: false as const };
    const role = resolved.login.roleId
      ? await ctx.db.get(resolved.login.roleId)
      : null;
    return {
      valid: true as const,
      loginId: resolved.login._id,
      email: resolved.login.email,
      name: resolved.login.name,
      companyId: resolved.login.companyId ?? null,
      isSuperAdmin: resolved.login.isSuperAdmin ?? false,
      permissions: resolved.login.isSuperAdmin
        ? [...PERMISSIONS]
        : (role?.permissions ?? []),
      employeeId: resolved.login.employeeId ?? null,
      // True when this session came from the caller's linked Clerk
      // identity rather than the password-session token — the client uses
      // this to skip the password-only chrome (exit/change-password links
      // that assume a Performance session exists to invalidate).
      viaClerk: resolved.session === null,
    };
  },
});

export const touchSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (resolved?.session)
      await ctx.db.patch(resolved.session._id, { lastUsedAt: Date.now() });
    return { ok: true };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("performanceSessions")
      .withIndex("by_token", q => q.eq("token", token))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});

// ------------------------------------------------------------- admin tools

/** Throws unless `token` belongs to a login that can manage other logins —
 * actions have no `ctx.db` so they reach this via `ctx.runQuery` instead of
 * calling `requireAdminLogin` directly. */
export const assertAdminSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Doc<"performanceLogins">> =>
    await requireAdminLogin(ctx, token),
});

/** Action-side equivalent of `requireSuperAdminLogin`, for `companies.ts`'s
 * `createCompany`/`listCompanies`. */
export const assertSuperAdminSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Doc<"performanceLogins">> =>
    await requireSuperAdminLogin(ctx, token),
});

/** Resolves a session token to its login doc, or null — the action-side
 * equivalent of `resolveActiveSession` for handlers with no `ctx.db`. */
export const sessionLoginDoc = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Doc<"performanceLogins"> | null> => {
    const resolved = await resolveActiveSession(ctx, token);
    return resolved ? resolved.login : null;
  },
});

/** Plain by-id lookup for handlers with no `ctx.db` (actions) — used by
 * `resetLoginPassword` to check the target login's `companyId` before
 * letting a company-scoped admin touch it. */
export const getLoginById = internalQuery({
  args: { loginId: v.id("performanceLogins") },
  handler: async (ctx, { loginId }): Promise<Doc<"performanceLogins"> | null> =>
    await ctx.db.get(loginId),
});

export const insertLogin = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    companyId: v.id("companies"),
    roleId: v.id("companyRoles"),
    employeeId: v.optional(v.id("performanceEmployees")),
    linkedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<Id<"performanceLogins">> =>
    await ctx.db.insert("performanceLogins", {
      ...args,
      active: true,
      createdAt: Date.now(),
    }),
});

/** The login already linked to `userId`, if any — the action-side lookup
 * `createLogin`/`updateLogin`'s conflict checks need (actions have no
 * `ctx.db`). */
export const getLoginLinkedTo = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Doc<"performanceLogins"> | null> =>
    await ctx.db
      .query("performanceLogins")
      .withIndex("by_linkedUserId", q => q.eq("linkedUserId", userId))
      .first(),
});

export const setPasswordHash = internalMutation({
  args: { loginId: v.id("performanceLogins"), passwordHash: v.string() },
  handler: async (ctx, { loginId, passwordHash }): Promise<{ ok: true }> => {
    await ctx.db.patch(loginId, { passwordHash });
    return { ok: true };
  },
});

/** All Performance logins for the caller's company (every company, for a
 * super-admin), for the admin user-management page. */
export const listLogins = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdminLogin(ctx, token);
    const logins = admin.isSuperAdmin
      ? await ctx.db.query("performanceLogins").collect()
      : await ctx.db
          .query("performanceLogins")
          .withIndex("by_company_email", q =>
            q.eq("companyId", admin.companyId!)
          )
          .collect();

    const roleIds = [
      ...new Set(
        logins
          .map(l => l.roleId)
          .filter((id): id is Id<"companyRoles"> => id !== undefined)
      ),
    ];
    const roles = await Promise.all(roleIds.map(id => ctx.db.get(id)));
    const roleName = new Map(
      roles
        .filter((r): r is Doc<"companyRoles"> => r !== null)
        .map(r => [r._id, r.name])
    );

    const employees = admin.isSuperAdmin
      ? await ctx.db.query("performanceEmployees").collect()
      : await ctx.db
          .query("performanceEmployees")
          .withIndex("by_company", q => q.eq("companyId", admin.companyId))
          .collect();
    const users = await ctx.db.query("users").collect();
    const employeeName = new Map(employees.map(e => [e._id, e.name]));
    const userName = new Map(
      users.map(u => [
        u._id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      ])
    );

    return logins
      .map(l => ({
        id: l._id,
        email: l.email,
        name: l.name,
        roleId: l.roleId ?? null,
        roleName: l.isSuperAdmin
          ? "Super Admin"
          : l.roleId
            ? (roleName.get(l.roleId) ?? null)
            : null,
        isSuperAdmin: l.isSuperAdmin ?? false,
        active: l.active,
        employeeId: l.employeeId ?? null,
        employeeName: l.employeeId
          ? (employeeName.get(l.employeeId) ?? null)
          : null,
        linkedUserId: l.linkedUserId ?? null,
        linkedUserName: l.linkedUserId
          ? (userName.get(l.linkedUserId) ?? null)
          : null,
        createdAt: l.createdAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Employees available to link a login to, for the same page's dropdown —
 * unfiltered by active status (includes owners excluded from team KPI
 * aggregation, since that exclusion is about reporting, not about who can
 * have an account), scoped to the caller's own company (every company, for
 * a super-admin). */
export const listEmployeesForLink = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdminLogin(ctx, token);
    const employees = admin.isSuperAdmin
      ? await ctx.db.query("performanceEmployees").collect()
      : await ctx.db
          .query("performanceEmployees")
          .withIndex("by_company", q => q.eq("companyId", admin.companyId))
          .collect();
    return employees
      .map(e => ({ id: e._id, name: e.name, active: e.active }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Active intranet accounts available to link a login to, for the same
 * page's "Intranet account" field — each annotated with the Performance
 * login it's already linked to (if any), so the admin UI can warn before
 * reassigning one out from under another login. Not company-scoped: the
 * intranet `users` table has no company concept of its own (it's Advantis's
 * own staff table), so this is naturally Advantis-only in effect today. */
export const listIntranetUsersForLink = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
    const [users, logins] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("performanceLogins").collect(),
    ]);
    const linkedToLoginName = new Map(
      logins
        .filter(l => l.linkedUserId)
        .map(l => [l.linkedUserId!, l.name] as const)
    );
    return users
      .filter(u => u.status === "active")
      .map(u => ({
        id: u._id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        email: u.email,
        avatarUrl: u.avatarUrl ?? null,
        linkedToLoginName: linkedToLoginName.get(u._id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Whether the caller — signed into a real Performance password session
 * right now — could link that login to their own signed-in intranet
 * (Clerk) account, for the self-service "link me" prompt shown after a
 * password login. Gated on `manage_logins` (the closest equivalent of the
 * old admin-only restriction) by design (self-linking a plain login goes
 * through the admin picker on the Benutzer page instead, so an admin
 * always sees who's linked to what). Deliberately narrower than that admin
 * picker in one other way too: only offers linking the login the caller is
 * *currently signed in as*, to their *own* Clerk identity — never someone
 * else's. */
export const myLinkableClerkIdentity = query({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token }
  ): Promise<
    | { eligible: false }
    | {
        eligible: true;
        loginId: Id<"performanceLogins">;
        name: string;
        email: string;
      }
  > => {
    const resolved = await resolveActiveSession(ctx, token);
    // Only a genuine password session is offered this prompt — one that
    // already resolved via a Clerk link (resolved.session === null) is
    // linked already, and has nothing to gain from it.
    if (!resolved || !resolved.session) return { eligible: false };
    if (!(await hasPermission(ctx, resolved.login, "manage_logins"))) {
      return { eligible: false };
    }
    if (resolved.login.linkedUserId) return { eligible: false };

    const user = await getCurrentUser(ctx);
    if (!user) return { eligible: false };

    const conflict = await ctx.db
      .query("performanceLogins")
      .withIndex("by_linkedUserId", q => q.eq("linkedUserId", user._id))
      .first();
    if (conflict) return { eligible: false };

    return {
      eligible: true,
      loginId: resolved.login._id,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      email: user.email,
    };
  },
});

/** Links the caller's current password-session login to their own signed-in
 * intranet account — the mutation behind the self-service "link me" prompt.
 * Re-checks every condition `myLinkableClerkIdentity` reported, since
 * either side could have changed between the query and this call. */
export const linkMyAccount = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ ok: true }> => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved || !resolved.session) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Please sign in.",
      });
    }
    if (!(await hasPermission(ctx, resolved.login, "manage_logins"))) {
      throw new ConvexError({
        code: "forbidden",
        message: "Admin session required.",
      });
    }
    if (resolved.login.linkedUserId) {
      throw new ConvexError({
        code: "already_linked",
        message: "This login is already linked to an intranet account.",
      });
    }

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "no_intranet_account",
        message: "No signed-in intranet account found.",
      });
    }

    const conflict = await ctx.db
      .query("performanceLogins")
      .withIndex("by_linkedUserId", q => q.eq("linkedUserId", user._id))
      .first();
    if (conflict) throw alreadyLinked();

    await ctx.db.patch(resolved.login._id, { linkedUserId: user._id });
    return { ok: true };
  },
});

function emailTaken(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "email_taken",
    message: "This email is already in use.",
  });
}

function passwordTooShort(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "validation",
    message: "Password must be at least 8 characters.",
  });
}

function alreadyLinked(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "already_linked",
    message:
      "This intranet account is already linked to another Performance login.",
  });
}

/** Admin creates a new Performance login directly — unlike `setupAccount`,
 * this isn't gated by an allowlist, since that allowlist only exists to
 * bootstrap the very first admin. Scoped to the caller's own company,
 * unless the caller is a super-admin explicitly passing `companyId` (e.g.
 * from the platform-level admin UI).
 *
 * `password` is only required when `linkedUserId` is omitted. A login
 * created with `linkedUserId` set authenticates entirely through that
 * person's existing intranet (Clerk) session (see `resolveActiveSession`)
 * — they never see a password, so one is never asked for; a random,
 * never-surfaced hash fills the (mandatory) `passwordHash` column so the
 * account still can't be brute-forced if an admin later unlinks it. */
export const createLogin = action({
  args: {
    token: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.optional(v.string()),
    roleId: v.id("companyRoles"),
    employeeId: v.optional(v.id("performanceEmployees")),
    linkedUserId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (
    ctx,
    { token, email, name, password, roleId, employeeId, linkedUserId, companyId }
  ): Promise<{ id: Id<"performanceLogins"> }> => {
    const admin = await ctx.runQuery(internal.performanceAuth.assertAdminSession, {
      token,
    });
    const targetCompanyId = admin.isSuperAdmin ? companyId : admin.companyId;
    if (!targetCompanyId) {
      throw new ConvexError({
        code: "validation",
        message: "companyId is required.",
      });
    }

    const role = await ctx.runQuery(internal.companies.getRoleByIdInternal, {
      roleId,
    });
    if (!role || role.companyId !== targetCompanyId) {
      throw new ConvexError({
        code: "validation",
        message: "That role doesn't belong to this company.",
      });
    }

    if (linkedUserId) {
      const conflict = await ctx.runQuery(
        internal.performanceAuth.getLoginLinkedTo,
        { userId: linkedUserId }
      );
      if (conflict) throw alreadyLinked();
    } else if (!password || password.length < 8) {
      throw passwordTooShort();
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performanceAuth.getLoginByCompanyEmail,
      { companyId: targetCompanyId, email: normalizedEmail }
    );
    if (existing) throw emailTaken();

    const passwordHash = await hashPassword(password ?? randomToken());
    const id: Id<"performanceLogins"> = await ctx.runMutation(
      internal.performanceAuth.insertLogin,
      {
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        companyId: targetCompanyId,
        roleId,
        employeeId,
        linkedUserId,
      }
    );
    return { id };
  },
});

/** Patch a login's name/roleId/active/employee link. Password changes go
 * through `resetLoginPassword`/`changeOwnPassword` instead, since hashing
 * needs Web Crypto (only available to actions). Guards the same "can't
 * remove the last active admin" rule as before, generalized to "can't
 * remove the last active login holding `manage_logins` for this company". */
export const updateLogin = mutation({
  args: {
    token: v.string(),
    loginId: v.id("performanceLogins"),
    name: v.optional(v.string()),
    roleId: v.optional(v.id("companyRoles")),
    active: v.optional(v.boolean()),
    employeeId: v.optional(v.union(v.id("performanceEmployees"), v.null())),
    linkedUserId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (
    ctx,
    { token, loginId, name, roleId, active, employeeId, linkedUserId }
  ): Promise<{ ok: true }> => {
    const admin = await requireAdminLogin(ctx, token);
    const target = await ctx.db.get(loginId);
    if (!target) {
      throw new ConvexError({
        code: "not_found",
        message: "Login not found.",
      });
    }
    if (!admin.isSuperAdmin && target.companyId !== admin.companyId) {
      throw new ConvexError({
        code: "forbidden",
        message: "You can't edit this login.",
      });
    }
    if (target.isSuperAdmin && !admin.isSuperAdmin) {
      throw new ConvexError({
        code: "forbidden",
        message: "You can't edit a super-admin login.",
      });
    }

    if (roleId !== undefined) {
      const role = await ctx.db.get(roleId);
      if (!role || (target.companyId && role.companyId !== target.companyId)) {
        throw new ConvexError({
          code: "validation",
          message: "That role doesn't belong to this company.",
        });
      }
    }

    const losingManageLogins =
      !target.isSuperAdmin &&
      target.companyId !== undefined &&
      (await hasPermission(ctx, target, "manage_logins")) &&
      ((roleId !== undefined &&
        !(await hasPermission(ctx, { ...target, roleId }, "manage_logins"))) ||
        active === false);

    if (losingManageLogins) {
      const companyLogins = await ctx.db
        .query("performanceLogins")
        .withIndex("by_company_email", q =>
          q.eq("companyId", target.companyId!)
        )
        .collect();
      let remainingManagers = 0;
      for (const l of companyLogins) {
        if (l._id === target._id || !l.active) continue;
        if (await hasPermission(ctx, l, "manage_logins")) remainingManagers++;
      }
      if (remainingManagers === 0) {
        throw new ConvexError({
          code: "last_admin",
          message: "Can't remove the last active admin for this company.",
        });
      }
    }

    await ctx.db.patch(loginId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(roleId !== undefined ? { roleId } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(employeeId !== undefined
        ? { employeeId: employeeId ?? undefined }
        : {}),
      ...(linkedUserId !== undefined
        ? { linkedUserId: linkedUserId ?? undefined }
        : {}),
    });
    return { ok: true };
  },
});

/** Admin sets a new password for another login in their own company (or, for
 * a super-admin, any login). */
export const resetLoginPassword = action({
  args: {
    token: v.string(),
    loginId: v.id("performanceLogins"),
    password: v.string(),
  },
  handler: async (ctx, { token, loginId, password }): Promise<{ ok: true }> => {
    const admin = await ctx.runQuery(
      internal.performanceAuth.assertAdminSession,
      {
        token,
      }
    );
    // An admin resets a colleague's password without needing their current
    // one — that's exactly the escape hatch `changeOwnPassword` deliberately
    // doesn't offer. Keeping the two paths mutually exclusive (rather than
    // letting this one double as a shortcut for your own account) is what
    // makes "there are two password screens" make sense instead of being
    // redundant.
    if (admin._id === loginId) {
      throw new ConvexError({
        code: "use_change_own_password",
        message:
          "Use „My password“ to change your own password (it verifies your current one).",
      });
    }
    const target = await ctx.runQuery(internal.performanceAuth.getLoginById, {
      loginId,
    });
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "Login not found." });
    }
    if (!admin.isSuperAdmin && target.companyId !== admin.companyId) {
      throw new ConvexError({
        code: "forbidden",
        message: "You can't reset this login's password.",
      });
    }
    if (password.length < 8) throw passwordTooShort();
    const passwordHash = await hashPassword(password);
    await ctx.runMutation(internal.performanceAuth.setPasswordHash, {
      loginId,
      passwordHash,
    });
    return { ok: true };
  },
});

/** Any logged-in user changes their own password, given the current one. */
export const changeOwnPassword = action({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (
    ctx,
    { token, currentPassword, newPassword }
  ): Promise<{ ok: true }> => {
    const login: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performanceAuth.sessionLoginDoc,
      { token }
    );
    if (!login) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Please sign in.",
      });
    }
    const ok = await verifyPassword(currentPassword, login.passwordHash);
    if (!ok) {
      throw new ConvexError({
        code: "invalid_credentials",
        message: "Current password is incorrect.",
      });
    }
    if (newPassword.length < 8) throw passwordTooShort();
    const passwordHash = await hashPassword(newPassword);
    await ctx.runMutation(internal.performanceAuth.setPasswordHash, {
      loginId: login._id,
      passwordHash,
    });
    return { ok: true };
  },
});

export type PerformanceLoginId = Id<"performanceLogins">;
