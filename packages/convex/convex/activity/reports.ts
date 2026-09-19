import { v } from "convex/values";

import { query, userQuery } from "../functions";
/**
 * Read models for the cross-device Reports page. Returns each active device's
 * daily rollups over a [startDay, endDay] window joined to its person.
 */
export const weeklyOverview = userQuery({
  args: {
    startDay: v.string(),
    endDay: v.string(),
  },
  handler: async (ctx, { startDay, endDay }) => {
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

    return await Promise.all(
      devices.map(async (device) => {
        const person = device.personId ? (peopleById.get(device.personId) ?? null) : null;
        const daily = await ctx.db
          .query("dailyStats")
          .withIndex("by_device_day", (q) =>
            q.eq("deviceId", device.deviceId).gte("day", startDay).lte("day", endDay),
          )
          .collect();
        return {
          deviceId: device.deviceId,
          hostname: device.hostname,
          personId: device.personId ?? null,
          personName: person?.name ?? null,
          windowsUser: device.lastWindowsUser ?? null,
          lastSeen: device.lastSeen,
          daily: daily.map((d) => ({
            day: d.day,
            activeSeconds: d.activeSeconds,
            idleSeconds: d.idleSeconds,
          })),
        };
      }),
    );
  },
});
