import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  userMutation,
  userQuery,
} from "../functions";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import {
  availableMethodsFor,
  checkSatisfied,
  needsStepUpHint,
  ORG_REVERIFY_LEVEL,
  REVERIFY_FRESHNESS_MS,
  type StepMethod,
  type StepUpHint,
} from "../lib/stepUp";
import { hashPassword, randomToken, sha256hex } from "../activity/lib/crypto";
import { trackEvent } from "../lib/analytics";
import { effectiveRole, getCurrentUser } from "../lib/auth";
import { notifyUsers } from "../lib/notify";
import {
  adminIds,
  type AdminRequestRow,
  audit,
  type AuditEvent,
  maskEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  type PasswordResetScope,
  REQUEST_COOLDOWN_MS,
  type ResolvedTarget,
  resolveTarget,
  resolveWithFallback,
  SCOPE_LABEL,
  toAdminRow,
  TOKEN_TTL_MS,
  userLabel,
} from "./lib/passwordResets";
import { passwordResetScopeValidator } from "../schema";
import { requireSessionCaller } from "../lib/caller";

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
      const member = await requireSessionCaller(ctx);
      member.require(member.isApplicantAreaMember);
      const user = member.user;
      resolved = { targetEmail: user.email, targetUserId: user._id, sentToEmail: user.email };
    } else {
      if (!email || !normalizeEmail(email)) {
        throw new ConvexError({ code: "validation", message: "Email is required." });
      }
      resolved = await resolveTarget(ctx, scope, email, companySlug);
    }

    const now = Date.now();
    const selfService = caller?.email === resolved.targetEmail;
    const knownAccount = !!(resolved.targetUserId ?? resolved.targetLoginId);
    // A mismatch an admin would almost certainly wave through anyway,
    // because the system already vouches for it: either the filer is signed
    // in as the intranet account this login is linked to, the typed email
    // itself only resolved *through* a link (an admin-established
    // `linkedUserId`, an explicit `passwordResetLinkedEmails` pair, or a
    // verified `userSecondaryEmails` row the account holder added).
    const autoApprovedVia:
      | "callerLinkedAccount"
      | "targetLinkedAccount"
      | "adminLinkedEmail"
      | "verifiedSecondaryEmail"
      | undefined =
      selfService || !knownAccount
        ? undefined
        : resolved.resolvedVia === "targetLink"
          ? "targetLinkedAccount"
          : resolved.resolvedVia === "adminLink"
            ? "adminLinkedEmail"
            : resolved.resolvedVia === "verifiedSecondaryEmail"
              ? "verifiedSecondaryEmail"
              : caller && resolved.intranetEmail && caller.email === resolved.intranetEmail
                ? "callerLinkedAccount"
                : undefined;

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
      autoApproved: !!autoApprovedVia,
      autoApprovedVia,
      status: "pending",
      createdAt: now,
    });

    await audit(ctx, {
      event: knownAccount ? "request_filed" : "request_unknown_account",
      scope,
      requestId,
      actor: caller,
      targetEmail: resolved.targetEmail,
      targetUserId: resolved.targetUserId,
      targetLoginId: resolved.targetLoginId,
      detail: `self=${selfService}${autoApprovedVia ? ` autoVia=${autoApprovedVia}` : ""}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_requested",
      distinctId: caller?.clerkUserId,
      properties: {
        scope,
        self_service: selfService,
        known_account: knownAccount,
        auto_approved_via: autoApprovedVia ?? null,
      },
    });

    // An unresolved email gets a row (so repeated probing stays visible) but
    // no admin ping — otherwise anyone could mail-bomb the admins with
    // made-up addresses.
    if (!knownAccount) return { status: "sent" };

    if (autoApprovedVia) {
      // Mints the token and mails it from an action — mutations can't (see
      // `autoIssueLinkedReset`) — so this only queues it; the request row
      // stays `pending` for the brief window until that action runs, same
      // as any other scheduled side effect in this file.
      await ctx.scheduler.runAfter(0, internal.security.passwordResets.autoIssueLinkedReset, {
        requestId,
        scope,
        companySlug,
      });
      const admins = await adminIds(ctx);
      // FYI only — there's nothing to approve, so no "please review" email,
      // just an in-app ping so an admin skimming notifications still sees
      // it land in near-real-time instead of only on their next visit to
      // the queue.
      await notifyUsers(ctx, admins, {
        type: "password_reset_request",
        title: `Password reset auto-approved (${SCOPE_LABEL[scope]})`,
        body: `${resolved.targetEmail} → linked account, reset sent automatically.`,
        link: `/admin/password-resets?request=${requestId}`,
      });
      return { status: "sent" };
    }

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
      await ctx.scheduler.runAfter(0, internal.notifications.email.sendNotificationEmail, {
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

export const listRequests = userQuery({
  role: "admin",
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("handled"))) },
  handler: async (ctx, { status }): Promise<AdminRequestRow[]> => {
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
export const requestHistory = userQuery({
  role: "admin",
  args: { requestId: v.id("passwordResetRequests") },
  handler: async (ctx, { requestId }) => {
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

// ------------------------------------------------------------ linked emails

interface LinkedEmailRow {
  id: Id<"passwordResetLinkedEmails">;
  scope: PasswordResetScope;
  companySlug: string | null;
  aliasEmail: string;
  canonicalEmail: string;
  note: string | null;
  addedByName: string | null;
  createdAt: number;
}

/** The admin-maintained fallback list — pairs `resolveTarget` treats as the
 * same person when no existing account link (`performanceLogins.linkedUserId`)
 * already explains a mismatch. See `passwordResetLinkedEmails` in
 * `schema.ts`. */
export const listLinkedEmails = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx): Promise<LinkedEmailRow[]> => {
    const rows = await ctx.db.query("passwordResetLinkedEmails").order("desc").collect();
    const addedBy = await Promise.all(rows.map((r) => ctx.db.get(r.addedByUserId)));
    return rows.map((r, i) => ({
      id: r._id,
      scope: r.scope,
      companySlug: r.companySlug ?? null,
      aliasEmail: r.aliasEmail,
      canonicalEmail: r.canonicalEmail,
      note: r.note ?? null,
      addedByName: userLabel(addedBy[i]),
      createdAt: r.createdAt,
    }));
  },
});

/** Registers a pair `resolveTarget` will treat as the same person from now
 * on — this pre-authorizes every future reset request between the two to
 * skip manual review, so it's step-up gated the same as issuing or
 * dismissing a request. */
export const addLinkedEmail = userMutation({
  role: "admin",
  args: {
    scope: passwordResetScopeValidator,
    companySlug: v.optional(v.string()),
    aliasEmail: v.string(),
    canonicalEmail: v.string(),
    note: v.optional(v.string()),
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true } | StepUpHint> => {
    const admin = ctx.caller.user;
    const aliasEmail = normalizeEmail(args.aliasEmail);
    const canonicalEmail = normalizeEmail(args.canonicalEmail);
    if (!aliasEmail || !canonicalEmail || aliasEmail === canonicalEmail) {
      throw new ConvexError({
        code: "validation",
        message: "Both addresses are required and must differ.",
      });
    }
    // Matches `resolveTarget`'s `aliasCompanySlug` default exactly — a
    // performance-scope link left blank still has to resolve for a request
    // that also left `companySlug` unset (both default to "advantis").
    const companySlug = args.scope === "performance" ? (args.companySlug ?? "advantis") : undefined;

    const satisfied = await checkSatisfied(ctx, {
      userId: admin._id,
      sessionId: args.sessionId,
      requiredLevel: ORG_REVERIFY_LEVEL,
      freshnessMs: REVERIFY_FRESHNESS_MS,
    });
    if (!satisfied) {
      return needsStepUpHint(
        ORG_REVERIFY_LEVEL,
        await availableMethodsFor(ctx, admin._id, ORG_REVERIFY_LEVEL, { includePasskey: true }),
      );
    }

    const existing = await ctx.db
      .query("passwordResetLinkedEmails")
      .withIndex("by_scope_company_alias", (q) =>
        q.eq("scope", args.scope).eq("companySlug", companySlug).eq("aliasEmail", aliasEmail),
      )
      .unique();
    if (existing) {
      console.warn(
        `[passwordReset] addLinkedEmail conflict scope=${args.scope} company=${companySlug ?? "n/a"} alias=${maskEmail(aliasEmail)}`,
      );
      throw new ConvexError({ code: "conflict", message: "That address is already linked." });
    }

    const id = await ctx.db.insert("passwordResetLinkedEmails", {
      scope: args.scope,
      companySlug,
      aliasEmail,
      canonicalEmail,
      addedByUserId: admin._id,
      createdAt: Date.now(),
      note: args.note,
    });
    console.log(
      `[passwordReset] linkedEmail added id=${id} scope=${args.scope} company=${companySlug ?? "n/a"} alias=${maskEmail(aliasEmail)} canonical=${maskEmail(canonicalEmail)} by=${admin._id}`,
    );
    return { ok: true };
  },
});

export const removeLinkedEmail = userMutation({
  role: "admin",
  args: { id: v.id("passwordResetLinkedEmails") },
  handler: async (ctx, { id }): Promise<{ ok: true }> => {
    const admin = ctx.caller.user;
    await ctx.db.delete(id);
    console.log(`[passwordReset] linkedEmail removed id=${id} by=${admin._id}`);
    return { ok: true };
  },
});

// ------------------------------------------------------------- admin review
//
// Reverification for the two actions below now goes through the shared
// step-up engine (`lib/stepUp.ts`) — `api.security.stepUp.requestEmailCode`/
// `submitEmailCode` with `context: "admin_reverify"`, driven from
// `<StepUpDialog>` on the frontend instead of a page-local dialog.

/** Dismiss without issuing anything — the right answer for a probe, or for a
 * request an admin has resolved out-of-band. Step-up gated like issuing is:
 * silently burying "someone is trying to get into the CFO's account" is its
 * own kind of damage. */
export const dismissRequest = userMutation({
  role: "admin",
  args: { requestId: v.id("passwordResetRequests"), sessionId: v.string() },
  handler: async (ctx, { requestId, sessionId }): Promise<{ ok: true } | StepUpHint> => {
    const admin = ctx.caller.user;
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({ code: "not_found", message: "No pending request." });
    }

    const satisfied = await checkSatisfied(ctx, {
      userId: admin._id,
      sessionId,
      requiredLevel: ORG_REVERIFY_LEVEL,
      freshnessMs: REVERIFY_FRESHNESS_MS,
    });
    if (!satisfied) {
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
      return needsStepUpHint(
        ORG_REVERIFY_LEVEL,
        await availableMethodsFor(ctx, admin._id, ORG_REVERIFY_LEVEL, { includePasskey: true }),
      );
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

/** Kills a still-live, unused link before it's opened — the intervention an
 * admin needs when an issued request (auto-approved or not) turns out to be
 * suspicious, without a trip to the Convex dashboard. Step-up gated like
 * `dismissRequest`/`issueResetLink`: denying someone a reset they're
 * entitled to is just as much a real action as granting one. */
export const revokeIssuedLink = userMutation({
  role: "admin",
  args: { requestId: v.id("passwordResetRequests"), sessionId: v.string() },
  handler: async (ctx, { requestId, sessionId }): Promise<{ ok: true } | StepUpHint> => {
    const admin = ctx.caller.user;
    const request = await ctx.db.get(requestId);
    if (!request || request.status !== "issued") {
      throw new ConvexError({ code: "not_found", message: "No issued link for this request." });
    }

    const satisfied = await checkSatisfied(ctx, {
      userId: admin._id,
      sessionId,
      requiredLevel: ORG_REVERIFY_LEVEL,
      freshnessMs: REVERIFY_FRESHNESS_MS,
    });
    if (!satisfied) {
      await audit(ctx, {
        event: "reverification_failed",
        scope: request.scope,
        requestId,
        actor: admin,
        actorIsAdmin: true,
        reverified: false,
        targetEmail: request.targetEmail,
        detail: "action=revoke",
      });
      await trackEvent(ctx, {
        event: "password_reset_reverification_required",
        distinctId: admin.clerkUserId,
        properties: { scope: request.scope, action: "revoke" },
      });
      return needsStepUpHint(
        ORG_REVERIFY_LEVEL,
        await availableMethodsFor(ctx, admin._id, ORG_REVERIFY_LEVEL, { includePasskey: true }),
      );
    }

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
      (t) => t.requestId === requestId && !t.usedAt && !t.revokedAt && t.expiresAt > Date.now(),
    );
    if (!live) {
      console.warn(
        `[passwordReset] revoke found nothing to revoke request=${requestId} tokens=${tokens.length}`,
      );
      throw new ConvexError({ code: "not_found", message: "No live link to revoke." });
    }
    await ctx.db.patch(live._id, { revokedAt: Date.now() });
    await audit(ctx, {
      event: "link_revoked",
      scope: request.scope,
      requestId,
      actor: admin,
      actorIsAdmin: true,
      reverified: true,
      targetEmail: request.targetEmail,
      targetUserId: request.targetUserId,
      targetLoginId: request.targetLoginId,
      detail: `autoApprovedVia=${request.autoApprovedVia ?? "none"}`,
    });
    await trackEvent(ctx, {
      event: "password_reset_link_revoked",
      distinctId: admin.clerkUserId,
      properties: { scope: request.scope, auto_approved: request.autoApproved ?? false },
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
    sessionId: v.string(),
    sendTo: v.optional(sendToValidator),
    expectedEmail: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { requestId, sessionId, sendTo, expectedEmail },
  ): Promise<{
    admin: Doc<"users">;
    reverified: boolean;
    /** What this admin could re-verify with — resolved here because the
     * calling action has no database of its own to ask. */
    availableMethods: StepMethod[];
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
    const admin = (await requireSessionCaller(ctx)).require("admin").user;
    const reverified = await checkSatisfied(ctx, {
      userId: admin._id,
      sessionId,
      requiredLevel: ORG_REVERIFY_LEVEL,
      freshnessMs: REVERIFY_FRESHNESS_MS,
    });
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
      availableMethods: reverified
        ? []
        : await availableMethodsFor(ctx, admin._id, ORG_REVERIFY_LEVEL, { includePasskey: true }),
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
    /** Absent when `autoIssueLinkedReset` minted this on its own — there's
     * no admin actor to record, and the request's `handledByUserId` stays
     * unset too (its `autoApproved`/`autoApprovedVia` fields already say
     * why it was issued). */
    issuedByUserId: v.optional(v.id("users")),
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
    const admin = args.issuedByUserId ? await ctx.db.get(args.issuedByUserId) : null;
    await audit(ctx, {
      event: admin ? "link_issued" : "link_auto_issued",
      scope: args.scope,
      requestId: args.requestId,
      actor: admin,
      actorIsAdmin: !!admin,
      reverified: !!admin,
      targetEmail: args.targetEmail,
      targetUserId: args.targetUserId,
      targetLoginId: args.targetLoginId,
      detail: `sentTo=${maskEmail(args.sentToEmail)} sendTo=${args.sendTo} forced=${args.forced} ttlMin=${Math.round(
        (args.expiresAt - now) / 60000,
      )} waitedMs=${request ? now - request.createdAt : 0}${
        request?.autoApprovedVia ? ` autoVia=${request.autoApprovedVia}` : ""
      }`,
    });
    await trackEvent(ctx, {
      event: admin ? "password_reset_link_issued" : "password_reset_link_auto_issued",
      distinctId: admin?.clerkUserId,
      properties: {
        scope: args.scope,
        waited_ms: request ? now - request.createdAt : 0,
        self_service: request?.selfService ?? false,
        forced: args.forced,
        send_to: args.sendTo,
        auto_approved_via: request?.autoApprovedVia ?? null,
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
    sessionId: v.string(),
    sendTo: v.optional(sendToValidator),
    expectedEmail: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { requestId, sessionId, sendTo, expectedEmail },
  ): Promise<
    | { ok: true; sentTo: string }
    | { needsEmailChoice: true; feature: string; intranet: string }
    | StepUpHint
  > => {
    const prepared = await ctx.runQuery(internal.security.passwordResets.prepareIssue, {
      requestId,
      sessionId,
      sendTo,
      expectedEmail,
    });

    if (!prepared.reverified) {
      await ctx.runMutation(internal.security.passwordResets.recordAudit, {
        event: "reverification_failed",
        scope: prepared.scope,
        requestId,
        actorUserId: prepared.admin._id,
        actorIsAdmin: true,
        reverified: false,
        targetEmail: prepared.targetEmail,
        detail: "action=issue",
      });
      return needsStepUpHint(ORG_REVERIFY_LEVEL, prepared.availableMethods);
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
    await ctx.runMutation(internal.security.passwordResets.storeIssuedToken, {
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

    await ctx.runAction(internal.notifications.email.sendNotificationEmail, {
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

// ------------------------------------------------------- auto-issuing a link

/** `prepareIssue`'s shape without the admin/step-up gate — there's no admin
 * acting here. Re-resolves the target and the auto-approval reason fresh
 * rather than trusting what `requestReset` computed moments earlier (the
 * link that justified it could have been edited or removed in the
 * scheduler gap between the mutation committing and this query running).
 * Comes back `eligible: false` rather than throwing when that reasoning no
 * longer holds — the request just stays `pending` for a human, the same
 * outcome as if no link had ever explained it. */
export const prepareAutoIssue = internalQuery({
  args: {
    requestId: v.id("passwordResetRequests"),
    companySlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { requestId, companySlug },
  ): Promise<
    | { eligible: false; reason: string; scope?: PasswordResetScope }
    | {
        eligible: true;
        scope: PasswordResetScope;
        targetEmail: string;
        sentToEmail: string;
        targetUserId?: Id<"users">;
        targetLoginId?: Id<"performanceLogins">;
        linkBase: string;
      }
  > => {
    const request = await ctx.db.get(requestId);
    if (!request) return { eligible: false, reason: "request_missing" };
    if (request.status !== "pending") {
      return { eligible: false, reason: `status=${request.status}`, scope: request.scope };
    }
    if (!request.autoApprovedVia) {
      return { eligible: false, reason: "no_autoApprovedVia_on_row", scope: request.scope };
    }

    const caller = request.requestedByUserId ? await ctx.db.get(request.requestedByUserId) : null;
    // The safe, filtered lookup only — auto-issuing must never fall back to
    // the "force issue" bypass, same boundary `requestReset` already draws.
    const resolved = await resolveTarget(ctx, request.scope, request.targetEmail, companySlug);
    if (!resolved.sentToEmail || !(resolved.targetUserId ?? resolved.targetLoginId)) {
      return { eligible: false, reason: "account_no_longer_resolves", scope: request.scope };
    }

    const selfService = caller?.email === resolved.targetEmail;
    const stillExplained =
      !selfService &&
      (resolved.resolvedVia === "targetLink" ||
        resolved.resolvedVia === "adminLink" ||
        resolved.resolvedVia === "verifiedSecondaryEmail" ||
        (!!caller && !!resolved.intranetEmail && caller.email === resolved.intranetEmail));
    if (!stillExplained) {
      return {
        eligible: false,
        reason: `link_no_longer_explains_it via=${request.autoApprovedVia} nowResolvedVia=${
          resolved.resolvedVia ?? "none"
        } selfService=${selfService}`,
        scope: request.scope,
      };
    }

    // Land the link on the domain the person actually signs in on, same
    // rule `prepareIssue` uses.
    const intranetUrl = process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de";
    const tenant = resolved.targetCompanyId ? await ctx.db.get(resolved.targetCompanyId) : null;
    const linkBase =
      tenant && tenant.status === "active" && tenant.slug !== "advantis"
        ? `https://${tenant.domain}`
        : intranetUrl;

    return {
      eligible: true,
      scope: request.scope,
      targetEmail: request.targetEmail,
      sentToEmail: resolved.sentToEmail,
      targetUserId: resolved.targetUserId,
      targetLoginId: resolved.targetLoginId,
      linkBase,
    };
  },
});

/** Mints and mails a reset link with no admin actor — what `requestReset`
 * schedules when a mismatch is already explained by an existing or
 * admin-registered link. Mirrors `issueResetLink`'s tail end exactly (mint,
 * store, mail — always to the account's own address, `sendTo: "feature"`,
 * since there's no admin here to ask which of two addresses to use), minus
 * the admin/step-up gate. */
export const autoIssueLinkedReset = internalAction({
  args: {
    requestId: v.id("passwordResetRequests"),
    scope: passwordResetScopeValidator,
    companySlug: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, companySlug }): Promise<{ ok: true } | { skipped: true }> => {
    console.log(`[passwordReset:autoIssue] start request=${requestId}`);

    const prepared = await ctx.runQuery(internal.security.passwordResets.prepareAutoIssue, {
      requestId,
      companySlug,
    });
    if (!prepared.eligible) {
      // Not a crash — the request just falls back to needing a human, same
      // as if no link had ever explained it. Logged (console + audit trail
      // when we at least know the scope) so "why didn't this auto-issue"
      // has an answer in the Convex dashboard instead of just silence.
      console.warn(
        `[passwordReset:autoIssue] skipped request=${requestId} reason=${prepared.reason}`,
      );
      if (prepared.scope) {
        await ctx.runMutation(internal.security.passwordResets.recordAudit, {
          event: "auto_issue_skipped",
          scope: prepared.scope,
          requestId,
          detail: prepared.reason,
        });
      }
      return { skipped: true };
    }

    try {
      const token = randomToken();
      const expiresAt = Date.now() + TOKEN_TTL_MS;
      console.log(
        `[passwordReset:autoIssue] minting request=${requestId} scope=${prepared.scope} sentTo=${maskEmail(
          prepared.sentToEmail,
        )}`,
      );
      await ctx.runMutation(internal.security.passwordResets.storeIssuedToken, {
        requestId,
        scope: prepared.scope,
        tokenHash: await sha256hex(token),
        targetUserId: prepared.targetUserId,
        targetLoginId: prepared.targetLoginId,
        targetEmail: prepared.targetEmail,
        sentToEmail: prepared.sentToEmail,
        expiresAt,
        forced: false,
        sendTo: "feature",
      });

      console.log(`[passwordReset:autoIssue] mailing request=${requestId}`);
      await ctx.runAction(internal.notifications.email.sendNotificationEmail, {
        kind: "password-reset-link",
        to: prepared.sentToEmail,
        data: {
          area: SCOPE_LABEL[prepared.scope],
          url: `${prepared.linkBase}/password?o=${prepared.scope}&token=${token}`,
          expiresAt,
        },
      });
      console.log(`[passwordReset:autoIssue] done request=${requestId}`);
    } catch (error) {
      // The token may or may not have been stored by the time this fires —
      // `storeIssuedToken` already revokes prior tokens and patches the
      // request to `issued` in one transaction, so a failure here is almost
      // always the mail step. Either way, this is the one place that knows
      // *which* request and step failed; Convex logs the thrown error too,
      // but without this it's just an anonymous action crash in the
      // dashboard with no link back to the request row.
      console.error(
        `[passwordReset:autoIssue] failed request=${requestId} scope=${prepared.scope}:`,
        error,
      );
      throw error;
    }
    return { ok: true };
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
    const result: TokenCheck = await ctx.runQuery(internal.security.passwordResets.tokenByHash, {
      tokenHash: await sha256hex(token),
      scope,
    });
    await ctx.runMutation(internal.security.passwordResets.recordAudit, {
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
    await ctx.runMutation(internal.security.passwordResets.applyReset, {
      tokenHash: await sha256hex(token),
      scope,
      passwordHash: await hashPassword(password),
    });
    return { ok: true };
  },
});

// -------------------------------------------------------------- housekeeping

/** Drops spent/expired tokens, request rows old enough to have stopped being
 * useful evidence, and expired step-up email codes. The audit trail
 * outlives all three. Scheduled from `crons.ts`. */
export const purgeStale = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ tokens: number; requests: number }> => {
    const now = Date.now();
    // One small row per (user, session) at most, so a full scan is cheap —
    // there's no index to range-query expiresAt by.
    const codes = await ctx.db.query("stepUpChallenges").collect();
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
