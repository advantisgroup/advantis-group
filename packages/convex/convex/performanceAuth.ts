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

/**
 * Accounts seeded by `seedAdmins` below. Email/name are not secrets and are
 * fine to commit; the password for each comes from a Convex deployment env
 * var (`npx convex env set <var> '...'`), never from source or a CLI arg —
 * both would otherwise land in shell history or git.
 */
const SEED_ADMINS: { email: string; name: string; passwordEnvVar: string }[] = [
  {
    email: "123endres@gmail.com",
    name: "Jörg Endres",
    passwordEnvVar: "PERFORMANCE_ADMIN_1_PASSWORD",
  },
  {
    email: "reichl@salespirates.de",
    name: "Andrea Reichl",
    passwordEnvVar: "PERFORMANCE_ADMIN_2_PASSWORD",
  },
];

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
  handler: async (ctx, { email, name, passwordHash, role }) => {
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
 * One-time bootstrap for the two admin accounts requested for the
 * Performance feature. Idempotent (skips any email that already has a
 * login), same as the reference script's admin seeding. Run via:
 *   npx convex run performanceAuth:seedAdmins
 * after setting each `passwordEnvVar` with `npx convex env set`.
 */
export const seedAdmins = internalAction({
  args: {},
  handler: async ctx => {
    const results: { email: string; status: string }[] = [];
    for (const admin of SEED_ADMINS) {
      const password = process.env[admin.passwordEnvVar];
      if (!password) {
        results.push({
          email: admin.email,
          status: "skipped: env var not set",
        });
        continue;
      }
      const passwordHash = await hashPassword(password);
      const { created } = await ctx.runMutation(
        internal.performanceAuth.createLoginIfMissing,
        { email: admin.email, name: admin.name, passwordHash, role: "admin" }
      );
      results.push({
        email: admin.email,
        status: created ? "created" : "already exists",
      });
    }
    return results;
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
