import { Errors } from "./errors.js";

const BASE_URL = process.env.CLOCKODO_API_URL ?? "https://my.clockodo.com/api";

export interface ClockodoAbsence {
  id: number;
  users_id: number;
  date_since: string;
  date_until: string;
  status: number;
  type: number;
  note: string | null;
  count_days: number | null;
  count_hours: number | null;
  sick_note: boolean | null;
}

interface ClockodoUser {
  id: number;
  name: string;
  email: string;
}

function headers(): Record<string, string> {
  const user = process.env.CLOCKODO_API_USER;
  const key = process.env.CLOCKODO_API_KEY;
  if (!user || !key) {
    throw Errors.internal("CLOCKODO_API_USER / CLOCKODO_API_KEY not configured");
  }
  return {
    "X-ClockodoApiUser": user,
    "X-ClockodoApiKey": key,
    "X-Clockodo-External-Application":
      process.env.CLOCKODO_EXTERNAL_APP ?? "AdvantisIntranet;it@advantisgroup.de",
    "Content-Type": "application/json",
  };
}

async function clockodoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (res.status === 429) throw Errors.rateLimited("Clockodo rate limit");
  if (!res.ok) {
    throw Errors.upstream(`Clockodo GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getAbsence(id: number): Promise<ClockodoAbsence> {
  const data = await clockodoGet<{ data: ClockodoAbsence }>(`/v4/absences/${id}`);
  return data.data;
}

export async function listAbsences(year: number): Promise<ClockodoAbsence[]> {
  const data = await clockodoGet<{ data: ClockodoAbsence[] }>(
    `/v4/absences?filter[year]=${year}&scope=viewableAbsences`,
  );
  return data.data ?? [];
}

/**
 * Absences for "this year, live" — the years an absence spanning the
 * new-year boundary could fall in. Early in the year, late corrections to
 * last year's absences can still land in last year's list.
 */
export async function listCurrentAbsences(): Promise<ClockodoAbsence[]> {
  const now = new Date();
  const years = [now.getFullYear()];
  if (now.getMonth() === 0) years.push(now.getFullYear() - 1);
  const byYear = await Promise.all(years.map((y) => listAbsences(y)));
  return byYear.flat();
}

export type CoarseAbsenceType = "vacation" | "sick" | "personal" | "other";
export type CoarseAbsenceStatus = "pending" | "approved" | "denied" | "cancelled";

/** Map a Clockodo absence type id to our coarse category. */
export function mapAbsenceType(clockodoType: number): CoarseAbsenceType {
  switch (clockodoType) {
    case 1: // regular holiday
      return "vacation";
    case 4: // sick day
    case 5: // sick day of a child
    case 11: // sick day (unpaid)
    case 12: // sick day of child (unpaid)
    case 13: // quarantine
    case 15: // sick day (sickness benefit)
      return "sick";
    case 2: // special leaves
    case 6: // school / further education
    case 7: // maternity protection
    case 10: // special leaves (unpaid)
    case 14: // military / alternative service
      return "personal";
    default: // 3 overtime reduction, 8 home office, 9 work out of office, ...
      return "other";
  }
}

/** Map a Clockodo status code to our status. */
export function mapAbsenceStatus(clockodoStatus: number): CoarseAbsenceStatus {
  switch (clockodoStatus) {
    case 0:
      return "pending";
    case 1:
      return "approved";
    case 2:
      return "denied";
    case 3:
    case 4:
      return "cancelled";
    default:
      return "pending";
  }
}

// Short-lived cache of coworker id → email so a burst of absence webhooks
// doesn't hammer the users endpoint.
let userCache: { map: Map<number, string>; expiresAt: number } | null = null;
const USER_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getUserEmail(usersId: number): Promise<string | undefined> {
  if (!userCache || userCache.expiresAt < Date.now()) {
    const data = await clockodoGet<{ users: ClockodoUser[] }>(`/v2/users`);
    const map = new Map<number, string>();
    for (const u of data.users ?? []) map.set(u.id, u.email);
    userCache = { map, expiresAt: Date.now() + USER_CACHE_TTL_MS };
  }
  return userCache.map.get(usersId);
}
