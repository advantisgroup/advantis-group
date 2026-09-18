import { v } from "convex/values";

import { query } from "../functions";
import type { QueryCtx } from "../_generated/server";
import { requireCapability } from "../lib/auth";
import { readConfig } from "./settings";

/**
 * Read models for the dashboard. `teamOverview` exposes org-wide presence
 * data, so it requires `view_activity_admin` (Managers+, or a custom role
 * granted the capability) rather than just being signed in.
 *
 * The "online" window and the idle→inactive threshold come from the operational
 * config (Settings → Configuration), defaulting to 2 min / 5 min.
 */

function localDay(at: number, tzOffsetMinutes: number): string {
  return new Date(at - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

async function latestSample(ctx: QueryCtx, deviceId: string) {
  return await ctx.db
    .query("activitySamples")
    .withIndex("by_device_time", (q) => q.eq("deviceId", deviceId))
    .order("desc")
    .first();
}

/**
 * Team overview: every approved device, who it belongs to, whether the person
 * is active right now, and how much active time they've logged today.
 */
export const teamOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "view_activity_admin");
    const now = Date.now();
    const config = await readConfig(ctx);
    const onlineThresholdMs = config.offlineThresholdSeconds * 1000;
    const inactivityMs = config.inactivityThresholdSeconds * 1000;

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const personIds = [...new Set(devices.flatMap((d) => (d.personId ? [d.personId] : [])))];
    const peopleById = new Map(
      (await Promise.all(personIds.map((id) => ctx.db.get(id)))).flatMap((p) =>
        p ? [[p._id, p] as const] : [],
      ),
    );

    const employeeIds = [
      ...new Set([...peopleById.values()].flatMap((p) => (p.employeeId ? [p.employeeId] : []))),
    ];
    const stateByEmployee = new Map(
      (
        await Promise.all(
          employeeIds.map((id) =>
            ctx.db
              .query("employeeStates")
              .withIndex("by_employeeId", (q) => q.eq("employeeId", id))
              .unique(),
          ),
        )
      ).flatMap((s) => (s ? [[s.employeeId, s] as const] : [])),
    );

    return Promise.all(
      devices.map(async (device) => {
        const person = device.personId ? (peopleById.get(device.personId) ?? null) : null;
        // The ingest patch keeps a `lastSample` summary on the device row, so
        // this query normally never reads `activitySamples`. The fallback
        // covers devices that haven't ingested since the field was
        // introduced; it self-heals on their next heartbeat.
        const latest = device.lastSample ?? (await latestSample(ctx, device.deviceId));
        const tzOffset = latest?.tzOffsetMinutes ?? 0;
        const day = localDay(now, tzOffset);

        // The ingest patch also keeps a `todayStats` summary on the device
        // row (mirroring `lastSample`), so this normally never has to run a
        // separate `dailyStats` query per device. Falls back for devices
        // whose cached day has rolled over (rare: only when a device goes
        // quiet across local midnight) or predates the field.
        const stats =
          device.todayStats?.day === day
            ? device.todayStats
            : await ctx.db
                .query("dailyStats")
                .withIndex("by_device_day", (q) => q.eq("deviceId", device.deviceId).eq("day", day))
                .unique();

        const online = now - device.lastSeen < onlineThresholdMs;
        const active = online && latest != null && latest.idleMs < inactivityMs;
        const employeeId = person?.employeeId ?? null;
        const st = employeeId ? (stateByEmployee.get(employeeId) ?? null) : null;

        return {
          deviceDocId: device._id,
          deviceId: device.deviceId,
          hostname: device.hostname,
          agentVersion: device.agentVersion ?? null,
          personId: device.personId ?? null,
          personName: person?.name ?? null,
          personEmployeeId: employeeId,
          windowsUser: device.lastWindowsUser,
          online,
          active,
          idleMs: latest?.idleMs ?? null,
          lastSeen: device.lastSeen,
          todayActiveSeconds: stats?.activeSeconds ?? 0,
          todayIdleSeconds: stats?.idleSeconds ?? 0,
          finalState: st?.finalState ?? null,
          finalStateSince: st?.finalStateSince ?? null,
          deviceIdle: st?.deviceIdle ?? null,
          stateIdleSeconds: st?.idleSeconds ?? null,
          genesysRoutingStatus: st?.genesysRoutingStatus ?? null,
          genesysPresence: st?.genesysPresence ?? null,
          genesysWrapUp: st?.genesysWrapUp ?? null,
          clockodoWorking: st?.clockodoWorking ?? null,
          clockodoBreak: st?.clockodoBreak ?? null,
          clockodoAbsent: st?.clockodoAbsent ?? null,
          clockodoClockedOut: st?.clockodoClockedOut ?? null,
          clockodoClockedOutCertain: st?.clockodoClockedOutCertain ?? null,
          stateUpdatedAt: st?.updatedAt ?? null,
        };
      }),
    );
  },
});

/**
 * Compact counts for the overview's "Team status" widget — same underlying
 * data as `teamOverview`, reduced to totals so the widget doesn't pull the
 * full per-device payload just to render a few numbers.
 */
export const dashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "view_activity_admin");
    const now = Date.now();
    const config = await readConfig(ctx);
    const onlineThresholdMs = config.offlineThresholdSeconds * 1000;
    const inactivityMs = config.inactivityThresholdSeconds * 1000;

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Batched the same way teamOverview does: one Promise.all per lookup
    // table instead of an await per device in a loop.
    const personIds = [...new Set(devices.flatMap((d) => (d.personId ? [d.personId] : [])))];
    const peopleById = new Map(
      (await Promise.all(personIds.map((id) => ctx.db.get(id)))).flatMap((p) =>
        p ? [[p._id, p] as const] : [],
      ),
    );
    const employeeIds = [
      ...new Set([...peopleById.values()].flatMap((p) => (p.employeeId ? [p.employeeId] : []))),
    ];
    const stateByEmployee = new Map(
      (
        await Promise.all(
          employeeIds.map((id) =>
            ctx.db
              .query("employeeStates")
              .withIndex("by_employeeId", (q) => q.eq("employeeId", id))
              .unique(),
          ),
        )
      ).flatMap((s) => (s ? [[s.employeeId, s] as const] : [])),
    );

    let online = 0;
    let active = 0;
    let onBreak = 0;
    let absent = 0;
    for (const device of devices) {
      const latest = device.lastSample ?? (await latestSample(ctx, device.deviceId));
      const isOnline = now - device.lastSeen < onlineThresholdMs;
      if (isOnline) online++;
      if (isOnline && latest != null && latest.idleMs < inactivityMs) active++;
      const person = device.personId ? (peopleById.get(device.personId) ?? null) : null;
      const st = person?.employeeId ? (stateByEmployee.get(person.employeeId) ?? null) : null;
      if (st?.clockodoBreak) onBreak++;
      if (st?.clockodoAbsent) absent++;
    }

    return { total: devices.length, online, active, onBreak, absent };
  },
});

/** Daily stats for one device across a [startDay, endDay] inclusive range. */
export const dailyRange = query({
  args: {
    deviceId: v.string(),
    startDay: v.string(),
    endDay: v.string(),
  },
  handler: async (ctx, { deviceId, startDay, endDay }) => {
    await requireCapability(ctx, "view_activity_admin");
    return await ctx.db
      .query("dailyStats")
      .withIndex("by_device_day", (q) =>
        q.eq("deviceId", deviceId).gte("day", startDay).lte("day", endDay),
      )
      .collect();
  },
});

/** Recent raw samples for a device (per-person timeline). Capped. */
export const recentSamples = query({
  args: {
    deviceId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deviceId, limit }) => {
    await requireCapability(ctx, "view_activity_admin");
    return await ctx.db
      .query("activitySamples")
      .withIndex("by_device_time", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(Math.min(limit ?? 200, 1000));
  },
});

/**
 * Raw samples for one device inside a [startMs, endMs) window — the timeline's
 * selected local day. Unlike `recentSamples`, a past day is a closed range:
 * new inserts never invalidate it, so Convex serves repeat visits from the
 * query cache without re-reading the table. "Today" reads only today's rows.
 */
export const samplesForDay = query({
  args: {
    deviceId: v.string(),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, { deviceId, startMs, endMs }) => {
    await requireCapability(ctx, "view_activity_admin");
    return await ctx.db
      .query("activitySamples")
      .withIndex("by_device_time", (q) =>
        q.eq("deviceId", deviceId).gte("capturedAt", startMs).lt("capturedAt", endMs),
      )
      // 24h at the nominal 15s cadence is 5760 rows; cap with headroom.
      .take(6000);
  },
});

/** Per-employee export bundle for a [startDay, endDay] range. Capped. */
export const exportDevice = query({
  args: {
    deviceId: v.string(),
    startDay: v.string(),
    endDay: v.string(),
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, { deviceId, startDay, endDay, sampleLimit }) => {
    await requireCapability(ctx, "view_activity_admin");

    const daily = await ctx.db
      .query("dailyStats")
      .withIndex("by_device_day", (q) =>
        q.eq("deviceId", deviceId).gte("day", startDay).lte("day", endDay),
      )
      .collect();

    const startMs = new Date(`${startDay}T00:00:00Z`).getTime();
    const endMs = new Date(`${endDay}T23:59:59.999Z`).getTime();
    const rows = await ctx.db
      .query("activitySamples")
      .withIndex("by_device_time", (q) =>
        q.eq("deviceId", deviceId).gte("capturedAt", startMs).lte("capturedAt", endMs),
      )
      .order("desc")
      .take(Math.min(sampleLimit ?? 10000, 20000));

    // Samples no longer store the per-device fields; backfill the export
    // shape from the device row so CSV/JSON columns stay populated. Rows
    // written before the slimming keep their own (exact) values.
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .unique();
    const samples = rows.map((s) => ({
      ...s,
      windowsUser: s.windowsUser ?? device?.lastWindowsUser ?? "",
      hostname: s.hostname ?? device?.hostname ?? "",
    }));

    return { deviceId, startDay, endDay, daily, samples };
  },
});
