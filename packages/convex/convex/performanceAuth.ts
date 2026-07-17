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

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Emails allowed to be bootstrapped as a Performance admin, from the
 * `PERFORMANCE_ADMIN_EMAILS` Convex env var (comma/semicolon/whitespace
 * list) — mirrors `getAdminEmails`/`parseList` in `lib/auth.ts`. Not a
 * secret; unlike the password, it's fine to configure this way. */
function getSeedAdminEmails(): string[] {
  const value = process.env.PERFORMANCE_ADMIN_EMAILS;
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
}

export const getLoginByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<Doc<"performanceLogins"> | null> =>
    await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", email))
      .unique(),
});

export const createLoginIfMissing = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("mitarbeiter")),
  },
  handler: async (
    ctx,
    { email, name, passwordHash, role }
  ): Promise<{ created: boolean }> => {
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", email))
      .unique();
    if (existing) return { created: false };
    await ctx.db.insert("performanceLogins", {
      email,
      name,
      passwordHash,
      role,
      active: true,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

/** Whether `email` is still eligible for self-service admin setup: present
 * in the `PERFORMANCE_ADMIN_EMAILS` allowlist and not already claimed. The
 * setup page uses this to decide whether to show the "first time setup"
 * form at all — it does not gate `setupAccount` itself, which re-checks
 * both conditions server-side regardless. */
export const canSetUpAccount = query({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!getSeedAdminEmails().includes(normalizedEmail)) return false;
    const existing = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", q => q.eq("email", normalizedEmail))
      .unique();
    return !existing;
  },
});

/**
 * Self-service first-time setup: an email in the `PERFORMANCE_ADMIN_EMAILS`
 * allowlist claims its account by choosing its own password, right in the
 * app UI — no CLI, no Convex Dashboard, no env var ever holds a password.
 * Only works once per email (first claim wins); a second attempt for an
 * already-claimed address fails the same generic way as an email that was
 * never on the allowlist, so this can't be used to probe which emails are
 * eligible.
 */
export const setupAccount = action({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, name, password }
  ): Promise<{
    token: string;
    expiresAt: number;
    role: PerformanceRole;
    name: string;
  }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const notAllowed = () =>
      new ConvexError({
        code: "not_allowed",
        message: "This email can't be set up right now.",
      });
    if (!getSeedAdminEmails().includes(normalizedEmail)) throw notAllowed();
    if (password.length < 8) {
      throw new ConvexError({
        code: "validation",
        message: "Password must be at least 8 characters.",
      });
    }

    const passwordHash = await hashPassword(password);
    const { created } = await ctx.runMutation(
      internal.performanceAuth.createLoginIfMissing,
      { email: normalizedEmail, name: name.trim(), passwordHash, role: "admin" }
    );
    if (!created) throw notAllowed(); // already claimed

    const loginRow: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performanceAuth.getLoginByEmail,
      { email: normalizedEmail }
    );
    if (!loginRow) throw notAllowed(); // shouldn't happen; defensive

    const session = await ctx.runMutation(
      internal.performanceAuth.createSession,
      { loginId: loginRow._id }
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      role: loginRow.role,
      name: loginRow.name,
    };
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
    await ctx.db.insert("performanceSessions", {
      token,
      loginId,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
      lastUsedAt: now,
    });
    return { token, expiresAt: now + SESSION_DURATION_MS };
  },
});

/** Verify email+password and start a session. Runs as an action so it can
 * use Web Crypto (PBKDF2) to verify, matching the applicant vault's and the
 * tray-app debug login's existing pattern. */
export const login = action({
  args: { email: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, password }
  ): Promise<{
    token: string;
    expiresAt: number;
    role: PerformanceRole;
    name: string;
  }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const invalid = () =>
      new ConvexError({
        code: "invalid_credentials",
        message: "Email or password is incorrect.",
      });

    const loginRow: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performanceAuth.getLoginByEmail,
      { email: normalizedEmail }
    );
    if (!loginRow || !loginRow.active) throw invalid();

    const ok = await verifyPassword(password, loginRow.passwordHash);
    if (!ok) throw invalid();

    const session = await ctx.runMutation(
      internal.performanceAuth.createSession,
      {
        loginId: loginRow._id,
      }
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      role: loginRow.role,
      name: loginRow.name,
    };
  },
});

export async function resolveActiveSession(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<{
  session: Doc<"performanceSessions">;
  login: Doc<"performanceLogins">;
} | null> {
  if (!token) return null;
  const session = await ctx.db
    .query("performanceSessions")
    .withIndex("by_token", q => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;
  const login = await ctx.db.get(session.loginId);
  if (!login || !login.active) return null;
  return { session, login };
}

/** Require a valid session belonging to an active admin login; throws
 * otherwise. Shared by any Performance query/mutation that needs to gate
 * on "caller is a Performance admin" (e.g. the upload log, later the KPI
 * dashboards' admin-only views) — Performance auth is its own session
 * system, not Clerk, so this is the equivalent of `lib/auth.ts`'s
 * `requireAdmin` for this feature. */
export async function requireAdminLogin(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<Doc<"performanceLogins">> {
  const resolved = await resolveActiveSession(ctx, token);
  if (!resolved || resolved.login.role !== "admin") {
    throw new ConvexError({
      code: "forbidden",
      message: "Admin session required.",
    });
  }
  return resolved.login;
}

export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) return { valid: false as const };
    return {
      valid: true as const,
      loginId: resolved.login._id,
      email: resolved.login.email,
      name: resolved.login.name,
      role: resolved.login.role,
      employeeId: resolved.login.employeeId ?? null,
    };
  },
});

export const touchSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (resolved)
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

/** Throws unless `token` belongs to an active admin; actions have no
 * `ctx.db` so they reach this via `ctx.runQuery` instead of calling
 * `requireAdminLogin` directly. */
export const assertAdminSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Doc<"performanceLogins">> =>
    await requireAdminLogin(ctx, token),
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

export const insertLogin = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("mitarbeiter")),
    employeeId: v.optional(v.id("performanceEmployees")),
  },
  handler: async (ctx, args): Promise<Id<"performanceLogins">> =>
    await ctx.db.insert("performanceLogins", {
      ...args,
      active: true,
      createdAt: Date.now(),
    }),
});

export const setPasswordHash = internalMutation({
  args: { loginId: v.id("performanceLogins"), passwordHash: v.string() },
  handler: async (ctx, { loginId, passwordHash }): Promise<{ ok: true }> => {
    await ctx.db.patch(loginId, { passwordHash });
    return { ok: true };
  },
});

/** All Performance logins, for the admin user-management page. */
export const listLogins = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
    const [logins, employees] = await Promise.all([
      ctx.db.query("performanceLogins").collect(),
      ctx.db.query("performanceEmployees").collect(),
    ]);
    const employeeName = new Map(employees.map(e => [e._id, e.name]));
    return logins
      .map(l => ({
        id: l._id,
        email: l.email,
        name: l.name,
        role: l.role,
        active: l.active,
        employeeId: l.employeeId ?? null,
        employeeName: l.employeeId
          ? (employeeName.get(l.employeeId) ?? null)
          : null,
        createdAt: l.createdAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Employees available to link a login to, for the same page's dropdown —
 * unfiltered (includes owners excluded from team KPI aggregation, since
 * that exclusion is about reporting, not about who can have an account). */
export const listEmployeesForLink = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminLogin(ctx, token);
    const employees = await ctx.db.query("performanceEmployees").collect();
    return employees
      .map(e => ({ id: e._id, name: e.name, active: e.active }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

/** Admin creates a new Performance login directly — unlike `setupAccount`,
 * this isn't gated by the `PERFORMANCE_ADMIN_EMAILS` allowlist, since that
 * allowlist only exists to bootstrap the very first admin. */
export const createLogin = action({
  args: {
    token: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),
    role: v.union(v.literal("admin"), v.literal("mitarbeiter")),
    employeeId: v.optional(v.id("performanceEmployees")),
  },
  handler: async (
    ctx,
    { token, email, name, password, role, employeeId }
  ): Promise<{ id: Id<"performanceLogins"> }> => {
    await ctx.runQuery(internal.performanceAuth.assertAdminSession, {
      token,
    });
    if (password.length < 8) throw passwordTooShort();
    const normalizedEmail = email.trim().toLowerCase();
    const existing: Doc<"performanceLogins"> | null = await ctx.runQuery(
      internal.performanceAuth.getLoginByEmail,
      { email: normalizedEmail }
    );
    if (existing) throw emailTaken();

    const passwordHash = await hashPassword(password);
    const id: Id<"performanceLogins"> = await ctx.runMutation(
      internal.performanceAuth.insertLogin,
      {
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        role,
        employeeId,
      }
    );
    return { id };
  },
});

/** Patch a login's name/role/active/employee link. Password changes go
 * through `resetLoginPassword`/`changeOwnPassword` instead, since hashing
 * needs Web Crypto (only available to actions). Guards the same "can't
 * remove the last active admin" rule as the reference script's
 * `user_update`. */
export const updateLogin = mutation({
  args: {
    token: v.string(),
    loginId: v.id("performanceLogins"),
    name: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("mitarbeiter"))),
    active: v.optional(v.boolean()),
    employeeId: v.optional(v.union(v.id("performanceEmployees"), v.null())),
  },
  handler: async (
    ctx,
    { token, loginId, name, role, active, employeeId }
  ): Promise<{ ok: true }> => {
    await requireAdminLogin(ctx, token);
    const target = await ctx.db.get(loginId);
    if (!target) {
      throw new ConvexError({
        code: "not_found",
        message: "Login not found.",
      });
    }

    const losesAdmin =
      target.role === "admin" &&
      target.active &&
      ((role !== undefined && role !== "admin") || active === false);
    if (losesAdmin) {
      const admins = await ctx.db
        .query("performanceLogins")
        .filter(q =>
          q.and(q.eq(q.field("role"), "admin"), q.eq(q.field("active"), true))
        )
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError({
          code: "last_admin",
          message: "Can't remove the last active admin.",
        });
      }
    }

    await ctx.db.patch(loginId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(employeeId !== undefined
        ? { employeeId: employeeId ?? undefined }
        : {}),
    });
    return { ok: true };
  },
});

/** Admin sets a new password for another login. */
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

export type PerformanceRole = Doc<"performanceLogins">["role"];
export type PerformanceLoginId = Id<"performanceLogins">;
