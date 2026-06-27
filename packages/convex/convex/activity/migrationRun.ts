"use node";

import { v } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { FunctionReference } from "convex/server";
import { MIGRATION_TABLES, type MigrationTable } from "./migration";

/**
 * The resumable migration worker. Reads the OLD ActivityTrack deployment
 * batch-by-batch and upserts into this one, advancing each step's cursor so a
 * crash/restart resumes from the last committed batch. Re-running after a
 * completed migration is a no-op (idempotent upserts).
 *
 * Bounded: processes up to MAX_BATCHES_PER_RUN batches per invocation, then
 * reschedules itself, so no single action runs unboundedly.
 */
const MAX_BATCHES_PER_RUN = 40;
const BATCH_SIZE = 200;

// Per-table upsert mutation reference.
const UPSERT: Record<
  MigrationTable,
  FunctionReference<
    "mutation",
    "internal",
    { migrationId: any; rows: any[] },
    { warnings: number }
  >
> = {
  people: internal.activity.migration.upsertPeople,
  devices: internal.activity.migration.upsertDevices,
  activitySamples: internal.activity.migration.upsertSamples,
  stateSamples: internal.activity.migration.upsertStateSamples,
  dailyStats: internal.activity.migration.upsertDailyStats,
  employeeStates: internal.activity.migration.upsertEmployeeStates,
  integrationHealth: internal.activity.migration.upsertIntegrationHealth,
  activitySettings: internal.activity.migration.upsertSettings,
};

// Read-only paginated export query on the OLD deployment.
const exportRef = makeFunctionReference<"query">(
  "activity/migrationExport:exportTable"
);

export const run = internalAction({
  args: { migrationId: v.id("activityMigrations") },
  handler: async (ctx, { migrationId }) => {
    const oldUrl = process.env.ACTIVITYTRACK_OLD_CONVEX_URL;
    const secret = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
    if (!oldUrl || !secret) {
      const run = await ctx.runQuery(internal.activity.migration.getRun, {
        migrationId,
      });
      const next = run?.steps.find(s => s.status !== "completed");
      if (next) {
        await ctx.runMutation(internal.activity.migration.failStep, {
          stepId: next._id,
          error:
            "ACTIVITYTRACK_OLD_CONVEX_URL / ACTIVITYTRACK_SIGNAL_SECRET not configured",
        });
      }
      return;
    }

    const client = new ConvexHttpClient(oldUrl);

    let batches = 0;
    while (batches < MAX_BATCHES_PER_RUN) {
      const run = await ctx.runQuery(internal.activity.migration.getRun, {
        migrationId,
      });
      if (!run || run.migration.status !== "running") return;

      const step = run.steps.find(s => s.status !== "completed");
      if (!step) {
        await ctx.runMutation(internal.activity.migration.finishMigration, {
          migrationId,
          status: "completed",
        });
        return;
      }

      const table = step.table as MigrationTable;
      await ctx.runMutation(internal.activity.migration.markStepRunning, {
        stepId: step._id,
      });

      try {
        const result = (await client.query(exportRef, {
          secret,
          table,
          cursor: step.cursor ?? null,
          numItems: BATCH_SIZE,
        })) as { page: any[]; continueCursor: string; isDone: boolean };

        const { warnings } = await ctx.runMutation(UPSERT[table], {
          migrationId,
          rows: result.page,
        });

        await ctx.runMutation(internal.activity.migration.advanceStep, {
          stepId: step._id,
          cursor: result.isDone ? null : result.continueCursor,
          processedDelta: result.page.length,
          warningsDelta: warnings,
          done: result.isDone,
        });
      } catch (err) {
        await ctx.runMutation(internal.activity.migration.failStep, {
          stepId: step._id,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      batches++;
    }

    // Budget exhausted but work remains — reschedule to continue.
    await ctx.scheduler.runAfter(0, internal.activity.migrationRun.run, {
      migrationId,
    });
  },
});

// Referenced for side-effect typing; keeps MIGRATION_TABLES import meaningful.
void MIGRATION_TABLES;
