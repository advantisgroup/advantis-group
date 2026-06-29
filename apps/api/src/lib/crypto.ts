import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "./env.js";

/**
 * Application-layer encryption for Wiki Chat history.
 *
 * Chat titles and message blobs are encrypted here, in the API, before being
 * written to Convex — and decrypted here on read. The 32-byte key lives only in
 * the server environment (`WIKI_CHAT_ENC_KEY`, base64), never on the client and
 * never in the database, so a database leak does not expose chat content.
 *
 * Format: AES-256-GCM, output is base64url segments `iv.tag.ciphertext`.
 */
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = requireEnv("WIKI_CHAT_ENC_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "WIKI_CHAT_ENC_KEY must be 32 bytes, base64-encoded (e.g. `openssl rand -base64 32`)"
    );
  }
  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
