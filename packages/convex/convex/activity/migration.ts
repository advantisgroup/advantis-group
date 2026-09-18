import { internalMutation, internalQuery, mutation, query } from "../functions";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireManager, requireAdmin } from "../lib/auth";
import { appError } from "../lib/errors";
import { MIGRATION_TABLES, type MigrationTable } from "./lib/migration";
import { type MutationCtx } from "../_generated/server";

// --- Control surface (status UI) --------------------------------------------

/** The most recent migration run with its per-table steps. Manager+. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
    const migration = await ctx.db
      .query("activityMigrations")
      .withIndex("by_startedAt")
      .order("desc")
      .first();
    if (!migration) return null;
    const steps = await ctx.db
      .query("activityMigrationSteps")
      .withIndex("by_migration", (q) => q.eq("migrationId", migration._id))
      .collect();
    // Stable display order matching MIGRATION_TABLES.
    steps.sort(
      (a, b) =>
        MIGRATION_TABLES.indexOf(a.table as MigrationTable) -
        MIGRATION_TABLES.indexOf(b.table as MigrationTable),
    );
    return { migration, steps };
  },
});

/** Start a fresh migration run. Admin-only. */
export const start = mutation({
  args: { note: v.optional(v.string()) },
  handler: async (ctx, { note }) => {
    const actor = await requireAdmin(ctx);
    if (!process.env.ACTIVITYTRACK_OLD_CONVEX_URL) {
      throw appError(
        "migration.unconfigured",
        "ACTIVITYTRACK_OLD_CONVEX_URL is not set on the Convex deployment",
      );
    }
    const now = Date.now();
    const migrationId = await ctx.db.insert("activityMigrations", {
      startedAt: now,
      status: "running",
      startedByUserId: actor._id,
      note,
    });
    for (const table of MIGRATION_TABLES) {
      await ctx.db.insert("activityMigrationSteps", {
        migrationId,
        table,
        status: "pending",
        cursor: null,
        processed: 0,
        failed: 0,
        warnings: 0,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.activity.migrationRun.run, {
      migrationId,
    });
    return migrationId;
  },
});

/** Resume a paused/failed migration from where each step left off. Admin. */
export const resume = mutation({
  args: { migrationId: v.id("activityMigrations") },
  handler: async (ctx, { migrationId }) => {
    await requireAdmin(ctx);
    const migration = await ctx.db.get(migrationId);
    if (!migration) throw appError("notFound.migration", "Migration not found");
    await ctx.db.patch(migrationId, {
      status: "running",
      finishedAt: undefined,
    });
    // Reset any failed step back to pending (keeping its cursor) so it retries.
    const steps = await ctx.db
      .query("activityMigrationSteps")
      .withIndex("by_migration", (q) => q.eq("migrationId", migrationId))
      .collect();
    for (const step of steps) {
      if (step.status === "failed" || step.status === "paused") {
        await ctx.db.patch(step._id, {
          status: "pending",
          lastError: undefined,
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.scheduler.runAfter(0, internal.activity.migrationRun.run, {
      migrationId,
    });
  },
});

/** Retry a single failed step (keeps its resume cursor). Admin. */
export const retryStep = mutation({
  args: { stepId: v.id("activityMigrationSteps") },
  handler: async (ctx, { stepId }) => {
    await requireAdmin(ctx);
    const step = await ctx.db.get(stepId);
    if (!step) throw appError("notFound.step", "Step not found");
    await ctx.db.patch(stepId, {
      status: "pending",
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(step.migrationId, {
      status: "running",
      finishedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.activity.migrationRun.run, {
      migrationId: step.migrationId,
    });
  },
});

// --- Internal bookkeeping (called by the run action) ------------------------

export const getRun = internalQuery({
  args: { migrationId: v.id("activityMigrations") },
  handler: async (ctx, { migrationId }) => {
    const migration = await ctx.db.get(migrationId);
    if (!migration) return null;
    const steps = await ctx.db
      .query("activityMigrationSteps")
      .withIndex("by_migration", (q) => q.eq("migrationId", migrationId))
      .collect();
    steps.sort(
      (a, b) =>
        MIGRATION_TABLES.indexOf(a.table as MigrationTable) -
        MIGRATION_TABLES.indexOf(b.table as MigrationTable),
    );
    return { migration, steps };
  },
});

export const markStepRunning = internalMutation({
  args: { stepId: v.id("activityMigrationSteps") },
  handler: async (ctx, { stepId }) => {
    const step = await ctx.db.get(stepId);
    if (!step) return;
    await ctx.db.patch(stepId, {
      status: "running",
      startedAt: step.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const advanceStep = internalMutation({
  args: {
    stepId: v.id("activityMigrationSteps"),
    cursor: v.union(v.string(), v.null()),
    processedDelta: v.number(),
    warningsDelta: v.number(),
    done: v.boolean(),
  },
  handler: async (ctx, { stepId, cursor, processedDelta, warningsDelta, done }) => {
    const step = await ctx.db.get(stepId);
    if (!step) return;
    await ctx.db.patch(stepId, {
      cursor,
      processed: step.processed + processedDelta,
      warnings: (step.warnings ?? 0) + warningsDelta,
      status: done ? "completed" : "running",
      updatedAt: Date.now(),
    });
  },
});

export const failStep = internalMutation({
  args: { stepId: v.id("activityMigrationSteps"), error: v.string() },
  handler: async (ctx, { stepId, error }) => {
    const step = await ctx.db.get(stepId);
    if (!step) return;
    console.error(`[migration:failStep] table="${step.table}" error="${error}"`);
    await ctx.db.patch(stepId, {
      status: "failed",
      failed: step.failed + 1,
      lastError: error.slice(0, 2000),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(step.migrationId, { status: "failed" });
  },
});

export const finishMigration = internalMutation({
  args: {
    migrationId: v.id("activityMigrations"),
    status: v.union(v.literal("completed"), v.literal("paused")),
  },
  handler: async (ctx, { migrationId, status }) => {
    await ctx.db.patch(migrationId, { status, finishedAt: Date.now() });
  },
});

// --- Idempotent upserts (keyed on natural keys) -----------------------------

async function recordIdMap(
  ctx: MutationCtx,
  migrationId: Id<"activityMigrations">,
  sourceTable: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const existing = await ctx.db
    .query("activityMigrationIdMap")
    .withIndex("by_migration_source", (q) =>
      q.eq("migrationId", migrationId).eq("sourceTable", sourceTable).eq("sourceId", sourceId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { targetId });
  } else {
    await ctx.db.insert("activityMigrationIdMap", {
      migrationId,
      sourceTable,
      sourceId,
      targetId,
    });
  }
}

/** people → resolve userId via clockodoUserId then email; record id mapping. */
export const upsertPeople = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { migrationId, rows }) => {
    console.log(`[migration:upsertPeople] upserting ${rows.length} rows`);
    let warnings = 0;
    for (const row of rows) {
      const employeeId: string | undefined = row.employeeId ?? undefined;
      const email: string | undefined = row.email ?? undefined;
      const clockodoUserId: string | undefined = row.clockodoUserId ?? undefined;

      // Resolve the intranet user link.
      let userId: Id<"users"> | undefined;
      if (clockodoUserId !== undefined && clockodoUserId !== "") {
        const n = Number(clockodoUserId);
        if (Number.isFinite(n)) {
          const u = await ctx.db
            .query("users")
            .withIndex("by_clockodoUserId", (q) => q.eq("clockodoUserId", n))
            .unique();
          if (u) userId = u._id;
        }
      }
      if (!userId && email) {
        const u = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
          .unique();
        if (u) userId = u._id;
      }
      if (!userId) {
        console.warn(
          `[migration:upsertPeople] no userId match for row — name="${row.name}" email="${email}" clockodoUserId="${clockodoUserId}"`,
        );
        warnings++;
      }

      const fields = {
        name: row.name ?? "(unknown)",
        email,
        userId,
        active: row.active ?? true,
        employeeId: employeeId || undefined,
        genesysUserId: row.genesysUserId || undefined,
        clockodoUserId: clockodoUserId || undefined,
      };

      // Natural key: employeeId, else email.
      let existingId: Id<"people"> | null = null;
      if (employeeId) {
        const e = await ctx.db
          .query("people")
          .withIndex("by_employeeId", (q) => q.eq("employeeId", employeeId))
          .unique();
        existingId = e?._id ?? null;
      }
      if (!existingId && email) {
        const e = await ctx.db
          .query("people")
          .withIndex("by_email", (q) => q.eq("email", email))
          .unique();
        existingId = e?._id ?? null;
      }

      let targetId: Id<"people">;
      if (existingId) {
        await ctx.db.patch(existingId, fields);
        targetId = existingId;
      } else {
        targetId = await ctx.db.insert("people", fields);
      }
      if (row._id) {
        await recordIdMap(ctx, migrationId, "people", String(row._id), targetId);
      }
    }
    return { warnings };
  },
});

/** devices → remap personId via the id map (people imported first). */
export const upsertDevices = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { migrationId, rows }) => {
    let warnings = 0;
    for (const row of rows) {
      const deviceId: string = row.deviceId;
      if (!deviceId) continue;

      let personId: Id<"people"> | undefined;
      if (row.personId) {
        const map = await ctx.db
          .query("activityMigrationIdMap")
          .withIndex("by_migration_source", (q) =>
            q
              .eq("migrationId", migrationId)
              .eq("sourceTable", "people")
              .eq("sourceId", String(row.personId)),
          )
          .unique();
        if (map) personId = map.targetId as Id<"people">;
        else warnings++; // device linked to a person not (yet) migrated
      }

      const fields = {
        deviceId,
        hostname: row.hostname ?? "",
        lastWindowsUser: row.lastWindowsUser ?? "",
        userHistory: row.userHistory ?? undefined,
        status: row.status ?? "pending",
        personId,
        lastSeen: row.lastSeen ?? 0,
        agentVersion: row.agentVersion ?? undefined,
        claimNonceHash: row.claimNonceHash ?? undefined,
        // Tokens are deployment-specific; agents re-claim after cutover.
        tokenIssued: false,
        lastIngestAt: row.lastIngestAt ?? undefined,
      };

      const existing = await ctx.db
        .query("devices")
        .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("devices", fields);
      }
    }
    return { warnings };
  },
});

/** activitySamples → idempotent on (deviceId, capturedAt). */
export const upsertSamples = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const dup = await ctx.db
        .query("activitySamples")
        .withIndex("by_device_time", (q) =>
          q.eq("deviceId", row.deviceId).eq("capturedAt", row.capturedAt),
        )
        .first();
      if (dup) continue;
      await ctx.db.insert("activitySamples", {
        deviceId: row.deviceId,
        windowsUser: row.windowsUser ?? "",
        hostname: row.hostname ?? "",
        idleMs: row.idleMs ?? 0,
        active: row.active ?? false,
        capturedAt: row.capturedAt,
        receivedAt: row.receivedAt ?? row.capturedAt,
        tzOffsetMinutes: row.tzOffsetMinutes ?? 0,
        agentVersion: row.agentVersion ?? "",
        platform: row.platform ?? "",
      });
    }
    return { warnings: 0 };
  },
});

/** stateSamples → idempotent on (employeeId, at). */
export const upsertStateSamples = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const dup = await ctx.db
        .query("stateSamples")
        .withIndex("by_employee_time", (q) => q.eq("employeeId", row.employeeId).eq("at", row.at))
        .first();
      if (dup) continue;
      await ctx.db.insert("stateSamples", {
        employeeId: row.employeeId,
        state: row.state,
        at: row.at,
      });
    }
    return { warnings: 0 };
  },
});

/** dailyStats → idempotent on (deviceId, day). */
export const upsertDailyStats = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const fields = {
        deviceId: row.deviceId,
        day: row.day,
        activeSeconds: row.activeSeconds ?? 0,
        idleSeconds: row.idleSeconds ?? 0,
        firstSeen: row.firstSeen ?? 0,
        lastSeen: row.lastSeen ?? 0,
      };
      const existing = await ctx.db
        .query("dailyStats")
        .withIndex("by_device_day", (q) => q.eq("deviceId", row.deviceId).eq("day", row.day))
        .unique();
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("dailyStats", fields);
    }
    return { warnings: 0 };
  },
});

/** employeeStates → idempotent on employeeId. */
export const upsertEmployeeStates = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const { _id, _creationTime, orgId, ...rest } = row;
      void _id;
      void _creationTime;
      void orgId;
      const existing = await ctx.db
        .query("employeeStates")
        .withIndex("by_employeeId", (q) => q.eq("employeeId", row.employeeId))
        .unique();
      if (existing) await ctx.db.patch(existing._id, rest);
      else await ctx.db.insert("employeeStates", rest);
    }
    return { warnings: 0 };
  },
});

/** integrationHealth → idempotent on source. */
export const upsertIntegrationHealth = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const fields = {
        source: row.source,
        status: row.status,
        message: row.message ?? undefined,
        lastOkAt: row.lastOkAt ?? undefined,
        lastErrorAt: row.lastErrorAt ?? undefined,
        updatedAt: row.updatedAt ?? Date.now(),
      };
      const existing = await ctx.db
        .query("integrationHealth")
        .withIndex("by_source", (q) => q.eq("source", row.source))
        .unique();
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("integrationHealth", fields);
    }
    return { warnings: 0 };
  },
});

/** activitySettings → idempotent on key. */
export const upsertSettings = internalMutation({
  args: { migrationId: v.id("activityMigrations"), rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const fields = {
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt ?? Date.now(),
      };
      const existing = await ctx.db
        .query("activitySettings")
        .withIndex("by_key", (q) => q.eq("key", row.key))
        .unique();
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("activitySettings", fields);
    }
    return { warnings: 0 };
  },
});
