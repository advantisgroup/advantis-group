import { type MutationCtx } from "../../_generated/server";

/**
 * Central operational event log. Every surface reports here (backend, tracker,
 * dashboard). IT sees the technical `message`/`context`; everyone else sees a
 * plain-language line derived from `code`. Deduplicated onto a single OPEN row
 * per (code, deviceId) so a recurring failure can't flood the table.
 */

export type Severity = "info" | "warning" | "error" | "critical";

export type Source = "backend" | "tracker" | "dashboard";

export interface LogArgs {
  severity: Severity;
  code: string;
  source: Source;
  message: string;
  deviceId?: string;
  hostname?: string;
  context?: string;
}

/** Shared writer usable from any mutation context. */
export async function logEvent(ctx: MutationCtx, args: LogArgs): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("activitySystemEvents")
    .withIndex("by_open", (q) =>
      q.eq("resolvedAt", undefined).eq("code", args.code).eq("deviceId", args.deviceId),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      lastAt: now,
      message: args.message,
      severity: args.severity,
      ...(args.hostname !== undefined ? { hostname: args.hostname } : {}),
      ...(args.context !== undefined ? { context: args.context } : {}),
    });
    return;
  }

  await ctx.db.insert("activitySystemEvents", {
    severity: args.severity,
    code: args.code,
    source: args.source,
    message: args.message,
    deviceId: args.deviceId,
    hostname: args.hostname,
    context: args.context,
    count: 1,
    firstAt: now,
    lastAt: now,
  });
}
