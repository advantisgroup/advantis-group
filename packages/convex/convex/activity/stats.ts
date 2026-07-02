import { v } from "convex/values";

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { requireUser } from "../lib/auth";
import { readConfig } from "./settings";

/**
 * Read models for the dashboard. All gated at any signed-in user; the extra
 * manager/admin capabilities are about mutations, not visibility.
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
    .withIndex("by_device_time", q => q.eq("deviceId", deviceId))
    .order("desc")
    .first();
}

/**
 * Team overview: every approved device, who it belongs to, whether the person
 * is active right now, and how much active time they've logged today.
 */
export const teamOverview = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const now = Date.now();
    const config = await readConfig(ctx);
    const onlineThresholdMs = config.offlineThresholdSeconds * 1000;
    const inactivityMs = config.inactivityThresholdSeconds * 1000;

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();

    const personIds = [
      ...new Set(devices.flatMap(d => (d.personId ? [d.personId] : []))),
    ];
    const peopleById = new Map(
      (await Promise.all(personIds.map(id => ctx.db.get(id)))).flatMap(p =>
        p ? [[p._id, p] as const] : []
      )
    );

    const employeeIds = [
      ...new Set(
        [...peopleById.values()].flatMap(p =>
          p.employeeId ? [p.employeeId] : []
        )
      ),
    ];
    const stateByEmployee = new Map(
      (
        await Promise.all(
          employeeIds.map(id =>
            ctx.db
              .query("employeeStates")
              .withIndex("by_employeeId", q => q.eq("employeeId", id))
              .unique()
          )
        )
      ).flatMap(s => (s ? [[s.employeeId, s] as const] : []))
    );

    return Promise.all(
      devices.map(async device => {
        const person = device.personId
          ? (peopleById.get(device.personId) ?? null)
          : null;
        const latest = await latestSample(ctx, device.deviceId);
        const tzOffset = latest?.tzOffsetMinutes ?? 0;
        const day = localDay(now, tzOffset);

        const stats = await ctx.db
          .query("dailyStats")
          .withIndex("by_device_day", q =>
            q.eq("deviceId", device.deviceId).eq("day", day)
          )
          .unique();

        const online = now - device.lastSeen < onlineThresholdMs;
        const active = online && latest != null && latest.idleMs < inactivityMs;
        const employeeId = person?.employeeId ?? null;
        const st = employeeId
          ? (stateByEmployee.get(employeeId) ?? null)
          : null;

        return {
          deviceDocId: device._id,
          deviceId: device.deviceId,
          hostname: device.hostname,
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
      })
    );
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
    await requireUser(ctx);
    return await ctx.db
      .query("dailyStats")
      .withIndex("by_device_day", q =>
        q.eq("deviceId", deviceId).gte("day", startDay).lte("day", endDay)
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
    await requireUser(ctx);
    return await ctx.db
      .query("activitySamples")
      .withIndex("by_device_time", q => q.eq("deviceId", deviceId))
      .order("desc")
      .take(Math.min(limit ?? 200, 1000));
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
    await requireUser(ctx);

    const daily = await ctx.db
      .query("dailyStats")
      .withIndex("by_device_day", q =>
        q.eq("deviceId", deviceId).gte("day", startDay).lte("day", endDay)
      )
      .collect();

    const startMs = new Date(`${startDay}T00:00:00Z`).getTime();
    const endMs = new Date(`${endDay}T23:59:59.999Z`).getTime();
    const samples = await ctx.db
      .query("activitySamples")
      .withIndex("by_device_time", q =>
        q
          .eq("deviceId", deviceId)
          .gte("capturedAt", startMs)
          .lte("capturedAt", endMs)
      )
      .order("desc")
      .take(Math.min(sampleLimit ?? 10000, 20000));

    return { deviceId, startDay, endDay, daily, samples };
  },
});
