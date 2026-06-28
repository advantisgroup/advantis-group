import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { readConfig } from "./settings";
import { logEvent } from "./events";

/**
 * Server-side persistence for agent samples. The ONLY place samples become
 * durable, reachable only from the authenticated `/ingest` HTTP action (see
 * http.ts) / the Elysia ingestion layer, never from clients.
 */

const MAX_ATTRIBUTION_MS = 120_000;
const NOMINAL_FIRST_MS = 15_000;
const MAX_TZ_OFFSET_MINUTES = 840;
const MIN_INGEST_INTERVAL_MS = 3_000;

const sampleValidator = v.object({
  deviceId: v.string(),
  windowsUser: v.string(),
  hostname: v.string(),
  idleMs: v.number(),
  active: v.boolean(),
  capturedAt: v.number(),
  tzOffsetMinutes: v.number(),
  agentVersion: v.string(),
  platform: v.string(),
});

function localDay(capturedAt: number, tzOffsetMinutes: number): string {
  const localMs = capturedAt - tzOffsetMinutes * 60_000;
  return new Date(localMs).toISOString().slice(0, 10);
}

export const recordSamples = internalMutation({
  args: {
    samples: v.array(sampleValidator),
  },
  handler: async (ctx, { samples }) => {
    const receivedAt = Date.now();
    const inactivityMs =
      (await readConfig(ctx)).inactivityThresholdSeconds * 1000;

    const byDevice = new Map<string, typeof samples>();
    for (const s of samples) {
      const list = byDevice.get(s.deviceId) ?? [];
      list.push(s);
      byDevice.set(s.deviceId, list);
    }

    let inserted = 0;
    let throttled = false;
    for (const [deviceId, deviceSamples] of byDevice) {
      deviceSamples.sort((a, b) => a.capturedAt - b.capturedAt);

      const device = await getDevice(ctx, deviceId);
      if (device && device.status === "disabled") continue;

      if (
        device?.lastIngestAt !== undefined &&
        receivedAt - device.lastIngestAt < MIN_INGEST_INTERVAL_MS
      ) {
        throttled = true;
        continue;
      }

      let prevCapturedAt = device?.lastSeen;

      for (const s of deviceSamples) {
        if (Math.abs(s.tzOffsetMinutes) > MAX_TZ_OFFSET_MINUTES) {
          await logEvent(ctx, {
            severity: "warning",
            source: "backend",
            code: "ingest.bad_tz_offset",
            message: `Device ${deviceId} sent tzOffsetMinutes=${s.tzOffsetMinutes}, clamped to 0`,
            deviceId,
            hostname: s.hostname,
          });
          s.tzOffsetMinutes = 0;
        }

        const duplicate = await ctx.db
          .query("activitySamples")
          .withIndex("by_device_time", q =>
            q.eq("deviceId", deviceId).eq("capturedAt", s.capturedAt)
          )
          .first();

        if (!duplicate) {
          await ctx.db.insert("activitySamples", { ...s, receivedAt });
          inserted++;
        }

        const rawGap =
          prevCapturedAt === undefined
            ? NOMINAL_FIRST_MS
            : s.capturedAt - prevCapturedAt;
        const gapMs = Math.max(0, Math.min(rawGap, MAX_ATTRIBUTION_MS));
        prevCapturedAt = s.capturedAt;

        if (!duplicate) {
          await accrueDaily(ctx, deviceId, s, gapMs, inactivityMs);
        }
      }

      const newest = deviceSamples[deviceSamples.length - 1]!;
      if (device) {
        const userChanged =
          !!device.lastWindowsUser &&
          newest.windowsUser !== device.lastWindowsUser;
        const userHistory = userChanged
          ? [
              ...(device.userHistory ?? []),
              { user: device.lastWindowsUser, changedAt: receivedAt },
            ].slice(-10)
          : device.userHistory;
        await ctx.db.patch(device._id, {
          hostname: newest.hostname,
          lastWindowsUser: newest.windowsUser,
          ...(userChanged ? { userHistory } : {}),
          lastSeen: Math.max(device.lastSeen, newest.capturedAt),
          agentVersion: newest.agentVersion,
          status: device.status,
          lastIngestAt: receivedAt,
        });
      } else {
        await ctx.db.insert("devices", {
          deviceId,
          hostname: newest.hostname,
          lastWindowsUser: newest.windowsUser,
          status: "pending",
          lastSeen: newest.capturedAt,
          agentVersion: newest.agentVersion,
          lastIngestAt: receivedAt,
        });
      }
    }

    return { inserted, throttled };
  },
});

async function getDevice(
  ctx: MutationCtx,
  deviceId: string
): Promise<Doc<"devices"> | null> {
  return await ctx.db
    .query("devices")
    .withIndex("by_deviceId", q => q.eq("deviceId", deviceId))
    .unique();
}

async function accrueDaily(
  ctx: MutationCtx,
  deviceId: string,
  sample: { idleMs: number; capturedAt: number; tzOffsetMinutes: number },
  gapMs: number,
  inactivityMs: number
): Promise<void> {
  const isActive = sample.idleMs < inactivityMs;
  const tz = sample.tzOffsetMinutes;
  const end = sample.capturedAt;
  const start = end - gapMs;

  let segStart = start;
  while (segStart < end) {
    const day = localDay(segStart, tz);
    const dayStartLocalMs = Date.parse(`${day}T00:00:00.000Z`);
    const nextDayEpoch = dayStartLocalMs + 24 * 60 * 60_000 + tz * 60_000;
    const segEnd = Math.min(end, nextDayEpoch);
    const seconds = (segEnd - segStart) / 1000;
    if (seconds > 0) {
      await accrueDay(
        ctx,
        deviceId,
        day,
        isActive ? seconds : 0,
        isActive ? 0 : seconds,
        segStart,
        segEnd
      );
    }
    segStart = segEnd;
  }
}

async function accrueDay(
  ctx: MutationCtx,
  deviceId: string,
  day: string,
  activeDelta: number,
  idleDelta: number,
  firstSeen: number,
  lastSeen: number
): Promise<void> {
  const existing = await ctx.db
    .query("dailyStats")
    .withIndex("by_device_day", q => q.eq("deviceId", deviceId).eq("day", day))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      activeSeconds: existing.activeSeconds + activeDelta,
      idleSeconds: existing.idleSeconds + idleDelta,
      firstSeen: Math.min(existing.firstSeen, firstSeen),
      lastSeen: Math.max(existing.lastSeen, lastSeen),
    });
  } else {
    await ctx.db.insert("dailyStats", {
      deviceId,
      day,
      activeSeconds: activeDelta,
      idleSeconds: idleDelta,
      firstSeen,
      lastSeen,
    });
  }
}
