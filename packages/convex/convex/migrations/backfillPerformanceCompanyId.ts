/**
 * One-time backfill bringing the pre-multi-tenant Performance data (all of
 * it implicitly Advantis's) into the new `companies`/`companyRoles` model,
 * so this ships without a breaking migration for existing users:
 *
 * 1. Seeds (idempotently) an "Advantis" `companies` row, already `"active"`,
 *    with `adminBootstrapEmails` carried over from the old global
 *    `PERFORMANCE_ADMIN_EMAILS` env var, plus its three built-in
 *    `companyRoles`.
 * 2. Walks every existing `performanceLogins` row, mapping its old `role`
 *    string to the matching built-in `roleId` and stamping `companyId` —
 *    and, in the same pass, flags any login whose email is on
 *    `PERFORMANCE_SUPER_ADMIN_EMAILS` as `isSuperAdmin` (additively; its
 *    company/role fields are left in place and simply become unused, since
 *    `isSuperAdmin` bypasses every check regardless).
 * 3. Walks every other Performance table, stamping `companyId`.
 *
 * Every step is idempotent (only touches rows still missing `companyId`),
 * batched like `performanceImport.ts`'s `clearRawLeads`/etc. (same
 * `CLEAR_BATCH_SIZE` idiom) so it never risks Convex's per-execution
 * read/write limits, and safe to re-run to completion after a partial
 * failure. Run manually once from the Convex dashboard
 * (`internal.migrations.backfillPerformanceCompanyId.run`) after deploying
 * the multi-tenant schema — not wired to any client route.
 */
import { v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../functions";
import { getSeedAdminEmails, getSuperAdminEmails } from "../lib/performanceAuth";
import { BUILT_IN_ROLES } from "../performance/lib/permissions";

const BATCH_SIZE = 200;

const BACKFILL_TABLES = [
  "performanceEmployees",
  "performanceReports",
  "performanceRawLeads",
  "performanceRawOpps",
  "performanceWonOpps",
  "performanceInteractions",
  "performanceTopics",
  "performanceUploadLog",
  "performanceFlaggedRows",
] as const;

export const ensureAdvantisCompany = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ companyId: Id<"companies"> }> => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", "advantis"))
      .unique();
    if (existing) {
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, {
          status: "active",
          updatedAt: Date.now(),
        });
      }
      return { companyId: existing._id };
    }

    const now = Date.now();
    // `domain` is bookkeeping only here — Advantis is grandfathered to serve
    // at the existing production hostname directly (proxy.ts excludes that
    // host from the tenant lookup entirely), so this value is never
    // actually looked up by `companies.getByDomain`.
    const companyId = await ctx.db.insert("companies", {
      name: "Advantis",
      slug: "advantis",
      domain: "advantis.internal",
      status: "active",
      adminBootstrapEmails: getSeedAdminEmails(),
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

export const getAdvantisRoleIds = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    { companyId },
  ): Promise<{
    adminRoleId: Id<"companyRoles">;
    mitarbeiterRoleId: Id<"companyRoles">;
  }> => {
    const roles = await ctx.db
      .query("companyRoles")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const admin = roles.find((r) => r.name === "Admin");
    const mitarbeiter = roles.find((r) => r.name === "Mitarbeiter");
    if (!admin || !mitarbeiter) {
      throw new Error(
        "Advantis company is missing its built-in Admin/Mitarbeiter roles — run ensureAdvantisCompany first.",
      );
    }
    return { adminRoleId: admin._id, mitarbeiterRoleId: mitarbeiter._id };
  },
});

export const backfillLoginsBatch = internalMutation({
  args: {
    companyId: v.id("companies"),
    adminRoleId: v.id("companyRoles"),
    mitarbeiterRoleId: v.id("companyRoles"),
    superAdminEmails: v.array(v.string()),
  },
  handler: async (
    ctx,
    { companyId, adminRoleId, mitarbeiterRoleId, superAdminEmails },
  ): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceLogins")
      .filter((q) => q.eq(q.field("companyId"), undefined))
      .take(BATCH_SIZE);
    for (const login of batch) {
      const roleId = login.role === "admin" ? adminRoleId : mitarbeiterRoleId;
      await ctx.db.patch(login._id, {
        companyId,
        roleId,
        ...(superAdminEmails.includes(login.email.toLowerCase()) ? { isSuperAdmin: true } : {}),
      });
    }
    return { more: batch.length === BATCH_SIZE };
  },
});

export const backfillSessionsBatch = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query("performanceSessions")
      .filter((q) => q.eq(q.field("companyId"), undefined))
      .take(BATCH_SIZE);
    for (const session of batch) {
      await ctx.db.patch(session._id, { companyId });
    }
    return { more: batch.length === BATCH_SIZE };
  },
});

export const backfillTableBatch = internalMutation({
  args: {
    table: v.union(
      v.literal("performanceEmployees"),
      v.literal("performanceReports"),
      v.literal("performanceRawLeads"),
      v.literal("performanceRawOpps"),
      v.literal("performanceWonOpps"),
      v.literal("performanceInteractions"),
      v.literal("performanceTopics"),
      v.literal("performanceUploadLog"),
      v.literal("performanceFlaggedRows"),
    ),
    companyId: v.id("companies"),
  },
  handler: async (ctx, { table, companyId }): Promise<{ more: boolean }> => {
    const batch = await ctx.db
      .query(table)
      .filter((q) => q.eq(q.field("companyId"), undefined))
      .take(BATCH_SIZE);
    for (const row of batch) {
      await ctx.db.patch(row._id, { companyId });
    }
    return { more: batch.length === BATCH_SIZE };
  },
});

async function drainBatches(label: string, step: () => Promise<{ more: boolean }>) {
  let more = true;
  let rounds = 0;
  while (more) {
    ({ more } = await step());
    rounds++;
    if (rounds % 10 === 0) {
      console.log(`[backfillPerformanceCompanyId] ${label}: ${rounds} batches so far`);
    }
  }
  console.log(`[backfillPerformanceCompanyId] ${label}: done (${rounds} batches)`);
}

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const { companyId } = await ctx.runMutation(
      internal.migrations.backfillPerformanceCompanyId.ensureAdvantisCompany,
      {},
    );
    const { adminRoleId, mitarbeiterRoleId } = await ctx.runMutation(
      internal.migrations.backfillPerformanceCompanyId.getAdvantisRoleIds,
      { companyId },
    );
    const superAdminEmails = getSuperAdminEmails();

    await drainBatches("performanceLogins", () =>
      ctx.runMutation(internal.migrations.backfillPerformanceCompanyId.backfillLoginsBatch, {
        companyId,
        adminRoleId,
        mitarbeiterRoleId,
        superAdminEmails,
      }),
    );
    await drainBatches("performanceSessions", () =>
      ctx.runMutation(internal.migrations.backfillPerformanceCompanyId.backfillSessionsBatch, {
        companyId,
      }),
    );
    for (const table of BACKFILL_TABLES) {
      await drainBatches(table, () =>
        ctx.runMutation(internal.migrations.backfillPerformanceCompanyId.backfillTableBatch, {
          table,
          companyId,
        }),
      );
    }
    console.log("[backfillPerformanceCompanyId] complete");
  },
});
