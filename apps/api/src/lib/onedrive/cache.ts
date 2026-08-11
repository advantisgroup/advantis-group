import { Redis } from "@upstash/redis";

/**
 * OneDrive listing cache. Backed by the same Upstash Redis used for rate
 * limiting, with the identical "no-op when unconfigured" fallback so local dev
 * just talks straight to Graph.
 *
 * Freshness without staleness: every cached folder carries a short safety TTL,
 * but the real invalidation signal is the Graph change-notification webhook
 * (see routes/webhooks/onedrive.ts) which calls `invalidateAll()` the moment
 * anything in the drive changes. The TTL only covers the gap before a webhook
 * lands (or when webhooks aren't configured).
 */

const TTL_SECONDS = 60;
const PREFIX = "od:list:";
const VERSION_KEY = "od:list:version";

let redis: Redis | null = null;
let triedRedis = false;

function getRedis(): Redis | null {
  if (triedRedis) return redis;
  triedRedis = true;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/**
 * A monotonic cache version. Bumping it on any change instantly invalidates
 * every cached folder without scanning keys (keys embed the version), which is
 * cheap and avoids a cross-folder fan-out on each webhook.
 */
async function currentVersion(client: Redis): Promise<number> {
  const v = await client.get<number>(VERSION_KEY);
  return typeof v === "number" ? v : 0;
}

function keyFor(version: number, folderId: string, scope: string): string {
  return `${PREFIX}${version}:${scope}:${folderId}`;
}

export async function getCachedListing<T>(folderId: string, scope: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const version = await currentVersion(client);
    return await client.get<T>(keyFor(version, folderId, scope));
  } catch (error) {
    console.error("[onedrive] cache read failed:", error);
    return null; // degrade to a live Graph read, never break browsing
  }
}

export async function setCachedListing<T>(
  folderId: string,
  scope: string,
  value: T,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const version = await currentVersion(client);
    await client.set(keyFor(version, folderId, scope), value, {
      ex: TTL_SECONDS,
    });
  } catch (error) {
    console.error("[onedrive] cache write failed:", error);
  }
}

/** Invalidate every cached listing (called from the change webhook / on write). */
export async function invalidateAll(): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.incr(VERSION_KEY);
  } catch (error) {
    console.error("[onedrive] cache invalidation failed:", error);
  }
}
