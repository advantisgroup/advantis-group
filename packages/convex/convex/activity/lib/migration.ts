/**
 * One-time, resumable, status-tracked migration of ActivityTrack data from the
 * OLD Convex deployment into this (advantis) deployment.
 *
 * Mechanism: a scheduled action (`run`, see migrationRun.ts) reads the old
 * deployment batch-by-batch via a Convex HTTP client (pointed at
 * `ACTIVITYTRACK_OLD_CONVEX_URL`) calling the secret-guarded
 * `activity/migrationExport:exportTable` query, and upserts each batch here via
 * the idempotent internal mutations below. Every batch advances the step's
 * pagination cursor, so a failure or restart resumes exactly where it left off
 * and re-runs are a no-op (idempotent upserts keyed on natural keys).
 *
 * Tables migrate in reference order so links resolve:
 *   people → devices → activitySamples/stateSamples/dailyStats →
 *   employeeStates → integrationHealth/activitySettings.
 * Dropped tables (organizations, old users) are skipped.
 */
export const MIGRATION_TABLES = [
  "people",
  "devices",
  "activitySamples",
  "stateSamples",
  "dailyStats",
  "employeeStates",
  "integrationHealth",
  "activitySettings",
] as const;

export type MigrationTable = (typeof MIGRATION_TABLES)[number];
