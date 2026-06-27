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
    throw Errors.internal(
      "CLOCKODO_API_USER / CLOCKODO_API_KEY not configured"
    );
  }
  return {
    "X-ClockodoApiUser": user,
    "X-ClockodoApiKey": key,
    "X-Clockodo-External-Application":
      process.env.CLOCKODO_EXTERNAL_APP ??
      "AdvantisIntranet;it@advantisgroup.de",
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
  const data = await clockodoGet<{ absence: ClockodoAbsence }>(
    `/absences/${id}`
  );
  return data.absence;
}

export async function listAbsences(year: number): Promise<ClockodoAbsence[]> {
  const data = await clockodoGet<{ absences: ClockodoAbsence[] }>(
    `/absences?year=${year}`
  );
  return data.absences ?? [];
}

// Short-lived cache of coworker id → email so a burst of absence webhooks
// doesn't hammer the users endpoint.
let userCache: { map: Map<number, string>; expiresAt: number } | null = null;
const USER_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getUserEmail(
  usersId: number
): Promise<string | undefined> {
  if (!userCache || userCache.expiresAt < Date.now()) {
    const data = await clockodoGet<{ users: ClockodoUser[] }>(`/v2/users`);
    const map = new Map<number, string>();
    for (const u of data.users ?? []) map.set(u.id, u.email);
    userCache = { map, expiresAt: Date.now() + USER_CACHE_TTL_MS };
  }
  return userCache.map.get(usersId);
}
