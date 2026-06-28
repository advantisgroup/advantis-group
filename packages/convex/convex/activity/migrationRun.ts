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

    console.log("[migration] run invoked", {
      migrationId,
      hasOldUrl: !!oldUrl,
      hasSecret: !!secret,
      oldUrlPrefix: oldUrl ? oldUrl.slice(0, 40) : null,
    });

    if (!oldUrl || !secret) {
      console.error("[migration] missing env vars — failing next pending step");
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
      if (!run || run.migration.status !== "running") {
        console.log("[migration] stopping — status:", run?.migration.status ?? "not found");
        return;
      }

      const step = run.steps.find(s => s.status !== "completed");
      if (!step) {
        console.log("[migration] all steps completed — finishing");
        await ctx.runMutation(internal.activity.migration.finishMigration, {
          migrationId,
          status: "completed",
        });
        return;
      }

      const table = step.table as MigrationTable;
      console.log(`[migration] batch ${batches + 1}/${MAX_BATCHES_PER_RUN} — table="${table}" cursor=${JSON.stringify(step.cursor ?? null)} processed=${step.processed}`);

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

        console.log(`[migration] fetched ${result.page.length} rows from old deployment — isDone=${result.isDone}`);

        const { warnings } = await ctx.runMutation(UPSERT[table], {
          migrationId,
          rows: result.page,
        });

        if (warnings > 0) {
          console.warn(`[migration] ${warnings} warning(s) in table="${table}" (unlinked records)`);
        }

        await ctx.runMutation(internal.activity.migration.advanceStep, {
          stepId: step._id,
          cursor: result.isDone ? null : result.continueCursor,
          processedDelta: result.page.length,
          warningsDelta: warnings,
          done: result.isDone,
        });
      } catch (err) {
        // ConvexHttpClient errors sometimes have empty .message but carry
        // details in .data (ConvexError payload) or other own properties.
        // Capture ALL own props, including non-enumerable ones.
        let message: string;
        if (err instanceof Error) {
          const extra = Object.getOwnPropertyNames(err)
            .filter(k => !["stack", "message", "name"].includes(k))
            .map(k => `${k}=${JSON.stringify((err as any)[k])}`)
            .join(" ");
          message = [err.name, err.message, extra].filter(Boolean).join(" | ").trim() || "Unknown error (empty message)";
        } else {
          try {
            message = JSON.stringify(err);
          } catch {
            message = String(err);
          }
        }

        // The HTTP client strips the real failure reason; re-issue the same
        // query as a raw fetch to capture the actual wire response, where
        // Convex puts errorMessage/errorData. Best-effort — never masks the
        // original error, and we log only the RESPONSE (the request body
        // carries the secret, so it is never logged).
        let probe: { status?: number; body?: string; error?: string } = {};
        try {
          const resp = await fetch(`${oldUrl.replace(/\/$/, "")}/api/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: "activity/migrationExport:exportTable",
              args: {
                secret,
                table,
                cursor: step.cursor ?? null,
                numItems: BATCH_SIZE,
              },
              format: "json",
            }),
          });
          probe = {
            status: resp.status,
            body: (await resp.text()).slice(0, 2000),
          };
        } catch (probeErr) {
          probe = {
            error:
              probeErr instanceof Error ? probeErr.message : String(probeErr),
          };
        }

        console.error(`[migration] FAILED table="${table}"`, {
          message,
          name: err instanceof Error ? err.name : undefined,
          data: (err as any)?.data,
          status: (err as any)?.status,
          cause: (err as any)?.cause,
          rawProbe: probe,
          stack: err instanceof Error ? err.stack : undefined,
        });

        // Prefer the raw probe body — it carries the real reason.
        const finalError = probe.body
          ? `${message} :: rawResponse[${probe.status}]=${probe.body}`
          : probe.error
            ? `${message} :: probeFailed=${probe.error}`
            : message;

        await ctx.runMutation(internal.activity.migration.failStep, {
          stepId: step._id,
          error: finalError,
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
