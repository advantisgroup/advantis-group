"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Hourly Clockodo → absences reconcile. The webhook (apps/api) is the fast
 * path; this cron catches webhooks that were missed, disabled server-side, or
 * fired before the affected employee got linked to an intranet account.
 * Endpoints/base match `activity/clockodo.ts`'s already-working poller (the
 * v2 API this file used to call — including `/v2/users`, below — has since
 * been retired and returns 410 Gone) so both paths see the same data.
 */
const BASE_URL = () =>
  process.env.CLOCKODO_API_URL ?? "https://my.clockodo.com/api/v4";

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

    // No users-list lookup here (the old `/v2/users` call this used to
    // build an email fallback from is gone — 410 — on Clockodo's retired v2
    // API). `clockodoSync.ts`'s `resolveUser` already matches by
    // `clockodoUserId` first (via `users.by_clockodoUserId`, falling back to
    // `people.by_clockodoUserId`) and only needs email for accounts with
    // neither link yet — same as `activity/clockodo.ts`'s poller, which
    // never fetches a user list at all.
    const now = new Date();
    const years = [now.getFullYear()];
    // Early in the year, absences spanning the boundary (and late corrections)
    // still live in last year's list.
    if (now.getMonth() === 0) years.push(now.getFullYear() - 1);

    for (const year of years) {
      const body = await clockodoGet<{ data?: ClockodoAbsence[] }>(
        `/absences?year=${year}&filter[scope]=viewableAbsences`
      );
      const absences = (body.data ?? []).map(a => ({
        externalId: String(a.id),
        clockodoUserId: a.users_id,
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
