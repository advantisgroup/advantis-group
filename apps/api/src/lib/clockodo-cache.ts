import { type Redis } from "@upstash/redis";

import { getRedis } from "./redis.js";

/**
 * Absence-list cache, same Upstash Redis + version-invalidation shape as
 * onedrive/cache.ts. Absences change rarely (a handful of writes a day at
 * most across the whole company) but are read on nearly every /clockodo
 * request (/me, /calendar, /pending-count, /pending all call
 * listCurrentAbsences), so caching them cuts a lot of redundant paginated
 * Clockodo fetches. Every absence-mutating call bumps the version key,
 * which invalidates every cached entry for everyone instantly instead of
 * waiting out the TTL. No-op (always falls through to a live Clockodo
 * fetch) when Upstash isn't configured, same as onedrive's cache.
 *
 * Deliberately NOT used for clock/time-entry reads (listEntries,
 * getRunningClock) — those change second-to-second and must always read
 * straight through.
 */

const TTL_SECONDS = 120;
const PREFIX = "co:absences:";
const VERSION_KEY = "co:absences:version";

async function currentVersion(client: Redis): Promise<number> {
  const v = await client.get<number>(VERSION_KEY);
  return typeof v === "number" ? v : 0;
}

function keyFor(version: number, years: number[]): string {
  return `${PREFIX}${version}:${years.join(",")}`;
}

export async function getCachedAbsences<T>(years: number[]): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const version = await currentVersion(client);
    return await client.get<T>(keyFor(version, years));
  } catch (error) {
    console.error("[clockodo] cache read failed:", error);
    return null; // degrade to a live Clockodo read, never break the page
  }
}

export async function setCachedAbsences<T>(years: number[], value: T): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const version = await currentVersion(client);
    await client.set(keyFor(version, years), value, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[clockodo] cache write failed:", error);
  }
}

/** Invalidate every cached absence list (called after create/update/status
 * writes — anything that could change what a subsequent read sees). */
export async function invalidateAbsencesCache(): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.incr(VERSION_KEY);
  } catch (error) {
    console.error("[clockodo] cache invalidation failed:", error);
  }
}
