import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Vercel's KV integration sets the KV_* names, a direct Upstash setup the UPSTASH_* ones.
// Without either (local dev, previews) limits are simply skipped.
const redis =
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    ? Redis.fromEnv()
    : null;

const limiter = (tokens: number, window: Duration, name: string) =>
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(tokens, window),
        prefix: `marketing:${name}`,
      })
    : null;

export const limits = {
  /** contact form sends, per IP */
  contactSend: limiter(5, "1 h", "contact-send"),
  /** copies of a contact form mailed to one address — caps using the form to spam someone */
  contactCopy: limiter(3, "1 h", "contact-copy"),
  /** notify-list codes mailed, per IP */
  notifyCode: limiter(5, "1 h", "notify-code"),
  /** notify-list code guesses, per IP */
  notifyVerify: limiter(20, "1 h", "notify-verify"),
};

/** True when `key` is still under `limit`. Fails open if Redis is unreachable. */
export async function allow(limit: Ratelimit | null, key: string | undefined) {
  if (!limit || !key) return true;
  try {
    return (await limit.limit(key.toLowerCase())).success;
  } catch (error) {
    console.error("[rate-limit] check failed, letting it through:", error);
    return true;
  }
}

/** Vercel puts the caller first in `x-forwarded-for`. */
export const clientIp = (headers: Record<string, string | undefined>) =>
  headers["x-forwarded-for"]?.split(",")[0]?.trim() || undefined;
