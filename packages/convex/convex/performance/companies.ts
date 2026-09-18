import { action, internalMutation, internalQuery, mutation, query } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { slugify } from "../lib/text";
import { BUILT_IN_ROLES } from "./lib/permissions";

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
      "VERCEL_API_TOKEN / VERCEL_PROJECT_ID are not configured on this Convex deployment.",
    );
  }
  return { apiToken, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

function vercelProjectDomainUrl(
  projectId: string,
  teamId: string | undefined,
  domainPath?: string,
): URL {
  const url = new URL(
    `https://api.vercel.com/v10/projects/${projectId}/domains${domainPath ? `/${domainPath}` : ""}`,
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

/** Vercel's actual Domains API response includes extra fields per
 * verification record (e.g. `reason: "pending_domain_verification"`) beyond
 * what was assumed when this was written without a live call to check
 * against — normalize to just the fields our schema/UI actually need instead
 * of passing the raw response straight through, so an extra field Vercel
 * adds (here or later) can't blow up `applyDomainResult`'s argument
 * validator again. */
function normalizeDnsVerification(raw: unknown): DnsVerificationRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      type: String(r.type ?? ""),
      domain: String(r.domain ?? ""),
      value: String(r.value ?? ""),
    }));
}

// ---------------------------------------------------------- DNS provider hint

interface DnsProviderInfo {
  name: string;
  docsUrl: string;
}

/** Matched against a domain's nameserver hostnames (substring match, case
 * insensitive) — not exhaustive, just the common registrars/DNS hosts worth
 * a direct link to their "add a TXT record" docs instead of making every
 * admin hunt for it themselves. Unmatched nameservers just mean no hint is
 * shown, never an error. */
const KNOWN_DNS_PROVIDERS: { match: string; name: string; docsUrl: string }[] = [
  {
    match: "ionos",
    name: "IONOS",
    docsUrl:
      "https://www.ionos.com/help/domains/configuring-name-servers-and-dns-records/creating-and-configuring-additional-dns-records-for-domains/",
  },
  {
    match: "domaincontrol",
    name: "GoDaddy",
    docsUrl: "https://www.godaddy.com/help/add-a-txt-record-19232",
  },
  {
    match: "cloudflare",
    name: "Cloudflare",
    docsUrl: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
  },
  {
    match: "registrar-servers",
    name: "Namecheap",
    docsUrl:
      "https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/",
  },
  {
    match: "domains.google",
    name: "Google Domains",
    docsUrl: "https://support.google.com/domains/answer/9211383",
  },
  {
    match: "awsdns",
    name: "AWS Route 53",
    docsUrl: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/rrsets-working-with.html",
  },
  {
    match: "squarespacedns",
    name: "Squarespace Domains",
    docsUrl: "https://support.squarespace.com/hc/en-us/articles/205812378",
  },
  {
    match: "hostinger",
    name: "Hostinger",
    docsUrl: "https://support.hostinger.com/en/articles/1583227-how-to-manage-dns-records",
  },
  {
    match: "ovh",
    name: "OVH",
    docsUrl:
      "https://docs.ovh.com/us/en/domains/web_hosting_general_information_about_dns_servers/",
  },
  {
    match: "vercel-dns",
    name: "Vercel DNS",
    docsUrl: "https://vercel.com/docs/domains/managing-dns-records",
  },
  {
    match: "netlify",
    name: "Netlify DNS",
    docsUrl: "https://docs.netlify.com/domains-https/netlify-dns/",
  },
  {
    match: "dnsimple",
    name: "DNSimple",
    docsUrl: "https://support.dnsimple.com/articles/txt-record/",
  },
  {
    match: "strato",
    name: "STRATO",
    docsUrl: "https://www.strato.de/faq/domains/wie-lege-ich-einen-txt-eintrag-an/",
  },
  {
    match: "united-domains",
    name: "united-domains",
    docsUrl: "https://www.united-domains.de/hilfe/dns-verwaltung",
  },
];

/** Looks up the `NS` records for exactly `name` (no climbing) via a public
 * DNS-over-HTTPS resolver — no extra credentials needed. Returns `[]` on any
 * failure, a non-DNS-configured name, or a name with no `NS` records at all
 * (the overwhelmingly common case: NS records only exist at a zone's own
 * apex, never at an arbitrary subdomain within it). */
async function queryNameservers(name: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=NS`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { Answer?: { data?: string }[] };
    return (json.Answer ?? []).map((a) => (a.data ?? "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Best-effort lookup of which DNS provider actually manages `domain`'s
 * records (via its nameservers, not the registrar — a domain can be
 * registered at one company but have its DNS hosted somewhere else
 * entirely, and the nameserver is what actually determines where the TXT
 * record needs to be added). Returns `null` on any failure or unknown
 * provider — this is a UI hint only, never allowed to block provisioning.
 *
 * A company's `domain` is very often a subdomain (e.g.
 * "performance.bluejutzu.dev"), but `NS` records only exist at a zone's
 * apex — querying the exact subdomain returns no answer at all even though
 * the zone that actually contains it (here "bluejutzu.dev") has a
 * perfectly good one. Confirmed directly against Vercel's own domain
 * config panel, which correctly names the provider for a subdomain company
 * while the old single-shot lookup here came back empty. So: walk up
 * label-by-label from the full domain and stop at the first name that
 * has any `NS` records — that's the actual zone apex, whether or not its
 * nameservers happen to match a provider we recognize. Never climbs past
 * the registrable domain into the public suffix itself (e.g. bare "dev"),
 * since the loop bottoms out at two labels. */
async function detectDnsProvider(domain: string): Promise<DnsProviderInfo | null> {
  const labels = domain.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const nameservers = await queryNameservers(labels.slice(i).join("."));
    if (nameservers.length === 0) continue;
    for (const ns of nameservers) {
      const hit = KNOWN_DNS_PROVIDERS.find((p) => ns.includes(p.match));
      if (hit) return { name: hit.name, docsUrl: hit.docsUrl };
    }
    return null;
  }
  return null;
}

/** Adds `domain` (the company's own, independently-owned domain) to the
 * platform's single Vercel project via the Domains API. Lives here (a plain
 * Convex action using `fetch` + a deployment env var) rather than behind an
 * `apps/api` hop, mirroring how `activity/genesys.ts`/`activity/clockodo.ts`
 * already call their external APIs directly from Convex actions — this is
 * a plain bearer-token REST call with no OAuth flow or Node-only
 * dependency, the same shape as those.
 *
 * Confirmed against a real response: each `verification` record also
 * carries a `reason` (e.g. `"pending_domain_verification"`) alongside
 * `type`/`domain`/`value` — see `normalizeDnsVerification`, which strips
 * that (and anything else Vercel might add) down to the fields our
 * schema/UI use. Still unconfirmed: whether a separate
 * `GET /v6/domains/{domain}/config` "misconfigured" check is also needed
 * beyond the ownership `verified` flag here. */
async function addVercelDomain(domain: string): Promise<VercelDomainResult> {
  const { apiToken, projectId, teamId } = requireVercelConfig();

  const res = await fetch(vercelProjectDomainUrl(projectId, teamId), {
    method: "POST",
    headers: vercelHeaders(apiToken),
    body: JSON.stringify({ name: domain }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    verified?: boolean;
    // Vercel's actual response includes more fields per record (e.g.
    // `reason`) than our own `DnsVerificationRecord` — kept loose here and
    // normalized down in `normalizeDnsVerification` instead of typed to our
    // own shape, so an extra field can't cause a mismatch.
    verification?: unknown[];
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
      `Vercel domain add failed (${res.status}): ${json.error?.message ?? "unknown error"}`,
    );
  }
  return {
    verified: json.verified ?? false,
    dnsVerification: normalizeDnsVerification(json.verification),
  };
}

/** Re-checks a domain already added to the project — the "Check
 * verification" button's server call, and the 409/retry fallback above. */
async function checkVercelDomain(domain: string): Promise<VercelDomainResult> {
  const { apiToken, projectId, teamId } = requireVercelConfig();
  const res = await fetch(vercelProjectDomainUrl(projectId, teamId, encodeURIComponent(domain)), {
    headers: vercelHeaders(apiToken),
  });
  const json = (await res.json().catch(() => ({}))) as {
    verified?: boolean;
    // Vercel's actual response includes more fields per record (e.g.
    // `reason`) than our own `DnsVerificationRecord` — kept loose here and
    // normalized down in `normalizeDnsVerification` instead of typed to our
    // own shape, so an extra field can't cause a mismatch.
    verification?: unknown[];
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Vercel domain check failed (${res.status}): ${json.error?.message ?? "unknown error"}`,
    );
  }
  return {
    verified: json.verified ?? false,
    dnsVerification: normalizeDnsVerification(json.verification),
  };
}

interface DnsRoutingRecord {
  type: string;
  value: string;
}

interface VercelDomainConfig {
  misconfigured: boolean;
  routing: DnsRoutingRecord[];
}

/** Ownership verification (`addVercelDomain`/`checkVercelDomain`'s
 * `verified` flag) proves the domain's owner controls it — it does NOT
 * mean traffic actually reaches Vercel. A domain can show `verified: true`
 * while still having no A/CNAME record pointed at Vercel at all (observed
 * directly: a company marked "active" whose URL then failed to resolve in
 * the browser). This is the second, separate check — Vercel's own domain
 * *configuration* status — that has to pass too before a company is
 * genuinely live. `misconfigured: true` means "not routing correctly yet";
 * `routing` is the recommended A/CNAME record to add, straight from
 * Vercel's own recommendation (CNAME preferred when offered, else the
 * first recommended A record). */
async function checkVercelDomainConfig(domain: string): Promise<VercelDomainConfig> {
  const { apiToken, teamId } = requireVercelConfig();
  const url = new URL(`https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, { headers: vercelHeaders(apiToken) });
  const json = (await res.json().catch(() => ({}))) as {
    misconfigured?: boolean;
    recommendedCNAME?: { rank: number; value: string }[];
    recommendedIPv4?: { rank: number; value: string[] }[];
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Vercel domain config check failed (${res.status}): ${json.error?.message ?? "unknown error"}`,
    );
  }
  const cname = json.recommendedCNAME?.find((r) => r.rank === 1)?.value;
  const ipv4 = json.recommendedIPv4?.find((r) => r.rank === 1)?.value?.[0];
  const routing: DnsRoutingRecord[] = cname
    ? [{ type: "CNAME", value: cname }]
    : ipv4
      ? [{ type: "A", value: ipv4 }]
      : [];
  return { misconfigured: json.misconfigured ?? true, routing };
}

interface ResolvedDomainState {
  status: "pending_dns" | "pending_routing" | "active";
  dnsVerification: DnsVerificationRecord[];
  dnsRouting: DnsRoutingRecord[];
  dnsProvider: DnsProviderInfo | null;
}

/** The full two-step state of a domain: ownership verification
 * (`ownership`, already fetched by the caller via `addVercelDomain` or
 * `checkVercelDomain`) plus — only once ownership passes — whether it's
 * actually routing traffic to Vercel (`checkVercelDomainConfig`). Only
 * `"active"` when both are true; `"pending_routing"` is a real, distinct
 * state from `"pending_dns"`; skipping it is what let a company show
 * "active" while its URL still failed to resolve at all. */
async function resolveDomainState(
  domain: string,
  ownership: VercelDomainResult,
): Promise<ResolvedDomainState> {
  // Detected once per call and kept in every branch, including "active" —
  // a domain can go straight to active on its very first check (DNS was
  // already fully configured before "Add Company" was ever clicked), so
  // gating this on the pending states left those domains with no provider
  // hint at all, not even transiently.
  const dnsProvider = await detectDnsProvider(domain);
  if (!ownership.verified) {
    return {
      status: "pending_dns",
      dnsVerification: ownership.dnsVerification,
      dnsRouting: [],
      dnsProvider,
    };
  }
  const config = await checkVercelDomainConfig(domain);
  if (config.misconfigured) {
    return {
      status: "pending_routing",
      dnsVerification: [],
      dnsRouting: config.routing,
      dnsProvider,
    };
  }
  return {
    status: "active",
    dnsVerification: [],
    dnsRouting: [],
    dnsProvider,
  };
}

/** Detaches `domain` from the platform's Vercel project — the "Remove
 * company" action's counterpart to `addVercelDomain`. A 404 means it's
 * already gone (a previous partial run, or removed by hand in the Vercel
 * dashboard) — treated as success, not an error, so removal stays
 * idempotent the same way provisioning is. */
async function removeVercelDomain(domain: string): Promise<void> {
  const { apiToken, projectId, teamId } = requireVercelConfig();
  const res = await fetch(vercelProjectDomainUrl(projectId, teamId, encodeURIComponent(domain)), {
    method: "DELETE",
    headers: vercelHeaders(apiToken),
  });
  if (!res.ok && res.status !== 404) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      `Vercel domain removal failed (${res.status}): ${json.error?.message ?? "unknown error"}`,
    );
  }
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
    { name, domain, adminBootstrapEmails },
  ): Promise<{ companyId: Id<"companies"> }> => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
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

    // Internal id only (routing matches `domain`); a numeric suffix covers
    // two domains that slugify the same way.
    const baseSlug = slugify(domain);
    let slug = baseSlug;
    let suffix = 2;
    while (
      await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
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
      adminBootstrapEmails: adminBootstrapEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
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
    status: v.union(v.literal("pending_dns"), v.literal("pending_routing"), v.literal("active")),
    dnsVerification: v.array(v.object({ type: v.string(), domain: v.string(), value: v.string() })),
    dnsRouting: v.array(v.object({ type: v.string(), value: v.string() })),
    dnsProvider: v.optional(v.object({ name: v.string(), docsUrl: v.string() })),
  },
  handler: async (ctx, { companyId, status, dnsVerification, dnsRouting, dnsProvider }) => {
    await ctx.db.patch(companyId, {
      status,
      vercelVerified: status !== "pending_dns",
      dnsVerification: status === "pending_dns" ? dnsVerification : undefined,
      dnsRouting: status === "pending_routing" ? dnsRouting : undefined,
      // Kept regardless of status now (see `resolveDomainState`) — still
      // just a UI hint, so a `null`/missing detection is a silent no-op,
      // never an error.
      dnsProvider,
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

/** Edits a company's name/admin-bootstrap-emails from the admin UI. Domain
 * isn't editable here — changing it means re-provisioning against Vercel
 * from scratch (a new domain add, new DNS records, new verification), not
 * a plain field edit; deleting and re-creating the company is the correct
 * path for that. */
export const updateCompany = mutation({
  args: {
    token: v.string(),
    companyId: v.id("companies"),
    name: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (ctx, { token, companyId, name, adminBootstrapEmails }) => {
    await ctx.runQuery(internal.performance.auth.assertSuperAdminSession, {
      token,
    });
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "validation",
        message: "Name is required.",
      });
    }
    const company = await ctx.db.get(companyId);
    if (!company) {
      throw new ConvexError({
        code: "not_found",
        message: "Company not found.",
      });
    }
    await ctx.db.patch(companyId, {
      name: trimmedName,
      adminBootstrapEmails,
      updatedAt: Date.now(),
    });
  },
});

// ------------------------------------------------------- delete a company

/** Every table with data scoped to one company, for `deleteCompany`'s
 * cascade. Explicit per-table batch-delete mutations (rather than one
 * generic helper) because each table's companyId-scoped index has a
 * different name — the same reason `performanceImport.ts`'s
 * `clearRawLeads`/`clearRawOpps`/`clearWonOpps` are separate functions
 * instead of one parameterized over an index name Convex can't type
 * generically across tables. `performanceTopics` has no `companyId` of its
 * own (see schema) so it's deleted via its employees' ids instead — see
 * `deleteTopicsForEmployeesBatch`. */
const DELETE_BATCH_SIZE = 200;

async function deleteBatch<T extends { _id: unknown }>(
  rows: T[],
  del: (id: T["_id"]) => Promise<void>,
): Promise<{ more: boolean }> {
  for (const row of rows) await del(row._id);
  return { more: rows.length === DELETE_BATCH_SIZE };
}

export const deleteLoginsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteSessionsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceSessions")
      .filter((q) => q.eq(q.field("companyId"), companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteEmployeesAndTopicsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const employees = await ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    for (const employee of employees) {
      // performanceTopics has no companyId of its own — only reachable via
      // its employeeId, so each employee's topics are cleared before the
      // employee row itself is deleted.
      const topics = await ctx.db
        .query("performanceTopics")
        .withIndex("by_employee_ym", (q) => q.eq("employeeId", employee._id))
        .collect();
      for (const topic of topics) await ctx.db.delete(topic._id);
      await ctx.db.delete(employee._id);
    }
    return { more: employees.length === DELETE_BATCH_SIZE };
  },
});

export const deleteBadgeCacheBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceBadgeCache")
      .withIndex("by_company_ym", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteReportsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceReports")
      .withIndex("by_company_reportDate", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteRawLeadsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceRawLeads")
      .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteRawOppsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceRawOpps")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteWonOppsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceWonOpps")
      .withIndex("by_company_closeDate", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteInteractionsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceInteractions")
      .withIndex("by_company_date", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteUploadLogBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteFlaggedRowsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("performanceFlaggedRows")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteRolesBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("companyRoles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(DELETE_BATCH_SIZE);
    return deleteBatch(rows, (id) => ctx.db.delete(id));
  },
});

export const deleteCompanyRow = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await ctx.db.delete(companyId);
  },
});

async function drainDeleteBatches(step: () => Promise<{ more: boolean }>) {
  let more = true;
  while (more) ({ more } = await step());
}

/** Permanently removes a company: detaches its domain from the Vercel
 * project, then cascades through every table with data scoped to it before
 * deleting the company row itself. The Advantis company (the grandfathered
 * production tenant, identified by its fixed `"advantis"` slug) can never
 * be deleted this way — doing so would take down the main intranet's own
 * Performance section, not just a client's. Irreversible, so the admin UI
 * gates this behind an explicit confirmation. */
export const deleteCompany = action({
  args: { token: v.string(), companyId: v.id("companies") },
  handler: async (ctx, { token, companyId }): Promise<void> => {
    await ctx.runQuery(internal.performance.auth.assertSuperAdminSession, {
      token,
    });
    const company = await ctx.runQuery(internal.performance.companies.getByIdInternal, {
      companyId,
    });
    if (!company) {
      throw new ConvexError({
        code: "not_found",
        message: "Company not found.",
      });
    }
    if (company.slug === "advantis") {
      throw new ConvexError({
        code: "forbidden",
        message: "The Advantis company can't be deleted.",
      });
    }

    if (company.vercelVerified || company.status !== "provisioning") {
      await removeVercelDomain(company.domain);
    }

    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteLoginsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteSessionsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteEmployeesAndTopicsBatch, {
        companyId,
      }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteBadgeCacheBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteReportsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteRawLeadsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteRawOppsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteWonOppsBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteInteractionsBatch, {
        companyId,
      }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteUploadLogBatch, { companyId }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteFlaggedRowsBatch, {
        companyId,
      }),
    );
    await drainDeleteBatches(() =>
      ctx.runMutation(internal.performance.companies.deleteRolesBatch, { companyId }),
    );
    await ctx.runMutation(internal.performance.companies.deleteCompanyRow, { companyId });
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
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

/** Looks up one of a company's roles by name — used to find the seeded
 * "Admin" role at self-service setup time. Each company has at most one
 * role per name by construction (`upsertProvisioningRow` only ever seeds
 * the three built-ins once, and the roles UI enforces uniqueness on
 * create). */
export const getRoleByName = internalQuery({
  args: { companyId: v.id("companies"), name: v.string() },
  handler: async (ctx, { companyId, name }): Promise<Doc<"companyRoles"> | null> => {
    const roles = await ctx.db
      .query("companyRoles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return roles.find((r) => r.name === name) ?? null;
  },
});

export const getRoleByIdInternal = internalQuery({
  args: { roleId: v.id("companyRoles") },
  handler: async (ctx, { roleId }): Promise<Doc<"companyRoles"> | null> => await ctx.db.get(roleId),
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
    { domain },
  ): Promise<{
    companyId: Id<"companies">;
    name: string;
    slug: string;
    status: Doc<"companies">["status"];
  } | null> => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
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
    await ctx.runQuery(internal.performance.auth.assertSuperAdminSession, {
      token,
    });
    const companies = await ctx.db.query("companies").collect();
    return companies
      .map((c) => ({
        id: c._id,
        name: c.name,
        slug: c.slug,
        domain: c.domain,
        status: c.status,
        adminBootstrapEmails: c.adminBootstrapEmails,
        dnsVerification: c.dnsVerification ?? null,
        dnsRouting: c.dnsRouting ?? null,
        dnsProvider: c.dnsProvider ?? null,
        provisioningError: c.provisioningError ?? null,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ----------------------------------------------------------------- action

/** The one action the "Add Company" admin UI calls. Safe to call again for
 * the same `domain` at any point — see the module doc comment above for
 * why. Returns `status: "pending_dns"`/`"pending_routing"` in the
 * (expected, common) cases where the domain still needs a DNS record from
 * its owner before it's actually live — that's a normal outcome, not a
 * failure. */
export const createCompany = action({
  args: {
    token: v.string(),
    name: v.string(),
    domain: v.string(),
    adminBootstrapEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { token, name, domain, adminBootstrapEmails },
  ): Promise<{
    companyId: Id<"companies">;
    status: "active" | "pending_dns" | "pending_routing" | "failed";
    dnsVerification: DnsVerificationRecord[];
    dnsRouting: DnsRoutingRecord[];
    dnsProvider: DnsProviderInfo | null;
    error?: string;
  }> => {
    await ctx.runQuery(internal.performance.auth.assertSuperAdminSession, {
      token,
    });

    const normalizedDomain = domain.trim().toLowerCase();
    if (
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizedDomain)
    ) {
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
      internal.performance.companies.upsertProvisioningRow,
      {
        name: trimmedName,
        domain: normalizedDomain,
        adminBootstrapEmails,
      },
    );

    const company = await ctx.runQuery(internal.performance.companies.getByIdInternal, {
      companyId,
    });
    if (!company) {
      throw new ConvexError({
        code: "not_found",
        message: "Company row vanished mid-provisioning.",
      });
    }

    try {
      // Ownership already verified on an earlier run of this same action —
      // skip re-adding the domain, but still re-resolve the full state
      // (routing can still be pending, or may have just been fixed).
      const ownership = company.vercelVerified
        ? await checkVercelDomain(normalizedDomain)
        : await addVercelDomain(normalizedDomain);
      const resolved = await resolveDomainState(normalizedDomain, ownership);
      await ctx.runMutation(internal.performance.companies.applyDomainResult, {
        companyId,
        status: resolved.status,
        dnsVerification: resolved.dnsVerification,
        dnsRouting: resolved.dnsRouting,
        dnsProvider: resolved.dnsProvider ?? undefined,
      });
      return { companyId, ...resolved };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.performance.companies.markFailed, {
        companyId,
        error: message,
      });
      return {
        companyId,
        status: "failed",
        dnsVerification: [],
        dnsRouting: [],
        dnsProvider: null,
        error: message,
      };
    }
  },
});

/** Re-checks a `"pending_dns"`/`"pending_routing"` company's domain against
 * Vercel, without re-adding it — the admin UI's "Check verification"
 * button, for after the domain's owner has (hopefully) added the DNS
 * record `createCompany` reported. */
export const checkDomainVerification = action({
  args: { token: v.string(), companyId: v.id("companies") },
  handler: async (
    ctx,
    { token, companyId },
  ): Promise<{
    status: "active" | "pending_dns" | "pending_routing";
    dnsVerification: DnsVerificationRecord[];
    dnsRouting: DnsRoutingRecord[];
    dnsProvider: DnsProviderInfo | null;
  }> => {
    await ctx.runQuery(internal.performance.auth.assertSuperAdminSession, {
      token,
    });
    const company = await ctx.runQuery(internal.performance.companies.getByIdInternal, {
      companyId,
    });
    if (!company) {
      throw new ConvexError({
        code: "not_found",
        message: "Company not found.",
      });
    }

    const ownership = await checkVercelDomain(company.domain);
    const resolved = await resolveDomainState(company.domain, ownership);
    await ctx.runMutation(internal.performance.companies.applyDomainResult, {
      companyId,
      status: resolved.status,
      dnsVerification: resolved.dnsVerification,
      dnsRouting: resolved.dnsRouting,
      dnsProvider: resolved.dnsProvider ?? undefined,
    });
    return resolved;
  },
});
