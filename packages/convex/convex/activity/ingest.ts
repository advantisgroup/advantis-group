import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isFeatureEnabled } from "../featureFlags";
import { readConfig } from "./settings";
import { logEvent } from "./events";
import { applyStateSignal } from "./state";

/**
 * Server-side persistence for agent samples. The ONLY place samples become
 * durable, reachable only from the authenticated `/ingest` HTTP action (see
 * http.ts) / the Elysia ingestion layer, never from clients.
 */

// Must stay comfortably above the desktop agent's KEEPALIVE_INTERVAL
// (apps/desktop/src-tauri/src/tracker.rs in ActivityTrack) or idle gaps get
// truncated / the offline threshold flickers — see the comment there.
const MAX_ATTRIBUTION_MS = 360_000;
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
  // Absent on every sample from agents older than the change-only sampling
  // rollout, and on every durable "state changed" sample from newer agents
  // too — both cases mean "sample" (persist a row). "keepalive" is a cheap
  // ~60s ping newer agents send while state is unchanged, only to prove the
  // device is still online and to close the attribution gap for dailyStats;
  // it must never become an activitySamples row.
  kind: v.optional(v.union(v.literal("sample"), v.literal("keepalive"))),
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
    // ActivityTrack disabled: drop the batch without persisting anything
    // (raw samples, dailyStats, device rows, or fused state) and without
    // erroring the agent, which has no concept of this flag.
    if (!(await isFeatureEnabled(ctx, "activitytrack"))) {
      return { inserted: 0, throttled: false };
    }

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

      // One ranged read replaces a per-sample point read: every existing
      // capturedAt in the batch's window, deduped in memory. `seen` also
      // absorbs intra-batch duplicates (the old per-sample read caught those
      // because `ctx.db` sees the mutation's own writes). A keepalive-only
      // batch never inserts into (or dedupes against) `activitySamples`, so
      // skip the lookup entirely — otherwise every ~keepalive-interval tick
      // from every idle device pays for a read that can't affect the outcome.
      const oldest = deviceSamples[0]!;
      const newest = deviceSamples[deviceSamples.length - 1]!;
      const allKeepalive = deviceSamples.every(s => s.kind === "keepalive");
      const existing = allKeepalive
        ? []
        : await ctx.db
            .query("activitySamples")
            .withIndex("by_device_time", q =>
              q
                .eq("deviceId", deviceId)
                .gte("capturedAt", oldest.capturedAt)
                .lte("capturedAt", newest.capturedAt)
            )
            .collect();
      const seen = new Set(existing.map(doc => doc.capturedAt));

      const dayTotals = new Map<string, DayTotals>();
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

        // A keepalive is never a stored row, so it can never be an
        // already-stored duplicate — dedup only applies to real samples.
        const isKeepalive = s.kind === "keepalive";
        const duplicate = !isKeepalive && seen.has(s.capturedAt);

        if (!isKeepalive && !duplicate) {
          // Slim row: the near-constant per-device fields the agent sends
          // (windowsUser/hostname/agentVersion/platform) are kept on the
          // devices row instead of being repeated on every sample.
          await ctx.db.insert("activitySamples", {
            deviceId: s.deviceId,
            idleMs: s.idleMs,
            active: s.active,
            capturedAt: s.capturedAt,
            tzOffsetMinutes: s.tzOffsetMinutes,
            receivedAt,
          });
          seen.add(s.capturedAt);
          inserted++;
        }

        const rawGap =
          prevCapturedAt === undefined
            ? NOMINAL_FIRST_MS
            : s.capturedAt - prevCapturedAt;
        const gapMs = Math.max(0, Math.min(rawGap, MAX_ATTRIBUTION_MS));
        prevCapturedAt = s.capturedAt;

        if (!duplicate) {
          accrueDaily(dayTotals, s, gapMs, inactivityMs);
        }
      }

      // Flush the accumulated per-day deltas: one dailyStats read + one
      // write per (device, local day) instead of one pair per sample.
      // `todayStats` mirrors whichever day is most recent in the batch, so
      // the device row always reflects the day `newest` falls in.
      const currentDay = localDay(newest.capturedAt, newest.tzOffsetMinutes);
      let todayStats: Doc<"devices">["todayStats"];
      for (const [day, totals] of dayTotals) {
        const dayTotal = await flushDay(ctx, deviceId, day, totals);
        if (day === currentDay) {
          todayStats = { day, ...dayTotal };
        }
      }

      const lastSample = {
        capturedAt: newest.capturedAt,
        idleMs: newest.idleMs,
        active: newest.active,
        tzOffsetMinutes: newest.tzOffsetMinutes,
      };
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
          lastSample,
          ...(todayStats ? { todayStats } : {}),
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
          lastSample,
          ...(todayStats ? { todayStats } : {}),
        });
      }

      // Feed the fused employee-state cache from the same heartbeat. This is
      // the *only* place the workstation's "agent" signal reaches
      // `employeeStates` — the desktop agent authenticates with its device
      // token and never learns its own `employeeId`, so the secret-guarded
      // `pushSignal` mutation (which expects a client-supplied `employeeId`)
      // is unreachable from the real agent. Resolve the link the same way a
      // manager set it up (device -> personId -> employeeId) and apply it
      // directly, or the "Workstation" row on the dashboard never leaves "—".
      if (device?.personId) {
        const person = await ctx.db.get(device.personId);
        if (person?.employeeId) {
          await applyStateSignal(ctx, {
            employeeId: person.employeeId,
            source: "agent",
            deviceIdle: newest.idleMs >= inactivityMs,
            idleSeconds: Math.round(newest.idleMs / 1000),
          });
        }
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

interface DayTotals {
  activeDelta: number;
  idleDelta: number;
  firstSeen: number;
  lastSeen: number;
}

// Accumulates a sample's attributed gap into per-day in-memory totals
// (splitting across local-day boundaries); `flushDay` persists each day once
// per batch. Sums are associative and first/lastSeen are min/max, so this is
// arithmetically identical to the previous per-sample read-modify-write.
function accrueDaily(
  dayTotals: Map<string, DayTotals>,
  sample: { idleMs: number; capturedAt: number; tzOffsetMinutes: number },
  gapMs: number,
  inactivityMs: number
): void {
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
      const totals = dayTotals.get(day);
      if (totals) {
        totals.activeDelta += isActive ? seconds : 0;
        totals.idleDelta += isActive ? 0 : seconds;
        totals.firstSeen = Math.min(totals.firstSeen, segStart);
        totals.lastSeen = Math.max(totals.lastSeen, segEnd);
      } else {
        dayTotals.set(day, {
          activeDelta: isActive ? seconds : 0,
          idleDelta: isActive ? 0 : seconds,
          firstSeen: segStart,
          lastSeen: segEnd,
        });
      }
    }
    segStart = segEnd;
  }
}

async function flushDay(
  ctx: MutationCtx,
  deviceId: string,
  day: string,
  { activeDelta, idleDelta, firstSeen, lastSeen }: DayTotals
): Promise<{ activeSeconds: number; idleSeconds: number }> {
  const existing = await ctx.db
    .query("dailyStats")
    .withIndex("by_device_day", q => q.eq("deviceId", deviceId).eq("day", day))
    .unique();

  if (existing) {
    const activeSeconds = existing.activeSeconds + activeDelta;
    const idleSeconds = existing.idleSeconds + idleDelta;
    await ctx.db.patch(existing._id, {
      activeSeconds,
      idleSeconds,
      firstSeen: Math.min(existing.firstSeen, firstSeen),
      lastSeen: Math.max(existing.lastSeen, lastSeen),
    });
    return { activeSeconds, idleSeconds };
  } else {
    await ctx.db.insert("dailyStats", {
      deviceId,
      day,
      activeSeconds: activeDelta,
      idleSeconds: idleDelta,
      firstSeen,
      lastSeen,
    });
    return { activeSeconds: activeDelta, idleSeconds: idleDelta };
  }
}
