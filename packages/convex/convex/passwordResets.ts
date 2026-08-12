import { sandboxedAction as action, sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  isRecentlyVerified,
  issueCode,
  needsVerificationHint,
  verifyCode,
  type VerificationHint,
} from "./lib/adminVerification";
import { hashPassword, randomToken, sha256hex } from "./activity/lib/crypto";
import { trackEvent } from "./lib/analytics";
import {
  effectiveRole,
  getCurrentUser,
  isApplicantAreaMember,
  requireAdmin,
  requireUser,
} from "./lib/auth";
import { notifyUsers } from "./lib/notify";
import { passwordResetScopeValidator } from "./schema";

export type PasswordResetScope = "hr" | "performance";
type AuditEvent = Doc<"passwordResetAuditLog">["event"];

/** One ping per account per day. Deliberately keyed on the *account* rather
 * than the filer, so the limit can't be walked around by filing from a
 * second browser or identity. */
const REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** How long an issued magic link stays usable. Short on purpose: the link is
 * a full password-change capability sitting in an inbox. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

const MIN_PASSWORD_LENGTH = 8;

const SCOPE_LABEL: Record<PasswordResetScope, string> = {
  hr: "Human Resources",
  performance: "Performance",
};

/** `abc***@advantisgroup.de` — 1-3 leading characters (never the whole local
 * part) then a *fixed* run of asterisks, so the visible text can't be counted
 * to recover how long the hidden part actually is. Used everywhere an address
 * would otherwise land in a log line, an admin's screen, or in front of
 * whoever is holding a reset link — except the intranet account's own
 * address, which is already visible in the staff directory and doesn't need
 * hiding from an admin. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = Math.min(3, Math.max(1, local.length - 1));
  return `${local.slice(0, visible)}***@${domain}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ------------------------------------------------------------- audit + debug

interface AuditEntry {
  event: AuditEvent;
  scope: PasswordResetScope;
  requestId?: Id<"passwordResetRequests">;
  actor?: Doc<"users"> | null;
  actorIsAdmin?: boolean;
  reverified?: boolean;
  targetEmail?: string;
  targetUserId?: Id<"users">;
  targetLoginId?: Id<"performanceLogins">;
  detail?: string;
}

/**
 * Writes the durable audit row and the matching console line in one place, so
 * the two can never drift. The console line is the non-sensitive half —
 * masked addresses and ids only — for tailing a live flow in the Convex logs;
 * the table is the full record.
 */
async function audit(ctx: MutationCtx, entry: AuditEntry): Promise<void> {
  await ctx.db.insert("passwordResetAuditLog", {
    event: entry.event,
    scope: entry.scope,
    requestId: entry.requestId,
    actorUserId: entry.actor?._id,
    actorEmail: entry.actor?.email,
    actorIsAdmin: entry.actorIsAdmin,
    reverified: entry.reverified,
    targetEmail: entry.targetEmail,
    targetUserId: entry.targetUserId,
    targetLoginId: entry.targetLoginId,
    detail: entry.detail,
    at: Date.now(),
  });
  const parts = [
    `[passwordReset] ${entry.event}`,
    `scope=${entry.scope}`,
    entry.requestId ? `request=${entry.requestId}` : null,
    entry.actor ? `actor=${entry.actor._id}` : "actor=anonymous",
    entry.actorIsAdmin === undefined ? null : `admin=${entry.actorIsAdmin}`,
    entry.reverified === undefined ? null : `reverified=${entry.reverified}`,
    entry.targetEmail ? `target=${maskEmail(entry.targetEmail)}` : null,
    entry.detail ? `detail=${entry.detail}` : null,
  ].filter(Boolean);
  console.log(parts.join(" "));
}

/** Action-side entry point to the same trail — actions have no `ctx.db`. */
export const recordAudit = internalMutation({
  args: {
    event: v.string(),
    scope: passwordResetScopeValidator,
    requestId: v.optional(v.id("passwordResetRequests")),
    actorUserId: v.optional(v.id("users")),
    actorIsAdmin: v.optional(v.boolean()),
    reverified: v.optional(v.boolean()),
    targetEmail: v.optional(v.string()),
    targetUserId: v.optional(v.id("users")),
    targetLoginId: v.optional(v.id("performanceLogins")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const actor = args.actorUserId ? await ctx.db.get(args.actorUserId) : null;
    await audit(ctx, {
      event: args.event as AuditEvent,
      scope: args.scope,
      requestId: args.requestId,
      actor,
      actorIsAdmin: args.actorIsAdmin,
      reverified: args.reverified,
      targetEmail: args.targetEmail,
      targetUserId: args.targetUserId,
      targetLoginId: args.targetLoginId,
      detail: args.detail,
    });
    return { ok: true };
  },
});

// ------------------------------------------------------------ target lookup

interface ResolvedTarget {
  targetEmail: string;
  targetUserId?: Id<"users">;
  targetLoginId?: Id<"performanceLogins">;
  targetCompanyId?: Id<"companies">;
  /** Where a link for this target would be mailed, when it exists — the
   * *feature* account's own address (the vault user's email for `hr`, the
   * login's own email for `performance`). */
  sentToEmail?: string;
  /** The same person's intranet (Clerk) account address, when the feature
   * account is known to be linked to one and that address differs from
   * `sentToEmail` — an alternate, already-public delivery address an admin
   * can choose instead. Absent for `hr` (the feature account *is* the
   * intranet account there, so there's nothing to choose between) and for
   * any `performance` login with no `linkedUserId`. */
  intranetEmail?: string;
}

/** Which account, if any, `scope` + `email` names. A resolution with every id
 * absent is a normal outcome, not an error — a lock screen must never become
 * an account-existence oracle.
 *
 * `bypassFilters` skips the active/membership/company-suspended checks below
 * (but still requires a matching row to exist) — the escape hatch behind the
 * admin queue's "force issue", for an account real but currently filtered
 * out (deactivated, no longer an applicant-area member, tenant suspended)
 * rather than one that never existed at all. It never widens *which* company
 * a `performance` login is looked up in — every lookup below stays scoped to
 * `companySlug` (or the company-less super-admin case) even when bypassing,
 * since Performance email uniqueness is per-company: matching by email alone
 * across companies could resolve to, and force-issue a link for, a
 * completely different tenant's account. */
async function resolveTarget(
  ctx: QueryCtx | MutationCtx,
  scope: PasswordResetScope,
  email: string,
  companySlug: string | undefined,
  opts: { bypassFilters?: boolean } = {},
): Promise<ResolvedTarget> {
  const targetEmail = normalizeEmail(email);
  if (scope === "hr") {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", targetEmail))
      .unique();
    // A vault password only exists for someone who belongs to the area at
    // all — anyone else is "no such account" as far as this flow goes.
    if (
      !user ||
      !(opts.bypassFilters || (user.status === "active" && isApplicantAreaMember(user)))
    ) {
      return { targetEmail };
    }
    return { targetEmail, targetUserId: user._id, sentToEmail: user.email };
  }

  const company = await ctx.db
    .query("companies")
    .withIndex("by_slug", (q) => q.eq("slug", companySlug ?? "advantis"))
    .unique();
  let login: Doc<"performanceLogins"> | null = null;
  if (company && (opts.bypassFilters || company.status === "active")) {
    login = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", company._id).eq("email", targetEmail))
      .unique();
  }
  if (!login) {
    // Super-admin logins have no companyId to scope by (see
    // `performanceAuth.ts`'s `getSuperAdminLoginByEmail`) — this global
    // fallback stays restricted to those even when bypassing. Performance
    // email uniqueness is per-company, not global, so widening this to "any
    // login by that email" could resolve (and force-issue a link for) a
    // completely different tenant's account than the one the request was
    // actually about — bypassing must never cross a company boundary.
    const candidates = await ctx.db
      .query("performanceLogins")
      .withIndex("by_email", (q) => q.eq("email", targetEmail))
      .collect();
    login = candidates.find((c) => c.isSuperAdmin === true) ?? null;
  }
  if (!login || !(opts.bypassFilters || login.active)) return { targetEmail };
  const linkedUser = login.linkedUserId ? await ctx.db.get(login.linkedUserId) : null;
  return {
    targetEmail,
    targetLoginId: login._id,
    targetCompanyId: login.companyId,
    sentToEmail: login.email,
    intranetEmail: linkedUser && linkedUser.email !== login.email ? linkedUser.email : undefined,
  };
}

/** Tries the safe, filtered lookup first; only falls back to the
 * filter-bypassing one when that finds nothing. `forced` tells the caller
 * whether the eventual match only turned up via the bypass — i.e. whether
 * issuing off of it counts as a forced issue for the audit trail. */
async function resolveWithFallback(
  ctx: QueryCtx | MutationCtx,
  scope: PasswordResetScope,
  email: string,
  companySlug: string | undefined,
): Promise<{ resolved: ResolvedTarget; forced: boolean }> {
  const safe = await resolveTarget(ctx, scope, email, companySlug);
  if (safe.targetUserId ?? safe.targetLoginId) return { resolved: safe, forced: false };
  const forced = await resolveTarget(ctx, scope, email, companySlug, { bypassFilters: true });
  return { resolved: forced, forced: !!(forced.targetUserId ?? forced.targetLoginId) };
}

/** Active intranet admins — the reviewers for every scope, since the queue
 * lives in the intranet's own Organization area. */
async function adminIds(ctx: QueryCtx | MutationCtx): Promise<Id<"users">[]> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  return admins.filter((u) => u.status === "active").map((u) => u._id);
}

// ------------------------------------------------------------- filing a ping

/**
 * Filed straight from a lock screen after a failed password attempt. Never
 * changes a password, never mails anything to the person filing it — it only
 * queues the account for an admin to look at.
 *
 * `hr` is always about the caller's own account (that vault password is
 * per-user and the screen already knows who they are), so `email` is ignored
 * there. `performance` has no Clerk session to lean on — its login screen is
 * reachable from a tenant's own domain — so the email comes from the form,
 * and whether the filer owns that account becomes something the reviewing
 * admin has to judge (`selfService`).
 */
export const requestReset = mutation({
  args: {
    scope: passwordResetScopeValidator,
    email: v.optional(v.string()),
    companySlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { scope, email, companySlug },
  ): Promise<{ status: "sent" } | { status: "cooldown"; retryAt: number }> => {
    const caller = await getCurrentUser(ctx);

    let resolved: ResolvedTarget;
    if (scope === "hr") {
      const user = await requireUser(ctx);
      if (!isApplicantAreaMember(user)) {
        throw new ConvexError({
          code: "forbidden",
          message: "You do not have permission to do that",
        });
      }
      resolved = { targetEmail: user.email, targetUserId: user._id, sentToEmail: user.email };
    } else {
      if (!email || !normalizeEmail(email)) {
        throw new ConvexError({ code: "validation", message: "Email is required." });
      }
      resolved = await resolveTarget(ctx, scope, email, companySlug);
    }

    const now = Date.now();
    const selfService = caller?.email === resolved.targetEmail;
    const previous = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_scope_email", (q) =>
        q.eq("scope", scope).eq("targetEmail", resolved.targetEmail),
      )
      .order("desc")
      .first();
    if (previous && now - previous.createdAt < REQUEST_COOLDOWN_MS) {
      const retryAt = previous.createdAt + REQUEST_COOLDOWN_MS;
      await audit(ctx, {
        event: "request_cooldown_blocked",
        scope,
        requestId: previous._id,
        actor: caller,
        targetEmail: resolved.targetEmail,
        detail: `retryAt=${new Date(retryAt).toISOString()}`,
      });
      await trackEvent(ctx, {
        event: "password_reset_request_blocked",
        distinctId: caller?.clerkUserId,
        properties: { scope, reason: "cooldown", self_service: selfService },
      });
      return { status: "cooldown", retryAt };
    }

    const requestId = await ctx.db.insert("passwordResetRequests", {
      scope,
      targetEmail: resolved.targetEmail,
      targetUserId: resolved.targetUserId,
      targetLoginId: resolved.targetLoginId,
      targetCompanyId: resolved.targetCompanyId,
      requestedByUserId: caller?._id,
      requestedByEmail: caller?.email,
      selfService,
      status: "pending",
      createdAt: now,
    });

    const knownAccount = !!(resolved.targetUserId ?? resolved.targetLoginId);
    await audit(ctx, {
      event: knownAccount ? "request_filed" : "request_unknown_account",
      scope,
      requestId,
      actor: caller,
      targetEmail: resolved.targetEmail,
      targetUserId: resolved.targetUserId,
      targetLoginId: resolved.targetLoginId,
      detail: `self=${selfService}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_requested",
      distinctId: caller?.clerkUserId,
      properties: { scope, self_service: selfService, known_account: knownAccount },
    });

    // An unresolved email gets a row (so repeated probing stays visible) but
    // no admin ping — otherwise anyone could mail-bomb the admins with
    // made-up addresses.
    if (!knownAccount) return { status: "sent" };

    const admins = await adminIds(ctx);
    await notifyUsers(ctx, admins, {
      type: "password_reset_request",
      title: `Password reset requested (${SCOPE_LABEL[scope]})`,
      body: `${resolved.targetEmail} can't get into ${SCOPE_LABEL[scope]}.`,
      link: `/admin/password-resets?request=${requestId}`,
    });
    for (const adminId of admins) {
      const admin = await ctx.db.get(adminId);
      if (!admin) continue;
      await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
        kind: "password-reset-request",
        to: admin.email,
        data: {
          area: SCOPE_LABEL[scope],
          accountEmail: resolved.targetEmail,
          requestedByEmail: caller?.email ?? "",
          requestedAt: new Date(now).toISOString(),
          requestId,
          selfService,
        },
      });
    }
    await audit(ctx, {
      event: "admins_notified",
      scope,
      requestId,
      targetEmail: resolved.targetEmail,
      detail: `admins=${admins.length}`,
    });

    return { status: "sent" };
  },
});

/** Whether the caller could file an `hr` request right now, and when their
 * cooldown lifts if not — read by the vault lock screen once the user has
 * actually got the password wrong, so the "notify an admin" button isn't
 * offered and then rejected. */
export const myHrRequestState = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ pending: boolean; retryAt: number | null; contactEmail: string | null }> => {
    const user = await getCurrentUser(ctx);
    if (!user) return { pending: false, retryAt: null, contactEmail: null };
    const previous = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_scope_email", (q) => q.eq("scope", "hr").eq("targetEmail", user.email))
      .order("desc")
      .first();
    const retryAt =
      previous && Date.now() - previous.createdAt < REQUEST_COOLDOWN_MS
        ? previous.createdAt + REQUEST_COOLDOWN_MS
        : null;
    return {
      pending: previous?.status === "pending",
      retryAt,
      contactEmail: process.env.PASSWORD_RESET_CONTACT_EMAIL ?? null,
    };
  },
});

// ------------------------------------------------------------- admin review

interface AdminRequestRow {
  id: Id<"passwordResetRequests">;
  scope: PasswordResetScope;
  targetEmail: string;
  /** `targetEmail`, masked unless this is an intranet account's own address
   * (always true for `hr`; never true for `performance`, whose target email
   * is a feature account's own address) — that's the one email in this flow
   * that's already public within the org. */
  targetEmailDisplay: string;
  targetName: string | null;
  targetCompanyName: string | null;
  /** False when nothing matched the email — a probe, not a real request. */
  targetExists: boolean;
  /** True when `targetExists` is false but a filter-bypassing lookup still
   * finds a real (if deactivated/unlinked/filtered-out) account — the "force
   * issue" button shows only then, never for an email that matches nothing
   * at all. */
  canForceIssue: boolean;
  /** Present only when the account is known to have two distinct addresses
   * an issued link could go to. `feature` is masked; `intranet` is the
   * already-public intranet account address, shown in full. Issuing must
   * pick one explicitly rather than silently defaulting. */
  emailChoice: { feature: string; intranet: string } | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  selfService: boolean;
  status: "pending" | "issued" | "dismissed";
  createdAt: number;
  handledByName: string | null;
  handledAt: number | null;
  /** Expiry of the still-usable link issued for this request, if any. */
  activeLinkExpiresAt: number | null;
}

function userLabel(user: Doc<"users"> | null): string | null {
  if (!user) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

async function toAdminRow(
  ctx: QueryCtx,
  request: Doc<"passwordResetRequests">,
): Promise<AdminRequestRow> {
  const targetUser = request.targetUserId ? await ctx.db.get(request.targetUserId) : null;
  const targetLogin = request.targetLoginId ? await ctx.db.get(request.targetLoginId) : null;
  const company = request.targetCompanyId ? await ctx.db.get(request.targetCompanyId) : null;
  const requester = request.requestedByUserId ? await ctx.db.get(request.requestedByUserId) : null;
  const handler = request.handledByUserId ? await ctx.db.get(request.handledByUserId) : null;

  const tokens = request.targetUserId
    ? await ctx.db
        .query("passwordResetTokens")
        .withIndex("by_targetUser", (q) => q.eq("targetUserId", request.targetUserId))
        .collect()
    : request.targetLoginId
      ? await ctx.db
          .query("passwordResetTokens")
          .withIndex("by_targetLogin", (q) => q.eq("targetLoginId", request.targetLoginId))
          .collect()
      : [];
  const live = tokens.find(
    (t) => t.requestId === request._id && !t.usedAt && !t.revokedAt && t.expiresAt > Date.now(),
  );

  const targetExists = !!(request.targetUserId ?? request.targetLoginId);
  let canForceIssue = false;
  let emailChoice: { feature: string; intranet: string } | null = null;
  // Only worth resolving for a request still awaiting a decision — a
  // handled one's "could we force it" answer no longer matters.
  if (request.status === "pending") {
    const { resolved, forced } = await resolveWithFallback(
      ctx,
      request.scope,
      request.targetEmail,
      company?.slug,
    );
    canForceIssue = !targetExists && forced;
    if (resolved.sentToEmail && resolved.intranetEmail) {
      emailChoice = { feature: maskEmail(resolved.sentToEmail), intranet: resolved.intranetEmail };
    }
  }

  return {
    id: request._id,
    scope: request.scope,
    targetEmail: request.targetEmail,
    targetEmailDisplay:
      request.scope === "hr" ? request.targetEmail : maskEmail(request.targetEmail),
    targetName: userLabel(targetUser) ?? targetLogin?.name ?? null,
    targetCompanyName: company?.name ?? null,
    targetExists,
    canForceIssue,
    emailChoice,
    requestedByName: userLabel(requester),
    requestedByEmail: request.requestedByEmail ?? null,
    selfService: request.selfService,
    status: request.status,
    createdAt: request.createdAt,
    handledByName: userLabel(handler),
    handledAt: request.handledAt ?? null,
    activeLinkExpiresAt: live?.expiresAt ?? null,
  };
}

export const listRequests = query({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("handled"))) },
  handler: async (ctx, { status }): Promise<AdminRequestRow[]> => {
    await requireAdmin(ctx);
    const requests = await ctx.db.query("passwordResetRequests").order("desc").take(200);
    const filtered =
      status === "pending"
        ? requests.filter((r) => r.status === "pending")
        : status === "handled"
          ? requests.filter((r) => r.status !== "pending")
          : requests;
    return Promise.all(filtered.map((r) => toAdminRow(ctx, r)));
  },
});

/** The audit trail behind one request, newest first — shown inline in the
 * admin queue so "who asked, who approved, when" doesn't require a trip to
 * the Convex dashboard. */
export const requestHistory = query({
  args: { requestId: v.id("passwordResetRequests") },
  handler: async (ctx, { requestId }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("passwordResetAuditLog")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .order("desc")
      .take(50);
    const actors = await Promise.all(
      rows.map((r) => (r.actorUserId ? ctx.db.get(r.actorUserId) : null)),
    );
    return rows.map((r, i) => ({
      id: r._id,
      event: r.event,
      at: r.at,
      actorName: userLabel(actors[i]) ?? r.actorEmail ?? null,
      actorIsAdmin: r.actorIsAdmin ?? false,
      reverified: r.reverified ?? null,
      detail: r.detail ?? null,
    }));
  },
});

export const pendingCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const user = await getCurrentUser(ctx);
    if (!user || effectiveRole(user) !== "admin") return 0;
    const pending = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .take(100);
    // Probes (no matching account) never became an admin ping, so they don't
    // belong in the badge either.
    return pending.filter((r) => r.targetUserId ?? r.targetLoginId).length;
  },
});

// ------------------------------------------------------- admin step-up code

/** Mails a fresh 6-digit code to the calling admin's own address, gating the
 * two actions below. Cooldown-limited by `issueCode` itself. Not tied to any
 * one request/scope, so it logs to the console rather than
 * `passwordResetAuditLog` — the per-action `reverification_failed`/`*_issued`/
 * `request_dismissed` entries there already capture the outcome of the action
 * a code unlocked. */
export const requestVerificationCode = mutation({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const admin = await requireAdmin(ctx);
    const code = await issueCode(ctx, admin);
    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "admin-verification-code",
      to: admin.email,
      data: { code, expiresInMinutes: 10 },
    });
    console.log(`[adminVerification] code sent admin=${admin._id} to=${maskEmail(admin.email)}`);
    return { ok: true };
  },
});

/** Redeems a code mailed by `requestVerificationCode`. Success marks the
 * admin "recently verified" for `REVERIFICATION_MAX_AGE_MINUTES`, which
 * `isRecentlyVerified` reads from the same row. */
export const submitVerificationCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<{ ok: true }> => {
    const admin = await requireAdmin(ctx);
    const result = await verifyCode(ctx, admin._id, code);
    if (!result.ok) {
      console.log(`[adminVerification] code rejected admin=${admin._id} reason=${result.reason}`);
      const message =
        result.reason === "wrong_code"
          ? `Incorrect code. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`
          : result.reason === "expired"
            ? "This code has expired. Request a new one."
            : result.reason === "too_many_attempts"
              ? "Too many incorrect attempts. Request a new code."
              : "No code is waiting. Request one first.";
      throw new ConvexError({ code: result.reason, message });
    }
    console.log(`[adminVerification] code verified admin=${admin._id}`);
    return { ok: true };
  },
});

// ------------------------------------------------------------- admin review

/** Dismiss without issuing anything — the right answer for a probe, or for a
 * request an admin has resolved out-of-band. Step-up gated like issuing is:
 * silently burying "someone is trying to get into the CFO's account" is its
 * own kind of damage. */
export const dismissRequest = mutation({
  args: { requestId: v.id("passwordResetRequests") },
  handler: async (ctx, { requestId }): Promise<{ ok: true } | VerificationHint> => {
    const admin = await requireAdmin(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({ code: "not_found", message: "No pending request." });
    }

    if (!(await isRecentlyVerified(ctx, admin._id))) {
      await audit(ctx, {
        event: "reverification_failed",
        scope: request.scope,
        requestId,
        actor: admin,
        actorIsAdmin: true,
        reverified: false,
        targetEmail: request.targetEmail,
        detail: "action=dismiss",
      });
      await trackEvent(ctx, {
        event: "password_reset_reverification_required",
        distinctId: admin.clerkUserId,
        properties: { scope: request.scope, action: "dismiss" },
      });
      return needsVerificationHint();
    }

    await ctx.db.patch(requestId, {
      status: "dismissed",
      handledByUserId: admin._id,
      handledAt: Date.now(),
    });
    await audit(ctx, {
      event: "request_dismissed",
      scope: request.scope,
      requestId,
      actor: admin,
      actorIsAdmin: true,
      reverified: true,
      targetEmail: request.targetEmail,
      targetUserId: request.targetUserId,
      targetLoginId: request.targetLoginId,
      detail: `waitedMs=${Date.now() - request.createdAt}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_request_dismissed",
      distinctId: admin.clerkUserId,
      properties: { scope: request.scope, waited_ms: Date.now() - request.createdAt },
    });
    return { ok: true };
  },
});

// ------------------------------------------------------------ issuing a link

const sendToValidator = v.union(v.literal("feature"), v.literal("intranet"));
type SendTo = "feature" | "intranet";

/** Whether `sendTo` + `expectedEmail` still describe the address the admin
 * was actually shown. `expectedEmail` is the exact string the picker
 * displayed for that choice — masked for `feature`, in full for `intranet` —
 * so this only passes if the freshly re-resolved address is *still* the one
 * the admin approved. Re-resolving fresh (rather than trusting what the list
 * query returned) is deliberate elsewhere in this file, but a choice between
 * two addresses is different: between the picker and the step-up code
 * clearing, a `linkedUserId` could get re-pointed or an email edited, and an
 * enum alone (`"intranet"`) can't tell a stale choice from a fresh one — it
 * would just silently bind to whatever address resolves *now*. Requiring the
 * exact address closes that gap: a mismatch is treated as no choice made at
 * all, sending the admin back through the picker with the current
 * addresses. */
function sendToMatchesExpected(
  sendTo: SendTo | undefined,
  expectedEmail: string | undefined,
  featureEmail: string,
  intranetEmail: string,
): boolean {
  if (!sendTo || expectedEmail === undefined) return false;
  const actual = sendTo === "intranet" ? intranetEmail : maskEmail(featureEmail);
  return actual === expectedEmail;
}

/** Everything `issueResetLink` needs before it can hash a token, gathered in
 * one db-capable call since actions have no `ctx.db`. Re-resolves the target
 * from the email rather than trusting the ids frozen into the request row —
 * the account could have been renamed, deactivated or created in between.
 *
 * Falls back to the filter-bypassing lookup when the safe one finds nothing
 * (`forced`) — the same escape hatch `toAdminRow`'s `canForceIssue` previews
 * to the admin before they ever click anything. When the account has two
 * distinct addresses to choose from, `sentToEmail` stays null and
 * `needsEmailChoice` is true until `sendTo` + `expectedEmail` name the exact
 * address the admin picked — never silently defaulting to one, and never
 * binding to a choice that's gone stale (see `sendToMatchesExpected`). */
export const prepareIssue = internalQuery({
  args: {
    requestId: v.id("passwordResetRequests"),
    sendTo: v.optional(sendToValidator),
    expectedEmail: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { requestId, sendTo, expectedEmail },
  ): Promise<{
    admin: Doc<"users">;
    reverified: boolean;
    scope: PasswordResetScope;
    targetEmail: string;
    sentToEmail: string | null;
    needsEmailChoice: boolean;
    featureEmail: string | null;
    intranetEmail: string | null;
    forced: boolean;
    targetUserId?: Id<"users">;
    targetLoginId?: Id<"performanceLogins">;
    linkBase: string;
    createdAt: number;
  }> => {
    const admin = await requireAdmin(ctx);
    const reverified = await isRecentlyVerified(ctx, admin._id);
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({ code: "not_found", message: "No pending request." });
    }

    const company = request.targetCompanyId ? await ctx.db.get(request.targetCompanyId) : null;
    const { resolved, forced } = await resolveWithFallback(
      ctx,
      request.scope,
      request.targetEmail,
      company?.slug,
    );

    const featureEmail = resolved.sentToEmail ?? null;
    const intranetEmail = resolved.intranetEmail ?? null;
    const hasChoice = !!featureEmail && !!intranetEmail;
    const needsEmailChoice =
      hasChoice && !sendToMatchesExpected(sendTo, expectedEmail, featureEmail, intranetEmail);
    const sentToEmail = !featureEmail
      ? null
      : needsEmailChoice
        ? null
        : sendTo === "intranet" && intranetEmail
          ? intranetEmail
          : featureEmail;

    // Land the link on the domain the person actually signs in on: their own
    // company's for a Performance tenant, the intranet's for everyone else.
    const intranetUrl = process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de";
    const tenant = resolved.targetCompanyId ? await ctx.db.get(resolved.targetCompanyId) : null;
    const linkBase =
      tenant && tenant.status === "active" && tenant.slug !== "advantis"
        ? `https://${tenant.domain}`
        : intranetUrl;

    return {
      admin,
      reverified,
      scope: request.scope,
      targetEmail: request.targetEmail,
      sentToEmail,
      needsEmailChoice,
      featureEmail,
      intranetEmail,
      forced,
      targetUserId: resolved.targetUserId,
      targetLoginId: resolved.targetLoginId,
      linkBase,
      createdAt: request.createdAt,
    };
  },
});

export const storeIssuedToken = internalMutation({
  args: {
    requestId: v.id("passwordResetRequests"),
    scope: passwordResetScopeValidator,
    tokenHash: v.string(),
    targetUserId: v.optional(v.id("users")),
    targetLoginId: v.optional(v.id("performanceLogins")),
    targetEmail: v.string(),
    sentToEmail: v.string(),
    issuedByUserId: v.id("users"),
    expiresAt: v.number(),
    forced: v.boolean(),
    sendTo: sendToValidator,
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    await revokeTokensFor(ctx, args.targetUserId, args.targetLoginId);
    const now = Date.now();
    await ctx.db.insert("passwordResetTokens", {
      scope: args.scope,
      tokenHash: args.tokenHash,
      requestId: args.requestId,
      targetUserId: args.targetUserId,
      targetLoginId: args.targetLoginId,
      sentToEmail: args.sentToEmail,
      issuedByUserId: args.issuedByUserId,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
    const request = await ctx.db.get(args.requestId);
    await ctx.db.patch(args.requestId, {
      status: "issued",
      handledByUserId: args.issuedByUserId,
      handledAt: now,
    });
    if (args.targetUserId) {
      await notifyUsers(ctx, [args.targetUserId], {
        type: "password_reset_issued",
        title: `Reset link sent (${SCOPE_LABEL[args.scope]})`,
        body: "Check your inbox — the link is valid for one hour.",
      });
    }
    const admin = await ctx.db.get(args.issuedByUserId);
    await audit(ctx, {
      event: "link_issued",
      scope: args.scope,
      requestId: args.requestId,
      actor: admin,
      actorIsAdmin: true,
      reverified: true,
      targetEmail: args.targetEmail,
      targetUserId: args.targetUserId,
      targetLoginId: args.targetLoginId,
      detail: `sentTo=${maskEmail(args.sentToEmail)} sendTo=${args.sendTo} forced=${args.forced} ttlMin=${Math.round(
        (args.expiresAt - now) / 60000,
      )} waitedMs=${request ? now - request.createdAt : 0}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_link_issued",
      distinctId: admin?.clerkUserId,
      properties: {
        scope: args.scope,
        waited_ms: request ? now - request.createdAt : 0,
        self_service: request?.selfService ?? false,
        forced: args.forced,
        send_to: args.sendTo,
      },
    });
    return { ok: true };
  },
});

/**
 * Admin approves one request: mints a single-use link and mails it to the
 * account's own address — the feature account's, or, when `sendTo` says so
 * and the account is known to be linked to one, its owner's intranet
 * address — never to whoever filed the request. That's what keeps an
 * approved-but-impersonated request harmless — the worst an employee gets
 * from asking on their manager's behalf is a link landing in the manager's
 * inbox.
 *
 * When the safe, filtered lookup finds nothing, this transparently falls
 * back to the filter-bypassing one (`prepareIssue`'s `forced`) — the "force
 * issue" the admin queue offers once a request has nothing else it can do
 * with it. When the account has two distinct known addresses, a first call
 * without `sendTo`/`expectedEmail` comes back `needsEmailChoice` instead of
 * sending anything, so the UI can ask before spending the one-shot token.
 * `expectedEmail` must match the address `sendTo` resolves to *right now*
 * (`sendToMatchesExpected`) — if a `linkedUserId` got re-pointed or an email
 * changed between the picker and the step-up code clearing, the stale choice
 * is rejected rather than silently rebound to whatever's current, and
 * `needsEmailChoice` comes back again with the fresh addresses.
 *
 * The plaintext token is never stored and never returned to the admin, so an
 * admin can trigger a reset without being able to walk through one.
 */
export const issueResetLink = action({
  args: {
    requestId: v.id("passwordResetRequests"),
    sendTo: v.optional(sendToValidator),
    expectedEmail: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { requestId, sendTo, expectedEmail },
  ): Promise<
    | { ok: true; sentTo: string }
    | { needsEmailChoice: true; feature: string; intranet: string }
    | VerificationHint
  > => {
    const prepared = await ctx.runQuery(internal.passwordResets.prepareIssue, {
      requestId,
      sendTo,
      expectedEmail,
    });

    if (!prepared.reverified) {
      await ctx.runMutation(internal.passwordResets.recordAudit, {
        event: "reverification_failed",
        scope: prepared.scope,
        requestId,
        actorUserId: prepared.admin._id,
        actorIsAdmin: true,
        reverified: false,
        targetEmail: prepared.targetEmail,
        detail: "action=issue",
      });
      return needsVerificationHint();
    }
    if (prepared.needsEmailChoice) {
      // Both possible addresses, masked/public exactly as the admin UI would
      // otherwise show them — this is a defense-in-depth echo of what
      // `toAdminRow`'s `emailChoice` already told the client, for the rare
      // case the client acted on stale data.
      return {
        needsEmailChoice: true,
        feature: maskEmail(prepared.featureEmail!),
        intranet: prepared.intranetEmail!,
      };
    }
    if (!prepared.sentToEmail) {
      throw new ConvexError({
        code: "no_account",
        message: "No account matches that email — nothing to reset.",
      });
    }

    const resolvedSendTo: SendTo =
      sendTo === "intranet" && prepared.sentToEmail === prepared.intranetEmail
        ? "intranet"
        : "feature";
    const token = randomToken();
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    await ctx.runMutation(internal.passwordResets.storeIssuedToken, {
      requestId,
      scope: prepared.scope,
      tokenHash: await sha256hex(token),
      targetUserId: prepared.targetUserId,
      targetLoginId: prepared.targetLoginId,
      targetEmail: prepared.targetEmail,
      sentToEmail: prepared.sentToEmail,
      issuedByUserId: prepared.admin._id,
      expiresAt,
      forced: prepared.forced,
      sendTo: resolvedSendTo,
    });

    await ctx.runAction(internal.outbound.sendNotificationEmail, {
      kind: "password-reset-link",
      to: prepared.sentToEmail,
      data: {
        area: SCOPE_LABEL[prepared.scope],
        url: `${prepared.linkBase}/password?o=${prepared.scope}&token=${token}`,
        expiresAt,
      },
    });
    // Echoed back masked unless it's the intranet account's own (already
    // public) address — the same display rule the admin queue's list uses.
    return {
      ok: true,
      sentTo:
        resolvedSendTo === "intranet" ? prepared.sentToEmail : maskEmail(prepared.sentToEmail),
    };
  },
});

// -------------------------------------------------------- consuming the link

async function revokeTokensFor(
  ctx: MutationCtx,
  targetUserId: Id<"users"> | undefined,
  targetLoginId: Id<"performanceLogins"> | undefined,
): Promise<void> {
  const existing = targetUserId
    ? await ctx.db
        .query("passwordResetTokens")
        .withIndex("by_targetUser", (q) => q.eq("targetUserId", targetUserId))
        .collect()
    : targetLoginId
      ? await ctx.db
          .query("passwordResetTokens")
          .withIndex("by_targetLogin", (q) => q.eq("targetLoginId", targetLoginId))
          .collect()
      : [];
  const now = Date.now();
  await Promise.all(
    existing
      .filter((t) => !t.usedAt && !t.revokedAt)
      .map((t) => ctx.db.patch(t._id, { revokedAt: now })),
  );
}

type TokenCheck =
  | { valid: true; scope: PasswordResetScope; email: string; expiresAt: number }
  | { valid: false; reason: "invalid" | "expired" | "used" };

export const tokenByHash = internalQuery({
  args: { tokenHash: v.string(), scope: passwordResetScopeValidator },
  handler: async (ctx, { tokenHash, scope }): Promise<TokenCheck> => {
    const row = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    // A scope mismatch reports as plain "invalid" — the `o=` parameter is
    // client-supplied, and confirming which area a token belongs to would
    // hand out information the holder didn't already have.
    if (!row || row.scope !== scope || row.revokedAt) return { valid: false, reason: "invalid" };
    if (row.usedAt) return { valid: false, reason: "used" };
    if (row.expiresAt <= Date.now()) return { valid: false, reason: "expired" };
    return {
      valid: true,
      scope: row.scope,
      email: maskEmail(row.sentToEmail),
      expiresAt: row.expiresAt,
    };
  },
});

/** Read by `/password` on load so the form can say up front whether the link
 * is still good, instead of only failing on submit. Shows a masked address —
 * enough for the holder to recognise the account, useless to anyone else. */
export const checkToken = action({
  args: { token: v.string(), scope: passwordResetScopeValidator },
  handler: async (ctx, { token, scope }): Promise<TokenCheck> => {
    const result: TokenCheck = await ctx.runQuery(internal.passwordResets.tokenByHash, {
      tokenHash: await sha256hex(token),
      scope,
    });
    await ctx.runMutation(internal.passwordResets.recordAudit, {
      event: "token_checked",
      scope,
      detail: result.valid ? "valid" : `invalid:${result.reason}`,
    });
    return result;
  },
});

export const applyReset = internalMutation({
  args: {
    tokenHash: v.string(),
    scope: passwordResetScopeValidator,
    passwordHash: v.string(),
  },
  handler: async (ctx, { tokenHash, scope, passwordHash }): Promise<{ ok: true }> => {
    const row = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    // Re-checked here rather than trusting the action's earlier read: the
    // token could have been used or revoked in between.
    if (!row || row.scope !== scope || row.revokedAt || row.usedAt || row.expiresAt <= Date.now()) {
      await audit(ctx, {
        event: "reset_rejected",
        scope,
        detail: !row ? "unknown_token" : row.usedAt ? "already_used" : "expired_or_revoked",
      });
      throw new ConvexError({ code: "invalid_token", message: "This link is no longer valid." });
    }

    const now = Date.now();
    if (row.targetUserId) {
      const existing = await ctx.db
        .query("applicantVaultPasswords")
        .withIndex("by_user", (q) => q.eq("userId", row.targetUserId!))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { hash: passwordHash, updatedAt: now });
      } else {
        await ctx.db.insert("applicantVaultPasswords", {
          userId: row.targetUserId,
          hash: passwordHash,
          updatedAt: now,
        });
      }
      // Any unlock opened under the old password dies with it.
      const unlock = await ctx.db
        .query("applicantVaultUnlocks")
        .withIndex("by_user", (q) => q.eq("userId", row.targetUserId!))
        .unique();
      if (unlock) await ctx.db.delete(unlock._id);
      await ctx.db.insert("applicantAuditLog", {
        actorUserId: row.targetUserId,
        action: "vault_password_rotated",
        at: now,
      });
    } else if (row.targetLoginId) {
      await ctx.db.patch(row.targetLoginId, { passwordHash });
      // Sessions minted under the old password must not survive the reset.
      const sessions = await ctx.db
        .query("performanceSessions")
        .withIndex("by_login", (q) => q.eq("loginId", row.targetLoginId!))
        .collect();
      await Promise.all(sessions.map((s) => ctx.db.delete(s._id)));
    }

    await ctx.db.patch(row._id, { usedAt: now });
    await revokeTokensFor(ctx, row.targetUserId, row.targetLoginId);

    const target = row.targetUserId ? await ctx.db.get(row.targetUserId) : null;
    if (target) {
      await notifyUsers(ctx, [target._id], {
        type: "password_reset_completed",
        title: `Password changed (${SCOPE_LABEL[scope]})`,
        body: "If this wasn't you, tell an admin immediately.",
      });
    }
    await audit(ctx, {
      event: "reset_completed",
      scope,
      requestId: row.requestId,
      actor: target,
      targetEmail: row.sentToEmail,
      targetUserId: row.targetUserId,
      targetLoginId: row.targetLoginId,
      detail: `issuedBy=${row.issuedByUserId} linkAgeMs=${now - row.createdAt}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_completed",
      distinctId: target?.clerkUserId,
      properties: { scope, link_age_ms: now - row.createdAt },
    });
    return { ok: true };
  },
});

/** Consumes the magic link and sets the new password. The token is the only
 * credential involved — a Performance user resetting from their own company
 * domain has no Clerk session to authenticate with. */
export const completeReset = action({
  args: {
    token: v.string(),
    scope: passwordResetScopeValidator,
    password: v.string(),
  },
  handler: async (ctx, { token, scope, password }): Promise<{ ok: true }> => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ConvexError({
        code: "validation",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }
    await ctx.runMutation(internal.passwordResets.applyReset, {
      tokenHash: await sha256hex(token),
      scope,
      passwordHash: await hashPassword(password),
    });
    return { ok: true };
  },
});

// -------------------------------------------------------------- housekeeping

/** Drops spent/expired tokens, request rows old enough to have stopped being
 * useful evidence, and expired admin verification codes. The audit trail
 * outlives all three. Scheduled from `crons.ts`. */
export const purgeStale = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ tokens: number; requests: number }> => {
    const now = Date.now();
    // Admin verification codes are one small row per admin at most, so a full
    // scan is cheap — there's no index to range-query expiresAt by.
    const codes = await ctx.db.query("adminVerificationCodes").collect();
    await Promise.all(codes.filter((c) => c.expiresAt <= now).map((c) => ctx.db.delete(c._id)));

    const tokenCutoff = now - 7 * 24 * 60 * 60 * 1000;
    const tokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", tokenCutoff))
      .take(500);
    await Promise.all(tokens.map((t) => ctx.db.delete(t._id)));

    const requestCutoff = now - 180 * 24 * 60 * 60 * 1000;
    const requests = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", requestCutoff))
      .take(500);
    await Promise.all(requests.map((r) => ctx.db.delete(r._id)));

    console.log(
      `[passwordReset] purge tokens=${tokens.length} requests=${requests.length} codes=${codes.length}`,
    );
    return { tokens: tokens.length, requests: requests.length };
  },
});
