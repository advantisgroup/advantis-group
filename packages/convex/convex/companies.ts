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
 * tenant fully online with zero manual steps — no env var edits, no manual
 * Clerk/Vercel dashboard clicks, no code deploy. See the plan this was built
 * from for the full rationale; the short version:
 *
 * - `createCompany` (the one thing the admin UI calls) resolves to a
 *   subdomain of one Advantis-owned wildcard root domain
 *   (`PERFORMANCE_PLATFORM_ROOT_DOMAIN`), which Vercel's Domains API
 *   verifies synchronously since it's already covered by the wildcard's own
 *   verification — no DNS wait, no polling loop needed for this path.
 * - Every step is idempotent by construction (check-by-slug before insert,
 *   skip the Vercel call if already verified), so re-running "create
 *   company" after a partial failure — surfaced via `status: "failed"` +
 *   `provisioningError` — never double-creates rows or double-adds the
 *   domain. The admin UI's "Retry" button is just this same action again.
 */

// --------------------------------------------------------------- Vercel API

/** Adds `subdomain` to the platform's single Vercel project via the Domains
 * API. Lives here (a plain Convex action using `fetch` + a deployment env
 * var) rather than behind an `apps/api` hop, mirroring how
 * `activity/genesys.ts`/`activity/clockodo.ts` already call their external
 * APIs directly from Convex actions — this is a plain bearer-token REST
 * call with no OAuth flow or Node-only dependency, the same shape as those.
 *
 * NOTE: the exact response shape here (fields checked below) is based on
 * Vercel's documented Domains API at the time this was written, not a
 * verified live call — this session's network access to Vercel's docs was
 * blocked, so double-check the response shape against
 * https://vercel.com/docs/rest-api (Domains) before this first ships. */
async function addVercelDomain(
  subdomain: string
): Promise<{ vercelDomainId: string; verified: boolean }> {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!apiToken || !projectId) {
    throw new Error(
      "VERCEL_API_TOKEN / VERCEL_PROJECT_ID are not configured on this Convex deployment."
    );
  }
  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(
    `https://api.vercel.com/v10/projects/${projectId}/domains`
  );
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: subdomain }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    name?: string;
    verified?: boolean;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    // Already attached to this project from an earlier, partially-failed
    // run — treat as success so a retry is idempotent instead of erroring.
    if (res.status === 409 || json.error?.code === "domain_already_in_use") {
      return { vercelDomainId: subdomain, verified: true };
    }
    throw new Error(
      `Vercel domain add failed (${res.status}): ${json.error?.message ?? "unknown error"}`
    );
  }
  return { vercelDomainId: subdomain, verified: json.verified ?? true };
}

// -------------------------------------------------------------- mutations

export const upsertProvisioningRow = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    subdomain: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { name, slug, subdomain, adminBootstrapEmails }
  ): Promise<{ companyId: Id<"companies"> }> => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_slug", q => q.eq("slug", slug))
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

    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name,
      slug,
      subdomain,
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

export const markActive = internalMutation({
  args: {
    companyId: v.id("companies"),
    vercelDomainId: v.string(),
    vercelVerified: v.boolean(),
  },
  handler: async (ctx, { companyId, vercelDomainId, vercelVerified }) => {
    await ctx.db.patch(companyId, {
      status: "active",
      vercelDomainId,
      vercelVerified,
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
 * `setupAccount`, which resolve a company by its subdomain slug before
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

/** Public — read by Next.js middleware (`fetchQuery`) on every request to a
 * tenant subdomain, so it only returns what the UI shell needs (never the
 * admin-bootstrap emails or Vercel bookkeeping). Only resolves companies
 * that are actually `"active"` — a still-provisioning or failed row isn't
 * live yet. */
export const getBySubdomain = query({
  args: { subdomain: v.string() },
  handler: async (
    ctx,
    { subdomain }
  ): Promise<{ companyId: Id<"companies">; name: string; slug: string } | null> => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_subdomain", q => q.eq("subdomain", subdomain))
      .unique();
    if (!company || company.status !== "active") return null;
    return { companyId: company._id, name: company.name, slug: company.slug };
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
        slug: c.slug,
        subdomain: c.subdomain,
        status: c.status,
        provisioningError: c.provisioningError ?? null,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ----------------------------------------------------------------- action

/** The one action the "Add Company" admin UI calls. Safe to call again for
 * the same `slug` at any point — see the module doc comment above for why. */
export const createCompany = action({
  args: {
    token: v.string(),
    name: v.string(),
    slug: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { token, name, slug, adminBootstrapEmails }
  ): Promise<{
    companyId: Id<"companies">;
    status: "active" | "failed";
    subdomain: string;
    error?: string;
  }> => {
    await ctx.runQuery(internal.performanceAuth.assertSuperAdminSession, {
      token,
    });

    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
      throw new ConvexError({
        code: "validation",
        message: "Slug must be lowercase letters, numbers, and hyphens only.",
      });
    }
    const rootDomain = process.env.PERFORMANCE_PLATFORM_ROOT_DOMAIN;
    if (!rootDomain) {
      throw new ConvexError({
        code: "not_configured",
        message: "PERFORMANCE_PLATFORM_ROOT_DOMAIN is not set.",
      });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "validation",
        message: "Name is required.",
      });
    }
    const subdomain = `${normalizedSlug}.${rootDomain}`;

    const { companyId } = await ctx.runMutation(
      internal.companies.upsertProvisioningRow,
      { name: trimmedName, slug: normalizedSlug, subdomain, adminBootstrapEmails }
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
      // Already attached to Vercel on an earlier run of this same action.
      return { companyId, status: "active", subdomain };
    }

    try {
      const domain = await addVercelDomain(subdomain);
      await ctx.runMutation(internal.companies.markActive, {
        companyId,
        vercelDomainId: domain.vercelDomainId,
        vercelVerified: domain.verified,
      });
      return { companyId, status: "active", subdomain };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.companies.markFailed, {
        companyId,
        error: message,
      });
      return { companyId, status: "failed", subdomain, error: message };
    }
  },
});
