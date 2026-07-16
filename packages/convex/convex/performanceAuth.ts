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

async function resolveActiveSession(
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

export type PerformanceRole = Doc<"performanceLogins">["role"];
export type PerformanceLoginId = Id<"performanceLogins">;
