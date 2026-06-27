import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { Errors } from "./errors.js";

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null; // rate limiting disabled when unconfigured
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Sliding-window rate limit. No-op when Upstash isn't configured (local dev).
 * @param name   limiter bucket name (also the Redis prefix)
 * @param key    per-caller key (e.g. clerk user id or IP)
 * @param limit  requests allowed per window
 * @param window e.g. "1 m", "10 s"
 */
export async function rateLimit(
  name: string,
  key: string,
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1]
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(name, limiter);
  }
  const { success } = await limiter.limit(key);
  if (!success) throw Errors.rateLimited();
}
