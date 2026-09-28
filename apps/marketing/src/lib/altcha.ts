import { CappedMap, createChallenge, randomInt } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { deriveHmacKeySecret, verify } from "altcha-lib/frameworks/shared";

import { redis } from "@/lib/rate-limit";

/**
 * Spam protection for the public forms: a proof-of-work puzzle (ALTCHA,
 * self-hosted) the visitor's browser solves in the background. No cookies,
 * no third party, nothing to click. Without `ALTCHA_HMAC_KEY` (local dev,
 * previews) it's off, like the rate limits: `/api/altcha` says so and every
 * check passes.
 */

const SECRET = process.env.ALTCHA_HMAC_KEY;
// ~1s of work in a browser; a bot sending thousands pays for each one
const COST = 2_000;
const CHALLENGE_TTL_MS = 20 * 60 * 1000;

export const altchaEnabled = Boolean(SECRET);

let keySecret: Promise<string> | undefined;
const keySignatureSecret = () => (keySecret ??= deriveHmacKeySecret(SECRET!));

// a solved puzzle is good for one submission; without Redis only per instance
const memory = new CappedMap<string, boolean>({ maxSize: 5_000 });
const usedPuzzles = {
  get: async (id: string) =>
    redis ? Boolean(await redis.get(`marketing:altcha:${id}`)) : memory.get(id),
  set: async (id: string, value: boolean) => {
    if (redis) await redis.set(`marketing:altcha:${id}`, value ? 1 : 0, { px: CHALLENGE_TTL_MS });
    else memory.set(id, value);
  },
};

export async function newChallenge() {
  return await createChallenge({
    algorithm: "PBKDF2/SHA-256",
    cost: COST,
    counter: randomInt(1_000, 3_000),
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: SECRET!,
    hmacKeySignatureSecret: await keySignatureSecret(),
  });
}

/** Whether a form's `altcha` payload is a solved, unexpired, unused puzzle of ours. */
export async function passedAltcha(payload: string | undefined) {
  if (!altchaEnabled) return true;
  if (!payload) return false;
  try {
    const result = await verify(
      payload,
      deriveKey,
      SECRET,
      await keySignatureSecret(),
      usedPuzzles,
    );
    if (result.error) console.warn("[altcha] refused:", result.error);
    return result.error === null;
  } catch (error) {
    // Redis down: let people through rather than lock every form, like the rate limits
    console.error("[altcha] check failed, letting it through:", error);
    return true;
  }
}
