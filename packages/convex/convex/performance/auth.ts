import { action, internalMutation, internalQuery, mutation, query } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { hashPassword, randomToken, verifyPassword } from "../activity/lib/crypto";
import { getCurrentUser } from "../lib/auth";
import { toProfileOption } from "../lib/profile";
import {
  alreadyLinked,
  emailTaken,
  findAutoLinkCandidate,
  getSuperAdminEmails,
  hasPermission,
  isEligibleBootstrapEmail,
  passwordTooShort,
  requireAdminLogin,
  requireSuperAdminLogin,
  resolveActiveSession,
  resolveClerkLinkedLogin,
  resolveClerkLinkedLoginRaw,
  SESSION_DURATION_MS,
} from "./lib/auth";
import {
  AREA_REVERIFY_LEVEL,
  availableMethodsFor,
  getOrDefaultPolicy,
  isLegacyPasswordSunsetInForce,
  legacyPasswordSunsetDeadline,
} from "../lib/stepUp";
import { PERMISSIONS } from "./lib/permissions";

// --------------------------------------------------------------- lookups

export const getLoginByCompanyEmail = internalQuery({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, { companyId, email }): Promise<Doc<"performanceLogins"> | null> =>
    await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", companyId).eq("email", email))
      .unique(),
});

/** A super-admin login has no `companyId`, so it can't use
 * `by_company_email` — email uniqueness for super-admins is enforced in
 * application code (collect the handful of same-email rows across
 * companies, filter for the one flagged `isSuperAdmin`) rather than via a
 * dedicated index, since super-admin logins are expected to be rare. */
export const getSuperAdminLoginByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<Doc<"performanceLogins"> | null> => {
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    return candidates.find((c) => c.isSuperAdmin === true) ?? null;
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
    { email, name, passwordHash, companyId, roleId },
  ): Promise<{ created: boolean }> => {
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", companyId).eq("email", email))
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
  handler: async (ctx, { email, name, passwordHash }): Promise<{ created: boolean }> => {
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    if (candidates.some((c) => c.isSuperAdmin === true)) return { created: false };
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
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!company || company.status !== "active") return false;
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEligibleBootstrapEmail(company, normalizedEmail)) return false;
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) =>
        q.eq("companyId", company._id).eq("email", normalizedEmail),
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
    { slug, email, name, password },
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

    const company = await ctx.runQuery(internal.performance.companies.getBySlugInternal, {
      slug,
    });
    if (!company || company.status !== "active") throw notAllowed();
    if (!isEligibleBootstrapEmail(company, normalizedEmail)) throw notAllowed();

    const adminRole = await ctx.runQuery(internal.performance.companies.getRoleByName, {
      companyId: company._id,
      name: "Admin",
    });
    // Shouldn't happen — every company is seeded with an Admin role at
    // creation time (`companies.upsertProvisioningRow`).
    if (!adminRole) throw notAllowed();

    const passwordHash = await hashPassword(password);
    const { created } = await ctx.runMutation(internal.performance.auth.createLoginIfMissing, {
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      companyId: company._id,
      roleId: adminRole._id,
    });
    if (!created) throw notAllowed(); // already claimed

    const loginRow = await ctx.runQuery(internal.performance.auth.getLoginByCompanyEmail, {
      companyId: company._id,
      email: normalizedEmail,
    });
    if (!loginRow) throw notAllowed(); // shouldn't happen; defensive

    const session = await ctx.runMutation(internal.performance.auth.createSession, {
      loginId: loginRow._id,
    });
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
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .collect();
    return !candidates.some((c) => c.isSuperAdmin === true);
  },
});

export const setupSuperAdminAccount = action({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, name, password },
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
      internal.performance.auth.createSuperAdminLoginIfMissing,
      { email: normalizedEmail, name: name.trim(), passwordHash },
    );
    if (!created) throw notAllowed();

    const loginRow = await ctx.runQuery(internal.performance.auth.getSuperAdminLoginByEmail, {
      email: normalizedEmail,
    });
    if (!loginRow) throw notAllowed();

    const session = await ctx.runMutation(internal.performance.auth.createSession, {
      loginId: loginRow._id,
    });
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      name: loginRow.name,
    };
  },
});

export const createSession = internalMutation({
  args: {
    loginId: v.id("performanceLogins"),
    // Minted from an intranet session rather than a password, so it keeps
    // depending on area trust — see `resolveActiveSession`.
    viaClerk: v.optional(v.boolean()),
  },
  handler: async (ctx, { loginId, viaClerk }): Promise<{ token: string; expiresAt: number }> => {
    const now = Date.now();
    const token = randomToken();
    const login = await ctx.db.get(loginId);
    await ctx.db.insert("performanceSessions", {
      token,
      loginId,
      companyId: login?.companyId,
      viaClerk,
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
    { slug, email, password },
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
      const company = await ctx.runQuery(internal.performance.companies.getBySlugInternal, {
        slug,
      });
      if (!company || company.status !== "active") throw invalid();
      loginRow = await ctx.runQuery(internal.performance.auth.getLoginByCompanyEmail, {
        companyId: company._id,
        email: normalizedEmail,
      });
    } else {
      loginRow = await ctx.runQuery(internal.performance.auth.getSuperAdminLoginByEmail, {
        email: normalizedEmail,
      });
    }
    if (!loginRow || !loginRow.active) throw invalid();

    const ok = await verifyPassword(password, loginRow.passwordHash);
    if (!ok) throw invalid();

    // Only checked after the password is right, so a guesser can't learn
    // from the email alone that an account is linked.
    if (
      loginRow.linkedUserId &&
      (await ctx.runQuery(internal.performance.auth.checkLegacyPasswordSunset, {}))
    ) {
      throw new ConvexError({
        code: "legacy_password_sunset",
        message:
          "Password sign-in for this account has moved — sign in with your intranet account instead.",
      });
    }

    const session = await ctx.runMutation(internal.performance.auth.createSession, {
      loginId: loginRow._id,
    });
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      companyId: loginRow.companyId ?? null,
      isSuperAdmin: loginRow.isSuperAdmin ?? false,
      name: loginRow.name,
    };
  },
});

export const checkLegacyPasswordSunset = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => await isLegacyPasswordSunsetInForce(ctx, "performance"),
});

/** Generic, account-independent — safe to call from the unauthenticated
 * login screen. Never conditioned on whether *this* visitor's account is
 * linked, matching the same account-existence-oracle constraint
 * `requestReset`/`resolveTarget` already enforce elsewhere: revealing that
 * would work the other way around too (confirming a typed email is NOT
 * linked). The banner it backs is static copy shown to everyone on the
 * tenant, not a per-account notice. */
export const legacyPasswordSunsetNotice = query({
  args: {},
  handler: async (ctx): Promise<{ enabled: boolean; deadlineAt: number | null }> => {
    const policy = await getOrDefaultPolicy(ctx);
    const deadline = legacyPasswordSunsetDeadline(policy, "performance");
    return { enabled: deadline !== null, deadlineAt: deadline };
  },
});

/** Promotes a Clerk-linked visitor into a real password-session token, the
 * same kind `login` mints. Needed for `apps/api`'s upload endpoint, which
 * authenticates a bearer token directly against `performanceSessions` and
 * has no way to see the caller's Clerk identity (see
 * `requirePerformanceAdmin`'s doc comment) — so a Clerk-linked login with no
 * password session could never get past it. Returns null when there's no
 * Clerk identity or linked login, same as `resolveClerkLinkedLogin`. */
export const createSessionForLinkedAccount = mutation({
  args: {},
  handler: async (ctx): Promise<{ token: string; expiresAt: number } | null> => {
    const resolved = await resolveClerkLinkedLogin(ctx);
    if (!resolved) return null;
    return await ctx.runMutation(internal.performance.auth.createSession, {
      loginId: resolved.login._id,
      viaClerk: true,
    });
  },
});

export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) {
      // Linked but needing to re-verify gets a step-up prompt, not a
      // password form the account may never have had.
      const raw = await resolveClerkLinkedLoginRaw(ctx);
      if (raw) {
        return {
          valid: false as const,
          needsAreaStepUp: true as const,
          requiredLevel: AREA_REVERIFY_LEVEL,
          availableMethods: await availableMethodsFor(ctx, raw.user._id, AREA_REVERIFY_LEVEL, {
            includePasskey: true,
          }),
        };
      }
      return { valid: false as const };
    }
    const role = resolved.login.roleId ? await ctx.db.get(resolved.login.roleId) : null;
    return {
      valid: true as const,
      loginId: resolved.login._id,
      email: resolved.login.email,
      name: resolved.login.name,
      companyId: resolved.login.companyId ?? null,
      isSuperAdmin: resolved.login.isSuperAdmin ?? false,
      permissions: resolved.login.isSuperAdmin ? [...PERMISSIONS] : (role?.permissions ?? []),
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
    if (resolved?.session) await ctx.db.patch(resolved.session._id, { lastUsedAt: Date.now() });
    return { ok: true };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("performanceSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
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
    autoLinkedVia: v.optional(v.literal("email_match")),
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
      .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", userId))
      .first(),
});

/** Action-side lookup (actions have no `ctx.db`) for `createLogin`'s
 * auto-link attempt when the admin didn't pick a `linkedUserId` themselves. */
export const findAutoLinkCandidateForCompany = internalQuery({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, { companyId, email }): Promise<Id<"users"> | null> =>
    await findAutoLinkCandidate(ctx, companyId, email),
});

/** Nightly: links logins whose intranet account showed up after they were
 * created. Advantis only, the one company that has intranet accounts. */
export const reconcileAutoLinks = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ linked: number }> => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", "advantis"))
      .unique();
    if (!company) return { linked: 0 };

    const logins = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", company._id))
      .collect();

    let linked = 0;
    for (const login of logins) {
      if (login.linkedUserId) continue;
      const candidate = await findAutoLinkCandidate(ctx, company._id, login.email);
      if (!candidate) continue;
      await ctx.db.patch(login._id, { linkedUserId: candidate, autoLinkedVia: "email_match" });
      linked++;
    }
    return { linked };
  },
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
          .withIndex("by_company_email", (q) => q.eq("companyId", admin.companyId!))
          .collect();

    const roleIds = [
      ...new Set(
        logins.map((l) => l.roleId).filter((id): id is Id<"companyRoles"> => id !== undefined),
      ),
    ];
    const roles = await Promise.all(roleIds.map((id) => ctx.db.get(id)));
    const roleName = new Map(
      roles.filter((r): r is Doc<"companyRoles"> => r !== null).map((r) => [r._id, r.name]),
    );

    const employees = admin.isSuperAdmin
      ? await ctx.db.query("performanceEmployees").collect()
      : await ctx.db
          .query("performanceEmployees")
          .withIndex("by_company", (q) => q.eq("companyId", admin.companyId))
          .collect();
    const users = await ctx.db.query("users").collect();
    const employeeName = new Map(employees.map((e) => [e._id, e.name]));
    const userName = new Map(
      users.map((u) => [u._id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]),
    );

    return logins
      .map((l) => ({
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
        employeeName: l.employeeId ? (employeeName.get(l.employeeId) ?? null) : null,
        linkedUserId: l.linkedUserId ?? null,
        linkedUserName: l.linkedUserId ? (userName.get(l.linkedUserId) ?? null) : null,
        autoLinked: l.autoLinkedVia === "email_match",
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
          .withIndex("by_company", (q) => q.eq("companyId", admin.companyId))
          .collect();
    return employees
      .map((e) => ({ id: e._id, name: e.name, active: e.active }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Active intranet accounts available to link a login to, for the same
 * page's "Intranet account" field — each annotated with the Performance
 * login it's already linked to (if any), so the admin UI can warn before
 * reassigning one out from under another login. The intranet `users` table
 * has no company concept of its own (it's Advantis's own staff table), so
 * this returns nothing for any caller whose own company isn't Advantis —
 * their staff never have Clerk intranet accounts, and this table is
 * Advantis's private employee directory, not something another company's
 * admin should ever be able to read. */
export const listIntranetUsersForLink = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdminLogin(ctx, token);
    const company = admin.companyId ? await ctx.db.get(admin.companyId) : null;
    if (company?.slug !== "advantis") return [];

    const [users, logins] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("performanceLogins").collect(),
    ]);
    const linkedToLoginName = new Map(
      logins.filter((l) => l.linkedUserId).map((l) => [l.linkedUserId!, l.name] as const),
    );
    const options = await Promise.all(
      users
        .filter((u) => u.status === "active")
        .map(async (u) => ({
          ...(await toProfileOption(ctx, u)),
          linkedToLoginName: linkedToLoginName.get(u._id) ?? null,
        })),
    );
    return options.sort((a, b) => a.name.localeCompare(b.name));
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
    { token },
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
      .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", user._id))
      .first();
    if (conflict) return { eligible: false };

    return {
      eligible: true,
      loginId: resolved.login._id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
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
      .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", user._id))
      .first();
    if (conflict) throw alreadyLinked();

    await ctx.db.patch(resolved.login._id, { linkedUserId: user._id });
    return { ok: true };
  },
});

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
    { token, email, name, password, roleId, employeeId, linkedUserId, companyId },
  ): Promise<{ id: Id<"performanceLogins"> }> => {
    const admin = await ctx.runQuery(internal.performance.auth.assertAdminSession, {
      token,
    });
    const targetCompanyId = companyId ?? admin.companyId;
    if (!targetCompanyId) {
      throw new ConvexError({
        code: "validation",
        message: "companyId is required.",
      });
    }

    const role = await ctx.runQuery(internal.performance.companies.getRoleByIdInternal, {
      roleId,
    });
    if (!role || role.companyId !== targetCompanyId) {
      throw new ConvexError({
        code: "validation",
        message: "That role doesn't belong to this company.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (linkedUserId) {
      const conflict = await ctx.runQuery(internal.performance.auth.getLoginLinkedTo, {
        userId: linkedUserId,
      });
      if (conflict) throw alreadyLinked();
    }

    // Resolved before the password check: an auto-linked login doesn't
    // need a password any more than an admin-linked one does.
    const autoLinkedUserId = linkedUserId
      ? null
      : await ctx.runQuery(internal.performance.auth.findAutoLinkCandidateForCompany, {
          companyId: targetCompanyId,
          email: normalizedEmail,
        });
    const resolvedLinkedUserId = linkedUserId ?? autoLinkedUserId ?? undefined;

    if (!resolvedLinkedUserId && (!password || password.length < 8)) {
      throw passwordTooShort();
    }

    const existing: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performance.auth.getLoginByCompanyEmail,
      { companyId: targetCompanyId, email: normalizedEmail },
    );
    if (existing) throw emailTaken();

    const passwordHash = await hashPassword(password ?? randomToken());
    const id: Id<"performanceLogins"> = await ctx.runMutation(
      internal.performance.auth.insertLogin,
      {
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        companyId: targetCompanyId,
        roleId,
        employeeId,
        linkedUserId: resolvedLinkedUserId,
        autoLinkedVia: autoLinkedUserId ? "email_match" : undefined,
      },
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
    { token, loginId, name, roleId, active, employeeId, linkedUserId },
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
        .withIndex("by_company_email", (q) => q.eq("companyId", target.companyId!))
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
      ...(employeeId !== undefined ? { employeeId: employeeId ?? undefined } : {}),
      // An admin picking (or clearing) the link by hand is always the
      // human-linked case from here on, whatever it was before.
      ...(linkedUserId !== undefined
        ? { linkedUserId: linkedUserId ?? undefined, autoLinkedVia: undefined }
        : {}),
    });
    return { ok: true };
  },
});

/** Super-admin-only: flips an existing login's cross-company `isSuperAdmin`
 * flag on or off. Promoting leaves `companyId`/`roleId` in place (unused
 * while the flag is set, per `hasPermission`'s bypass) so demoting later
 * restores the login's original company scope and role with no re-picking
 * needed — the same behavior the one-time backfill migration relied on.
 * Blocked on the caller's own login so a super-admin can't strand
 * themselves without Convex Dashboard access. */
export const setSuperAdmin = mutation({
  args: {
    token: v.string(),
    loginId: v.id("performanceLogins"),
    isSuperAdmin: v.boolean(),
  },
  handler: async (ctx, { token, loginId, isSuperAdmin }): Promise<{ ok: true }> => {
    const admin = await requireSuperAdminLogin(ctx, token);
    if (admin._id === loginId) {
      throw new ConvexError({
        code: "cannot_edit_self",
        message: "You can't change your own super-admin status here.",
      });
    }
    const target = await ctx.db.get(loginId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "Login not found." });
    }
    await ctx.db.patch(loginId, { isSuperAdmin });
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
    const admin = await ctx.runQuery(internal.performance.auth.assertAdminSession, {
      token,
    });
    // An admin resets a colleague's password without needing their current
    // one — that's exactly the escape hatch `changeOwnPassword` deliberately
    // doesn't offer. Keeping the two paths mutually exclusive (rather than
    // letting this one double as a shortcut for your own account) is what
    // makes "there are two password screens" make sense instead of being
    // redundant.
    if (admin._id === loginId) {
      throw new ConvexError({
        code: "use_change_own_password",
        message: "Use „My password“ to change your own password (it verifies your current one).",
      });
    }
    const target = await ctx.runQuery(internal.performance.auth.getLoginById, {
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
    await ctx.runMutation(internal.performance.auth.setPasswordHash, {
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
  handler: async (ctx, { token, currentPassword, newPassword }): Promise<{ ok: true }> => {
    const login: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performance.auth.sessionLoginDoc,
      { token },
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
    await ctx.runMutation(internal.performance.auth.setPasswordHash, {
      loginId: login._id,
      passwordHash,
    });
    return { ok: true };
  },
});

export type PerformanceLoginId = Id<"performanceLogins">;
