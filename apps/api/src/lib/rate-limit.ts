import { Ratelimit } from "@upstash/ratelimit";
import { Errors } from "./errors.js";
import { getRedis } from "./redis.js";

const limiters = new Map<string, Ratelimit>();

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
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
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
