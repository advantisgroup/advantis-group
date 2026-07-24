import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { BUILT_IN_ROLES } from "./performance/lib/permissions";

/**
 * Company provisioning: the "Add Company" flow that brings a new Performance
 * tenant online on **its own, fully independent domain** — e.g.
 * "salespirates.de" — with as little manual work as possible:
 *
 * - `createCompany` (the one thing the admin UI calls) adds the company's
 *   domain to the platform's single Vercel project via the Domains API.
 * - Because it's a domain Advantis doesn't own, Vercel can't auto-verify it
 *   the way it could a subdomain of an already-owned wildcard root — the
 *   domain's owner has to add one DNS record (returned as
 *   `dnsVerification`) on their own registrar. That's the one unavoidable
 *   manual step per company: nobody can be automated around writing into a
 *   DNS zone they don't control. Everything else — the company row, its
 *   built-in roles, the Vercel API call itself — is zero-touch.
 * - Every step is idempotent by construction (check-by-domain before
 *   insert, skip the Vercel call if already verified), so re-running
 *   "create company" after a partial failure — surfaced via
 *   `status: "failed"` + `provisioningError` — never double-creates rows or
 *   double-adds the domain. The admin UI's "Retry" button is just this same
 *   action again; "Check verification" re-checks Vercel without re-adding
 *   anything.
 */

// --------------------------------------------------------------- Vercel API

function vercelHeaders(apiToken: string) {
  return {
    authorization: `Bearer ${apiToken}`,
    "content-type": "application/json",
  };
}

function requireVercelConfig(): {
  apiToken: string;
  projectId: string;
  teamId?: string;
} {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!apiToken || !projectId) {
    throw new Error(
      "VERCEL_API_TOKEN / VERCEL_PROJECT_ID are not configured on this Convex deployment."
    );
  }
  return { apiToken, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

function vercelProjectDomainUrl(
  projectId: string,
  teamId: string | undefined,
  domainPath?: string
): URL {
  const url = new URL(
    `https://api.vercel.com/v10/projects/${projectId}/domains${domainPath ? `/${domainPath}` : ""}`
  );
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

interface DnsVerificationRecord {
  type: string;
  domain: string;
  value: string;
}

interface VercelDomainResult {
  verified: boolean;
  dnsVerification: DnsVerificationRecord[];
}

/** Adds `domain` (the company's own, independently-owned domain) to the
 * platform's single Vercel project via the Domains API. Lives here (a plain
 * Convex action using `fetch` + a deployment env var) rather than behind an
 * `apps/api` hop, mirroring how `activity/genesys.ts`/`activity/clockodo.ts`
 * already call their external APIs directly from Convex actions — this is
 * a plain bearer-token REST call with no OAuth flow or Node-only
 * dependency, the same shape as those.
 *
 * NOTE: the exact response shape here (fields checked below) is based on
 * Vercel's documented Domains API at the time this was written, not a
 * verified live call — this session's network access to Vercel's docs was
 * blocked, so double-check the response shape (and whether a separate
 * `GET /v6/domains/{domain}/config` "misconfigured" check is also needed
 * beyond the ownership `verified` flag here) against
 * https://vercel.com/docs/rest-api (Domains) before this first ships. */
async function addVercelDomain(domain: string): Promise<VercelDomainResult> {
  const { apiToken, projectId, teamId } = requireVercelConfig();

  const res = await fetch(vercelProjectDomainUrl(projectId, teamId), {
    method: "POST",
    headers: vercelHeaders(apiToken),
    body: JSON.stringify({ name: domain }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    verified?: boolean;
    verification?: DnsVerificationRecord[];
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    // Already attached to this project from an earlier, partially-failed
    // run — treat as success (re-check its current state) so a retry is
    // idempotent instead of erroring.
    if (res.status === 409 || json.error?.code === "domain_already_in_use") {
      return checkVercelDomain(domain);
    }
    throw new Error(
      `Vercel domain add failed (${res.status}): ${json.error?.message ?? "unknown error"}`
    );
  }
  return {
    verified: json.verified ?? false,
    dnsVerification: json.verification ?? [],
  };
}

/** Re-checks a domain already added to the project — the "Check
 * verification" button's server call, and the 409/retry fallback above. */
async function checkVercelDomain(domain: string): Promise<VercelDomainResult> {
  const { apiToken, projectId, teamId } = requireVercelConfig();
  const res = await fetch(
    vercelProjectDomainUrl(projectId, teamId, encodeURIComponent(domain)),
    { headers: vercelHeaders(apiToken) }
  );
  const json = (await res.json().catch(() => ({}))) as {
    verified?: boolean;
    verification?: DnsVerificationRecord[];
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Vercel domain check failed (${res.status}): ${json.error?.message ?? "unknown error"}`
    );
  }
  return {
    verified: json.verified ?? false,
    dnsVerification: json.verification ?? [],
  };
}

// ------------------------------------------------------------------- slug

/** Internal identifier only — never itself used for routing (that's
 * `domain`, exact-matched). Derived from the domain so the admin UI doesn't
 * need a separate field; disambiguated with a numeric suffix in the rare
 * case two different domains slugify the same way. */
function slugify(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// -------------------------------------------------------------- mutations

export const upsertProvisioningRow = internalMutation({
  args: {
    name: v.string(),
    domain: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { name, domain, adminBootstrapEmails }
  ): Promise<{ companyId: Id<"companies"> }> => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_domain", q => q.eq("domain", domain))
      .unique();

    if (existing) {
      if (existing.status === "failed") {
        // Retry path: reset to provisioning and let createCompany's action
        // try the Vercel call again. Built-in roles were already seeded on
        // the original insert below — never re-seeded here, so a retry
        // can't duplicate them.
        await ctx.db.patch(existing._id, {
          status: "provisioning",
          provisioningError: undefined,
          updatedAt: Date.now(),
        });
      }
      return { companyId: existing._id };
    }

    const baseSlug = slugify(domain);
    let slug = baseSlug;
    let suffix = 2;
    while (
      await ctx.db
        .query("companies")
        .withIndex("by_slug", q => q.eq("slug", slug))
        .unique()
    ) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name,
      slug,
      domain,
      status: "provisioning",
      adminBootstrapEmails: adminBootstrapEmails
        .map(e => e.trim().toLowerCase())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
    });

    for (const role of BUILT_IN_ROLES) {
      await ctx.db.insert("companyRoles", {
        companyId,
        name: role.name,
        permissions: role.permissions,
        isBuiltIn: true,
        createdAt: now,
      });
    }

    return { companyId };
  },
});

export const applyDomainResult = internalMutation({
  args: {
    companyId: v.id("companies"),
    verified: v.boolean(),
    dnsVerification: v.array(
      v.object({ type: v.string(), domain: v.string(), value: v.string() })
    ),
  },
  handler: async (ctx, { companyId, verified, dnsVerification }) => {
    await ctx.db.patch(companyId, {
      status: verified ? "active" : "pending_dns",
      vercelVerified: verified,
      dnsVerification: verified ? undefined : dnsVerification,
      provisioningError: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: { companyId: v.id("companies"), error: v.string() },
  handler: async (ctx, { companyId, error }) => {
    await ctx.db.patch(companyId, {
      status: "failed",
      provisioningError: error,
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------- queries

export const getByIdInternal = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<Doc<"companies"> | null> =>
    await ctx.db.get(companyId),
});

/** Action-side lookup (no `ctx.db`) for `performanceAuth.ts`'s `login`/
 * `setupAccount`, which resolve a company by its (internal) slug before
 * touching any Performance login. */
export const getBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<Doc<"companies"> | null> =>
    await ctx.db
      .query("companies")
      .withIndex("by_slug", q => q.eq("slug", slug))
      .unique(),
});

/** Looks up one of a company's roles by name — used to find the seeded
 * "Admin" role at self-service setup time. Each company has at most one
 * role per name by construction (`upsertProvisioningRow` only ever seeds
 * the three built-ins once, and the roles UI enforces uniqueness on
 * create). */
export const getRoleByName = internalQuery({
  args: { companyId: v.id("companies"), name: v.string() },
  handler: async (
    ctx,
    { companyId, name }
  ): Promise<Doc<"companyRoles"> | null> => {
    const roles = await ctx.db
      .query("companyRoles")
      .withIndex("by_company", q => q.eq("companyId", companyId))
      .collect();
    return roles.find(r => r.name === name) ?? null;
  },
});

export const getRoleByIdInternal = internalQuery({
  args: { roleId: v.id("companyRoles") },
  handler: async (ctx, { roleId }): Promise<Doc<"companyRoles"> | null> =>
    await ctx.db.get(roleId),
});

/** Public — read by Next.js middleware (`fetchQuery`) on every request whose
 * Host isn't the main intranet's own, so it only returns what the UI shell
 * needs (never the admin-bootstrap emails or Vercel bookkeeping). Returns
 * `null` only when no company was ever registered for this domain at all
 * (most likely a Vercel preview/other hostname, not a mistyped tenant
 * domain) — a row that exists but isn't `"active"` yet (still provisioning,
 * pending DNS, or failed) is still returned, with its status, so the
 * middleware can show "this company isn't live yet" instead of silently
 * falling through to the main Advantis intranet. */
export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (
    ctx,
    { domain }
  ): Promise<{
    companyId: Id<"companies">;
    name: string;
    slug: string;
    status: Doc<"companies">["status"];
  } | null> => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_domain", q => q.eq("domain", domain))
      .unique();
    if (!company) return null;
    return {
      companyId: company._id,
      name: company.name,
      slug: company.slug,
      status: company.status,
    };
  },
});

/** Platform-level admin list, for the "Add Company" page's status table.
 * `isSuperAdmin`-only — see `performanceAuth.requireSuperAdminLogin`. */
export const listCompanies = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await ctx.runQuery(internal.performanceAuth.assertSuperAdminSession, {
      token,
    });
    const companies = await ctx.db.query("companies").collect();
    return companies
      .map(c => ({
        id: c._id,
        name: c.name,
        domain: c.domain,
        status: c.status,
        dnsVerification: c.dnsVerification ?? null,
        provisioningError: c.provisioningError ?? null,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ----------------------------------------------------------------- action

/** The one action the "Add Company" admin UI calls. Safe to call again for
 * the same `domain` at any point — see the module doc comment above for
 * why. Returns `status: "pending_dns"` in the (expected, common) case where
 * the domain was added to Vercel but still needs its owner to add a DNS
 * record — that's a normal outcome, not a failure. */
export const createCompany = action({
  args: {
    token: v.string(),
    name: v.string(),
    domain: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { token, name, domain, adminBootstrapEmails }
  ): Promise<{
    companyId: Id<"companies">;
    status: "active" | "pending_dns" | "failed";
    dnsVerification: DnsVerificationRecord[];
    error?: string;
  }> => {
    await ctx.runQuery(internal.performanceAuth.assertSuperAdminSession, {
      token,
    });

    const normalizedDomain = domain.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      normalizedDomain
    )) {
      throw new ConvexError({
        code: "validation",
        message: "Enter a valid domain, e.g. salespirates.de.",
      });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "validation",
        message: "Name is required.",
      });
    }

    const { companyId } = await ctx.runMutation(
      internal.companies.upsertProvisioningRow,
      { name: trimmedName, domain: normalizedDomain, adminBootstrapEmails }
    );

    const company = await ctx.runQuery(internal.companies.getByIdInternal, {
      companyId,
    });
    if (!company) {
      throw new ConvexError({
        code: "not_found",
        message: "Company row vanished mid-provisioning.",
      });
    }

    if (company.vercelVerified) {
      // Already verified on an earlier run of this same action.
      return { companyId, status: "active", dnsVerification: [] };
    }

    try {
      const result = await addVercelDomain(normalizedDomain);
      await ctx.runMutation(internal.companies.applyDomainResult, {
        companyId,
        ...result,
      });
      return {
        companyId,
        status: result.verified ? "active" : "pending_dns",
        dnsVerification: result.dnsVerification,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.companies.markFailed, {
        companyId,
        error: message,
      });
      return { companyId, status: "failed", dnsVerification: [], error: message };
    }
  },
});

/** Re-checks a `"pending_dns"` company's domain against Vercel, without
 * re-adding it — the admin UI's "Check verification" button, for after the
 * domain's owner has (hopefully) added the DNS record `createCompany`
 * reported. */
export const checkDomainVerification = action({
  args: { token: v.string(), companyId: v.id("companies") },
  handler: async (
    ctx,
    { token, companyId }
  ): Promise<{ status: "active" | "pending_dns"; dnsVerification: DnsVerificationRecord[] }> => {
    await ctx.runQuery(internal.performanceAuth.assertSuperAdminSession, {
      token,
    });
    const company = await ctx.runQuery(internal.companies.getByIdInternal, {
      companyId,
    });
    if (!company) {
      throw new ConvexError({ code: "not_found", message: "Company not found." });
    }

    const result = await checkVercelDomain(company.domain);
    await ctx.runMutation(internal.companies.applyDomainResult, {
      companyId,
      ...result,
    });
    return {
      status: result.verified ? "active" : "pending_dns",
      dnsVerification: result.dnsVerification,
    };
  },
});
