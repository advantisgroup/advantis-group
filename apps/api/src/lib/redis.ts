import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
let triedRedis = false;

/** The one Upstash client for caches and rate limiting. Null when it isn't
 * configured (local dev) — every caller then just skips caching/limiting. */
export function getRedis(): Redis | null {
  if (triedRedis) return redis;
  triedRedis = true;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}
