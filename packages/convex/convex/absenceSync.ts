"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Hourly Clockodo → absences reconcile. The webhook (apps/api) is the fast
 * path; this cron catches webhooks that were missed, disabled server-side, or
 * fired before the affected employee got linked to an intranet account.
 * Endpoints/base match apps/api's client so both paths see the same data.
 */
const BASE_URL = () =>
  process.env.CLOCKODO_API_URL ?? "https://my.clockodo.com/api";

function headers(): Record<string, string> {
  return {
    "X-ClockodoApiUser": process.env.CLOCKODO_API_USER!,
    "X-ClockodoApiKey": process.env.CLOCKODO_API_KEY!,
    "X-Clockodo-External-Application":
      process.env.CLOCKODO_EXTERNAL_APP ??
      "AdvantisIntranet;it@advantisgroup.de",
  };
}

async function clockodoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL()}${path}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Clockodo GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

interface ClockodoAbsence {
  id: number;
  users_id: number;
  date_since: string;
  date_until: string;
  status: number;
  type: number;
  note: string | null;
  count_days: number | null;
}

export const syncClockodoAbsences = internalAction({
  args: {},
  // Explicit return type: deriving it from runMutation results would make the
  // generated `internal` type circular (TS7022).
  handler: async (ctx): Promise<void> => {
    if (!process.env.CLOCKODO_API_USER || !process.env.CLOCKODO_API_KEY) {
      return;
    }

    const emailByClockodoId = new Map<number, string>();
    const usersBody = await clockodoGet<{
      users?: { id: number; email: string }[];
    }>(`/v2/users`);
    for (const u of usersBody.users ?? []) emailByClockodoId.set(u.id, u.email);

    const now = new Date();
    const years = [now.getFullYear()];
    // Early in the year, absences spanning the boundary (and late corrections)
    // still live in last year's list.
    if (now.getMonth() === 0) years.push(now.getFullYear() - 1);

    for (const year of years) {
      const body = await clockodoGet<{ absences?: ClockodoAbsence[] }>(
        `/absences?year=${year}`
      );
      const absences = (body.absences ?? []).map(a => ({
        externalId: String(a.id),
        clockodoUserId: a.users_id,
        email: emailByClockodoId.get(a.users_id),
        dateSince: a.date_since,
        dateUntil: a.date_until,
        clockodoType: a.type,
        clockodoStatus: a.status,
        countDays: a.count_days ?? undefined,
        note: a.note ?? undefined,
      }));
      const result: {
        created: number;
        updated: number;
        skipped: number;
        deleted: number;
      } = await ctx.runMutation(internal.clockodoSync.applySyncBatch, {
        year,
        absences,
      });
      console.log(`[absenceSync] ${year}:`, JSON.stringify(result));
    }
  },
});
