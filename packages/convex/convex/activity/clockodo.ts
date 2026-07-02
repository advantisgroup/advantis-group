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
  const body = await clockodoGet<{ data?: Absence[] }>(
    `/api/v4/absences?${qs}`
  );
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

/**
 * Not-clocked-in gaps up to this long read as a break; anything longer is
 * *assumed* to be the end of the working day (Clockodo has no explicit "day
 * ended" event). The assumption is corrected back to BREAK if the person
 * clocks in again the same day — see `pushSignal`.
 */
const ASSUMED_CLOCKED_OUT_AFTER_MS = 60 * 60_000;

async function fetchClockodoWork(clockodoUserId: string): Promise<{
  working: boolean;
  onBreak: boolean;
  clockedOut: boolean;
}> {
  const entries = await fetchTodayEntries(clockodoUserId);
  // "Currently clocked in" = an entry with no end time yet. Clockodo's `clocked`
  // flag is NOT that — it marks entries recorded via the stopwatch and stays
  // true after clock-out, so using it here kept people "working" all day once
  // they had clocked in a single time.
  const running = entries.some(e => e.time_until == null);
  if (entries.length === 0) {
    return { working: false, onBreak: false, clockedOut: false };
  }
  if (running) {
    return { working: true, onBreak: false, clockedOut: false };
  }
  // Worked today but nothing running: a short gap is a break, a long one is
  // (assumed to be) the end of the day.
  const lastEnd = Math.max(
    ...entries.map(e => (e.time_until ? Date.parse(e.time_until) : 0))
  );
  const clockedOut =
    Number.isFinite(lastEnd) &&
    lastEnd > 0 &&
    Date.now() - lastEnd > ASSUMED_CLOCKED_OUT_AFTER_MS;
  return { working: false, onBreak: !clockedOut, clockedOut };
}

async function fetchClockodoEntry(
  id: string
): Promise<{ usersId: string | null; running: boolean | null }> {
  const res = await fetch(`${CLOCKODO_BASE()}/api/v2/entries/${id}`, {
    headers: clockodoHeaders(),
  });
  if (res.status === 404) return { usersId: null, running: null };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET entry ${id} failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { entry?: ClockodoEntry };
  return {
    usersId: body.entry?.users_id != null ? String(body.entry.users_id) : null,
    running: body.entry ? body.entry.time_until == null : null,
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
        clockodoClockedOut: work.clockedOut,
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
        clockodoClockedOut: work.clockedOut,
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
 * the changed entry, so we fetch the entry to learn which user it belongs to,
 * then recompute that user's *whole day* from the entries list — the exact
 * derivation the poller uses.
 *
 * The single entry's fields are deliberately not trusted for the verdict:
 * `clocked` means "recorded with the stopwatch" and stays true after clock-out,
 * so an `entry.updated` fired by the clock-out itself used to read as "working
 * again". Only `time_until == null` marks a running entry, and only the full
 * day answers "is anything still running for this user".
 *
 * `usersId` (from the webhook payload) is the fallback for `entry.deleted`,
 * where the entry can no longer be fetched — deleting the running entry must
 * still clear the working state.
 */
export const refreshClockodoByEntry = action({
  args: {
    secret: v.string(),
    entryId: v.string(),
    eventName: v.optional(v.string()),
    usersId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, entryId, eventName, usersId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const entry = await fetchClockodoEntry(entryId);
      const clockodoUserId = entry.usersId ?? usersId ?? null;

      if (!clockodoUserId) {
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, ignored: true as const };
      }

      const employeeId = await ctx.runQuery(
        api.activity.state.resolveEmployeeId,
        {
          secret,
          clockodoUserId,
        }
      );
      if (!employeeId) {
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, unmapped: true as const };
      }

      const [work, absences] = await Promise.all([
        fetchClockodoWork(clockodoUserId),
        fetchAbsences(new Date().getFullYear()),
      ]);
      const absent = isAbsentOn(absences, clockodoUserId, today());

      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoClockedOut: work.clockedOut,
        clockodoAbsent: absent,
      });

      await ctx.runMutation(internal.activity.events.record, {
        source: "backend",
        severity: "info",
        code: `clockodo.webhook.${eventName ?? "unknown"}`,
        message: `entry=${entryId} employee=${employeeId} → working=${work.working} onBreak=${work.onBreak} clockedOut=${work.clockedOut} (day recompute)`,
        context: JSON.stringify({
          eventName,
          entryId,
          clockodoUserId,
          employeeId,
          entryRunning: entry.running,
          working: work.working,
          onBreak: work.onBreak,
          clockedOut: work.clockedOut,
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
