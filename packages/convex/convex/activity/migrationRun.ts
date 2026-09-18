"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../functions";
import type { FunctionReference } from "convex/server";
import { MIGRATION_TABLES, type MigrationTable } from "./lib/migration";

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
  FunctionReference<"mutation", "internal", { migrationId: any; rows: any[] }, { warnings: number }>
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
const EXPORT_PATH = "activity/migrationExport:exportTable";

type ExportBatch = { page: any[]; continueCursor: string; isDone: boolean };

/**
 * Read one batch from the OLD deployment via a plain HTTP POST to its
 * `/api/query` endpoint.
 *
 * We deliberately do NOT use `ConvexHttpClient` here: the old and new
 * deployments are independent Convex projects on different library versions,
 * and the client's `convex_encoded_json` decode path throws on the old
 * deployment's response even when the server reports success. The `json`
 * format is stable across versions and lossless for this data (every migrated
 * column is a string/number/boolean — no Int64 or Bytes), so a raw fetch is
 * both simpler and more robust. Errors are kept short so they render cleanly in
 * the admin UI. The request body carries the secret, so only failures (never
 * the request) are logged, and never the body.
 */
async function fetchExportBatch(
  oldUrl: string,
  secret: string,
  table: MigrationTable,
  cursor: string | null,
  numItems: number,
): Promise<ExportBatch> {
  const endpoint = `${oldUrl.replace(/\/$/, "")}/api/query`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: EXPORT_PATH,
        args: { secret, table, cursor, numItems },
        format: "json",
      }),
    });
  } catch (e) {
    throw new Error(
      `could not reach old deployment: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`old deployment HTTP ${resp.status}: ${bodyText.slice(0, 200)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`old deployment returned non-JSON (HTTP ${resp.status})`);
  }

  if (parsed.status === "error") {
    const reason = typeof parsed.errorMessage === "string" ? parsed.errorMessage : "";
    throw new Error(`old deployment rejected export${reason ? `: ${reason.slice(0, 200)}` : ""}`);
  }
  if (parsed.status !== "success" || !parsed.value) {
    throw new Error(`unexpected response from old deployment (status=${String(parsed.status)})`);
  }

  const value = parsed.value as Partial<ExportBatch>;
  return {
    page: Array.isArray(value.page) ? value.page : [],
    continueCursor: value.continueCursor ?? "",
    isDone: value.isDone ?? true,
  };
}

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
      const next = run?.steps.find((s) => s.status !== "completed");
      if (next) {
        await ctx.runMutation(internal.activity.migration.failStep, {
          stepId: next._id,
          error: "ACTIVITYTRACK_OLD_CONVEX_URL / ACTIVITYTRACK_SIGNAL_SECRET not configured",
        });
      }
      return;
    }

    let batches = 0;
    while (batches < MAX_BATCHES_PER_RUN) {
      const run = await ctx.runQuery(internal.activity.migration.getRun, {
        migrationId,
      });
      if (!run || run.migration.status !== "running") {
        console.log("[migration] stopping — status:", run?.migration.status ?? "not found");
        return;
      }

      const step = run.steps.find((s) => s.status !== "completed");
      if (!step) {
        console.log("[migration] all steps completed — finishing");
        await ctx.runMutation(internal.activity.migration.finishMigration, {
          migrationId,
          status: "completed",
        });
        return;
      }

      const table = step.table as MigrationTable;
      console.log(
        `[migration] batch ${batches + 1}/${MAX_BATCHES_PER_RUN} — table="${table}" cursor=${JSON.stringify(step.cursor ?? null)} processed=${step.processed}`,
      );

      await ctx.runMutation(internal.activity.migration.markStepRunning, {
        stepId: step._id,
      });

      try {
        const result = await fetchExportBatch(
          oldUrl,
          secret,
          table,
          step.cursor ?? null,
          BATCH_SIZE,
        );

        console.log(
          `[migration] fetched ${result.page.length} rows from old deployment — isDone=${result.isDone}`,
        );

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
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        console.error(`[migration] FAILED table="${table}": ${message}`);
        await ctx.runMutation(internal.activity.migration.failStep, {
          stepId: step._id,
          error: message,
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
