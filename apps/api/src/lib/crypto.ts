import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "./env.js";

/**
 * Application-layer encryption for per-feature sensitive text (Wiki Chat
 * history, Sales Coach EV call transcripts, ...).
 *
 * Content is encrypted here, in the API, before being written to Convex —
 * and decrypted here on read. Each feature holds its own 32-byte key in the
 * server environment (base64), never on the client and never in the
 * database, so a database leak does not expose plaintext content, and one
 * feature's key can be rotated without touching another's.
 *
 * Format: AES-256-GCM, output is base64url segments `iv.tag.ciphertext`.
 */
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

const cachedKeys = new Map<string, Buffer>();

function getKey(envVar: string): Buffer {
  const cached = cachedKeys.get(envVar);
  if (cached) return cached;
  const raw = requireEnv(envVar);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${envVar} must be 32 bytes, base64-encoded (e.g. \`openssl rand -base64 32\`)`);
  }
  cachedKeys.set(envVar, key);
  return key;
}

export function encrypt(plaintext: string, envVar = "WIKI_CHAT_ENC_KEY"): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(envVar), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string, envVar = "WIKI_CHAT_ENC_KEY"): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv(ALGO, getKey(envVar), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
