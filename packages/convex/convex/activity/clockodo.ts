"use node";

import { v } from "convex/values";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import {
  signalSecret,
  reportHealth,
  healthStatusOf,
  errMessage,
  today,
  type Mapping,
} from "./lib/integrationsShared";

/**
 * Clockodo time-tracking client, running inside Convex's Node runtime. An open
 * (running) entry means working; dropping the clock mid-day is the "break". The
 * scheduled orchestrator in `integrations.ts` calls `pollClockodo`.
 */

const CLOCKODO_BASE = () =>
  process.env.CLOCKODO_BASE_URL ?? "https://my.clockodo.com";

function clockodoHeaders(): Record<string, string> {
  const apiUser = process.env.CLOCKODO_API_USER;
  const apiKey = process.env.CLOCKODO_API_KEY;
  if (!apiUser || !apiKey) {
    throw new Error("CLOCKODO_API_USER / CLOCKODO_API_KEY not configured");
  }
  return {
    "X-ClockodoApiUser": apiUser,
    "X-ClockodoApiKey": apiKey,
    "X-Clockodo-External-Application": "ActivityTrack",
  };
}

async function clockodoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOCKODO_BASE()}${path}`, {
    headers: clockodoHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

interface Absence {
  users_id?: number;
  date_since?: string;
  date_until?: string;
  status?: number;
}

async function fetchAbsences(year: number): Promise<Absence[]> {
  const qs = `year=${year}&filter[scope]=viewableAbsences`;
  const body = await clockodoGet<{ data?: Absence[] }>(`/api/v4/absences?${qs}`);
  return body.data ?? [];
}

function isAbsentOn(
  absences: Absence[],
  clockodoUserId: string,
  day: string
): boolean {
  const uid = Number(clockodoUserId);
  return absences.some(
    a =>
      a.users_id === uid &&
      a.status === 1 &&
      !!a.date_since &&
      !!a.date_until &&
      a.date_since <= day &&
      day <= a.date_until
  );
}

function clockodoDate(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

interface ClockodoEntry {
  users_id?: number;
  clocked?: boolean;
  time_until?: string | null;
}

async function fetchTodayEntries(
  clockodoUserId: string
): Promise<ClockodoEntry[]> {
  const day = today();
  const qs = [
    `time_since=${encodeURIComponent(`${day}T00:00:00Z`)}`,
    `time_until=${encodeURIComponent(clockodoDate())}`,
    `filter[users_id]=${encodeURIComponent(clockodoUserId)}`,
  ].join("&");
  const body = await clockodoGet<{ entries?: ClockodoEntry[] }>(
    `/api/v2/entries?${qs}`
  );
  return body.entries ?? [];
}

async function fetchClockodoWork(clockodoUserId: string): Promise<{
  working: boolean;
  onBreak: boolean;
}> {
  const entries = await fetchTodayEntries(clockodoUserId);
  const clockedIn = entries.some(e => e.clocked === true);
  return entries.length === 0
    ? { working: false, onBreak: false }
    : { working: clockedIn, onBreak: !clockedIn };
}

async function fetchClockodoEntry(
  id: string
): Promise<{ usersId: string | null; clocked: boolean | null }> {
  const res = await fetch(`${CLOCKODO_BASE()}/api/v2/entries/${id}`, {
    headers: clockodoHeaders(),
  });
  if (res.status === 404) return { usersId: null, clocked: null };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET entry ${id} failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { entry?: ClockodoEntry };
  return {
    usersId: body.entry?.users_id != null ? String(body.entry.users_id) : null,
    clocked: body.entry?.clocked ?? null,
  };
}

/** Poll slice: org-wide approved absences + each mapped user's working/break. */
export async function pollClockodo(
  ctx: ActionCtx,
  secret: string,
  mappings: Mapping[]
): Promise<void> {
  const clockodoPeople = mappings.filter(p => p.clockodoUserId);
  if (clockodoPeople.length === 0) return;
  try {
    const absences = await fetchAbsences(new Date().getFullYear());
    const day = today();
    for (const p of clockodoPeople) {
      const work = await fetchClockodoWork(p.clockodoUserId!);
      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId: p.employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoAbsent: isAbsentOn(absences, p.clockodoUserId!, day),
      });
    }
    await reportHealth(ctx, "clockodo", "ok");
  } catch (err) {
    await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
  }
}

/** On-demand Clockodo refresh for one user (used by the webhook re-pull path). */
export const refreshClockodo = action({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    clockodoUserId: v.string(),
  },
  handler: async (ctx, { secret, employeeId, clockodoUserId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const day = today();
      const [work, absences] = await Promise.all([
        fetchClockodoWork(clockodoUserId),
        fetchAbsences(new Date().getFullYear()),
      ]);
      const absent = isAbsentOn(absences, clockodoUserId, day);
      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoAbsent: absent,
      });
      await reportHealth(ctx, "clockodo", "ok");
      return { ok: true as const };
    } catch (err) {
      await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "clockodo_unavailable" as const };
    }
  },
});

/**
 * Re-pull state from a Clockodo webhook event. Clockodo sends only the id of
 * the changed entry, so we fetch the entry (to learn the user AND its current
 * `clocked` state), then push the derived working/break/absent signal.
 */
export const refreshClockodoByEntry = action({
  args: {
    secret: v.string(),
    entryId: v.string(),
    eventName: v.optional(v.string()),
  },
  handler: async (ctx, { secret, entryId, eventName }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const { usersId: clockodoUserId, clocked: entryClocked } =
        await fetchClockodoEntry(entryId);

      if (!clockodoUserId) {
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, ignored: true as const };
      }

      const employeeId = await ctx.runQuery(api.activity.state.resolveEmployeeId, {
        secret,
        clockodoUserId,
      });
      if (!employeeId) {
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, unmapped: true as const };
      }

      const absences = await fetchAbsences(new Date().getFullYear());
      const absent = isAbsentOn(absences, clockodoUserId, today());

      let working: boolean;
      let onBreak: boolean;

      if (eventName === "entry.stopped") {
        working = false;
        onBreak = true;
      } else {
        working = entryClocked === true;
        onBreak = entryClocked === false;
      }

      const resolution =
        eventName === "entry.stopped"
          ? "trusted_stop"
          : entryClocked === true
            ? "entry_clocked_true"
            : "entry_clocked_false";

      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId,
        source: "clockodo",
        clockodoWorking: working,
        clockodoBreak: onBreak,
        clockodoAbsent: absent,
      });

      const logSeverity =
        working && eventName !== "entry.created" ? "warning" : "info";
      await ctx.runMutation(internal.activity.events.record, {
        source: "backend",
        severity: logSeverity,
        code: `clockodo.webhook.${eventName ?? "unknown"}`,
        message: `entry=${entryId} employee=${employeeId} → working=${working} onBreak=${onBreak} (${resolution})`,
        context: JSON.stringify({
          eventName,
          entryId,
          clockodoUserId,
          employeeId,
          entryClocked,
          working,
          onBreak,
          absent,
        }),
      });

      await reportHealth(ctx, "clockodo", "ok");
      return { ok: true as const };
    } catch (err) {
      await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "clockodo_unavailable" as const };
    }
  },
});
