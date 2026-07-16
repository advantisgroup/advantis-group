import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
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

/**
 * One-time bootstrap for an admin account. Deliberately not exposed as a
 * public mutation/action — call it once per admin from the Convex
 * Dashboard's "Run Function" UI (Functions → performanceAuth:bootstrapAdmin),
 * typing the plaintext password directly into that form. It never touches a
 * CLI arg or an env var, so it never lands in shell history or git. Only
 * accepts emails present in `PERFORMANCE_ADMIN_EMAILS`; idempotent per email
 * (a second run for the same address is a no-op), same as the reference
 * script's admin seeding.
 */
export const bootstrapAdmin = internalAction({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, name, password }
  ): Promise<{ email: string; status: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!getSeedAdminEmails().includes(normalizedEmail)) {
      throw new ConvexError({
        code: "not_allowed",
        message: `${normalizedEmail} is not in PERFORMANCE_ADMIN_EMAILS.`,
      });
    }
    const passwordHash = await hashPassword(password);
    const { created } = await ctx.runMutation(
      internal.performanceAuth.createLoginIfMissing,
      { email: normalizedEmail, name, passwordHash, role: "admin" }
    );
    return {
      email: normalizedEmail,
      status: created ? "created" : "already exists",
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
