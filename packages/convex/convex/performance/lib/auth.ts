import { ConvexError } from "convex/values";

import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { type Permission } from "./permissions";
import { getCurrentUser } from "../../lib/auth";
import { isAreaTrusted, isAreaVisitTrusted } from "../../lib/stepUp";

/**
 * Performance login helpers: env allowlists, session and Clerk-link
 * resolution, and the permission gates every Performance module uses.
 * The Convex functions themselves live in `performanceAuth.ts`.
 */

export const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
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

export function isEligibleBootstrapEmail(company: Doc<"companies">, email: string): boolean {
  if (company.adminBootstrapEmails.includes(email)) return true;
  return company.slug === "advantis" && getSeedAdminEmails().includes(email);
}

/** The link lookup without the area-trust check — only `validateSession`
 * uses it, to tell "not linked" apart from "linked but needs to re-verify". */
export async function resolveClerkLinkedLoginRaw(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<"users">; login: Doc<"performanceLogins"> } | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const login = await ctx.db
    .query("performanceLogins")
    .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", user._id))
    .first();
  if (!login || !login.active) return null;
  return { user, login };
}

/** Alternative to the password-session token: if the caller is signed into
 * the intranet via Clerk and an admin has linked their account to a
 * Performance login (`performanceLogins.linkedUserId`, set via the
 * Benutzer page's "Intranet account" field), that login authenticates
 * them without a separate password. Never throws — just returns null when
 * there's no Clerk identity, no matching active login, or the area's
 * re-verification has lapsed.
 *
 * Generalized to any company's logins (not hardcoded to Advantis) — in
 * practice it only has eligible link targets for companies whose staff
 * have an intranet Clerk `users` row, which today is Advantis only. */
export async function resolveClerkLinkedLogin(
  ctx: QueryCtx | MutationCtx,
): Promise<{ session: null; login: Doc<"performanceLogins"> } | null> {
  const raw = await resolveClerkLinkedLoginRaw(ctx);
  if (!raw) return null;
  if (!(await isAreaTrusted(ctx, raw.user._id, "performance"))) return null;
  return { session: null, login: raw.login };
}

export async function resolveActiveSession(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<{
  session: Doc<"performanceSessions"> | null;
  login: Doc<"performanceLogins">;
} | null> {
  if (token) {
    const session = await ctx.db
      .query("performanceSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (session && session.expiresAt >= Date.now()) {
      const login = await ctx.db.get(session.loginId);
      if (login && login.active) {
        // A promoted token's own expiry runs independently of area trust,
        // so it has to stop working once that trust lapses.
        const stillTrusted =
          !session.viaClerk ||
          (login.linkedUserId &&
            (await isAreaVisitTrusted(ctx, login.linkedUserId, "performance")));
        if (stillTrusted) return { session, login };
      }
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
  permission: Permission,
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
  companyId?: Id<"companies">,
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
  token: string,
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
  token: string,
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
  token: string,
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
  employee: Doc<"performanceEmployees">,
): Promise<void> {
  if (login.isSuperAdmin) return;
  if (login.employeeId === employee._id) return;
  await requirePermission(ctx, login, "view_all_employees", employee.companyId);
}

/** Resolves which company a company-scoped query/mutation should act on: an
 * explicitly passed `companyId` always wins (how a super-admin views another
 * company's data), otherwise the caller's own `companyId`. A super-admin
 * backfilled from an existing company login (see the migration) still has
 * their original `companyId` and defaults to it just like a normal login;
 * only a super-admin with no company at all (self-service setup via
 * `setupSuperAdminAccount`) requires an explicit arg. Shared by every
 * Performance module (queries, import, topics) that takes an optional
 * `companyId` arg for this reason. */
export function resolveCompanyId(
  login: Doc<"performanceLogins">,
  companyIdArg: Id<"companies"> | undefined,
): Id<"companies"> {
  if (companyIdArg) return companyIdArg;
  if (login.companyId) return login.companyId;
  if (login.isSuperAdmin) {
    throw new ConvexError({
      code: "validation",
      message: "companyId is required.",
    });
  }
  throw new ConvexError({
    code: "forbidden",
    message: "This login has no company.",
  });
}

/** The intranet account a login's email would auto-link to. Identity only —
 * never touches `roleId`. Anything ambiguous (not Advantis, inactive, already
 * claimed) is left for an admin to link by hand. */
export async function findAutoLinkCandidate(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  email: string,
): Promise<Id<"users"> | null> {
  const company = await ctx.db.get(companyId);
  if (company?.slug !== "advantis") return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!user || user.status !== "active") return null;

  const conflict = await ctx.db
    .query("performanceLogins")
    .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", user._id))
    .first();
  if (conflict) return null;

  return user._id;
}

export function emailTaken(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "email_taken",
    message: "This email is already in use.",
  });
}

export function passwordTooShort(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "validation",
    message: "Password must be at least 8 characters.",
  });
}

export function alreadyLinked(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({
    code: "already_linked",
    message: "This intranet account is already linked to another Performance login.",
  });
}
