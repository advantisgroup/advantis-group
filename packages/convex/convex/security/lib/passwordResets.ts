import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { isApplicantAreaMember } from "../../lib/auth";

/**
 * Helpers behind `passwordResets.ts`: the audit writer, account lookup for a
 * typed email, and the admin-queue row shape.
 */

export type PasswordResetScope = "hr" | "performance";
export type AuditEvent = Doc<"passwordResetAuditLog">["event"];

/** One ping per account per day. Deliberately keyed on the *account* rather
 * than the filer, so the limit can't be walked around by filing from a
 * second browser or identity. */
export const REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** How long an issued magic link stays usable. Short on purpose: the link is
 * a full password-change capability sitting in an inbox. */
export const TOKEN_TTL_MS = 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 8;

export const SCOPE_LABEL: Record<PasswordResetScope, string> = {
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
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = Math.min(3, Math.max(1, local.length - 1));
  return `${local.slice(0, visible)}***@${domain}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ------------------------------------------------------------- audit + debug

export interface AuditEntry {
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
export async function audit(ctx: MutationCtx, entry: AuditEntry): Promise<void> {
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

// ------------------------------------------------------------ target lookup

export interface ResolvedTarget {
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
  /** How the typed email led here, when it wasn't a direct match — absent
   * for a plain lookup. `targetLink`: the typed email matched the *linked*
   * intranet account instead of the login's own address. `adminLink`: an
   * admin-registered `passwordResetLinkedEmails` pair pointed at the
   * account that actually resolved. `verifiedSecondaryEmail`: the
   * typed email matched a verified `userSecondaryEmails` row instead of a
   * primary address. Read by `requestReset` to decide whether a mismatch
   * can skip manual review. */
  resolvedVia?: "targetLink" | "adminLink" | "verifiedSecondaryEmail";
}

/** The account that has verified `email` as a secondary address. Pending
 * rows don't count. `.first()` rather than `.unique()` so a broken
 * one-owner invariant can't crash a reset. */
export async function findVerifiedSecondaryEmailOwner(
  ctx: QueryCtx | MutationCtx,
  email: string,
): Promise<Doc<"users"> | null> {
  const row = await ctx.db
    .query("userSecondaryEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .filter((q) => q.neq(q.field("verifiedAt"), undefined))
    .first();
  return row ? await ctx.db.get(row.userId) : null;
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
export async function resolveTarget(
  ctx: QueryCtx | MutationCtx,
  scope: PasswordResetScope,
  email: string,
  companySlug: string | undefined,
  opts: { bypassFilters?: boolean } = {},
): Promise<ResolvedTarget> {
  const targetEmail = normalizeEmail(email);
  // `hr` has no company to scope by; `performance` defaults to "advantis"
  // the same way the company lookup below does — keeping these in lockstep
  // matters, since an alias registered against the defaulted slug must still
  // match a request that left `companySlug` unset.
  const aliasCompanySlug = scope === "hr" ? undefined : (companySlug ?? "advantis");
  // An admin-registered "these are the same person" pair takes the typed
  // email straight to whatever it's declared to mean, before any lookup
  // runs — the substitution only changes *which* email gets looked up, not
  // the active/membership/company filters below, so this applies the same
  // whether or not the caller is bypassing those. `targetEmail` in the
  // returned struct stays what was actually typed either way, matching the
  // existing "targetEmail = input, sentToEmail = where it actually goes"
  // pattern.
  const link = await ctx.db
    .query("passwordResetLinkedEmails")
    .withIndex("by_scope_company_alias", (q) =>
      q.eq("scope", scope).eq("companySlug", aliasCompanySlug).eq("aliasEmail", targetEmail),
    )
    .unique();
  const lookupEmail = link ? link.canonicalEmail : targetEmail;
  const resolvedVia = link ? ("adminLink" as const) : undefined;

  if (scope === "hr") {
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", lookupEmail))
      .unique();
    // The typed address didn't match anyone's primary email directly — try
    // it as a verified secondary email before giving up.
    let viaVerifiedSecondary = false;
    if (!user) {
      const owner = await findVerifiedSecondaryEmailOwner(ctx, lookupEmail);
      if (owner) {
        user = owner;
        viaVerifiedSecondary = true;
      }
    }
    // A vault password only exists for someone who belongs to the area at
    // all — anyone else is "no such account" as far as this flow goes.
    if (
      !user ||
      !(opts.bypassFilters || (user.status === "active" && isApplicantAreaMember(user)))
    ) {
      return { targetEmail };
    }
    return {
      targetEmail,
      targetUserId: user._id,
      sentToEmail: user.email,
      resolvedVia: viaVerifiedSecondary ? "verifiedSecondaryEmail" : resolvedVia,
    };
  }

  const company = await ctx.db
    .query("companies")
    .withIndex("by_slug", (q) => q.eq("slug", companySlug ?? "advantis"))
    .unique();
  let login: Doc<"performanceLogins"> | null = null;
  if (company && (opts.bypassFilters || company.status === "active")) {
    login = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", company._id).eq("email", lookupEmail))
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
      .withIndex("by_email", (q) => q.eq("email", lookupEmail))
      .collect();
    login = candidates.find((c) => c.isSuperAdmin === true) ?? null;
  }
  let viaTargetLink = false;
  let viaVerifiedSecondary = false;
  if (!login && company && (opts.bypassFilters || company.status === "active")) {
    // The typed (or admin-linked) email didn't match any login directly —
    // try it as the *intranet* side of a `linkedUserId` pair instead, same
    // shape as `performanceAuth.ts`'s `getLoginLinkedTo`. Someone typing
    // their intranet address into a Performance lock screen by mistake
    // shouldn't dead-end just because that's not the login's own email.
    let linkedIntranetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", lookupEmail))
      .unique();
    // Nor should typing a *verified secondary* address — same
    // idea, just proven by the account holder in `/settings/account`
    // instead of matching their primary intranet email exactly.
    let matchedViaSecondary = false;
    if (!linkedIntranetUser) {
      const owner = await findVerifiedSecondaryEmailOwner(ctx, lookupEmail);
      if (owner) {
        linkedIntranetUser = owner;
        matchedViaSecondary = true;
      }
    }
    if (linkedIntranetUser && linkedIntranetUser.status === "active") {
      const viaLink = await ctx.db
        .query("performanceLogins")
        .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", linkedIntranetUser._id))
        .first();
      // Never cross a company boundary, same invariant as every other
      // lookup here — a link to a different tenant's login doesn't count.
      if (viaLink && viaLink.companyId === company._id) {
        login = viaLink;
        viaTargetLink = !matchedViaSecondary;
        viaVerifiedSecondary = matchedViaSecondary;
      }
    }
  }
  if (!login || !(opts.bypassFilters || login.active)) return { targetEmail, resolvedVia };
  const linkedUser = login.linkedUserId ? await ctx.db.get(login.linkedUserId) : null;
  return {
    targetEmail,
    targetLoginId: login._id,
    targetCompanyId: login.companyId,
    sentToEmail: login.email,
    intranetEmail: linkedUser && linkedUser.email !== login.email ? linkedUser.email : undefined,
    resolvedVia: viaVerifiedSecondary
      ? "verifiedSecondaryEmail"
      : viaTargetLink
        ? "targetLink"
        : resolvedVia,
  };
}

/** Tries the safe, filtered lookup first; only falls back to the
 * filter-bypassing one when that finds nothing. `forced` tells the caller
 * whether the eventual match only turned up via the bypass — i.e. whether
 * issuing off of it counts as a forced issue for the audit trail. */
export async function resolveWithFallback(
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
export async function adminIds(ctx: QueryCtx | MutationCtx): Promise<Id<"users">[]> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  return admins.filter((u) => u.status === "active").map((u) => u._id);
}

export interface AdminRequestRow {
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
  /** True when this request skipped human review because an existing link
   * (or an admin-registered pair) already explained the mismatch. */
  autoApproved: boolean;
  autoApprovedVia:
    | "callerLinkedAccount"
    | "targetLinkedAccount"
    | "adminLinkedEmail"
    | "verifiedSecondaryEmail"
    | null;
  status: "pending" | "issued" | "dismissed";
  createdAt: number;
  handledByName: string | null;
  handledAt: number | null;
  /** Expiry of the still-usable link issued for this request, if any. */
  activeLinkExpiresAt: number | null;
  /** True when a link was issued for this request and an admin has since
   * revoked it before it was used. */
  linkRevoked: boolean;
}

export function userLabel(user: Doc<"users"> | null): string | null {
  if (!user) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export async function toAdminRow(
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
  const linkRevoked = tokens.some((t) => t.requestId === request._id && !t.usedAt && !!t.revokedAt);

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
    autoApproved: request.autoApproved ?? false,
    autoApprovedVia: request.autoApprovedVia ?? null,
    status: request.status,
    createdAt: request.createdAt,
    handledByName: userLabel(handler),
    handledAt: request.handledAt ?? null,
    activeLinkExpiresAt: live?.expiresAt ?? null,
    linkRevoked,
  };
}
