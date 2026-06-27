/**
 * Crypto helpers for the ActivityTrack desktop-agent auth, using the Web Crypto
 * API available in Convex action / mutation contexts.
 *
 *   - `hashPassword` / `verifyPassword` — PBKDF2-SHA256 for the tray-app debug
 *     login. Encoded form: `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
 *   - `hashNonce` / `sha256hex` — SHA-256 hex digest, used for the device
 *     pairing nonce and the device bearer-token hash.
 *   - `randomToken` — a high-entropy opaque device token (hex).
 *   - `safeEqual` — constant-time-ish compare.
 */
const ITERATIONS = 100_000;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Constant-time-ish comparison over equal-length strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromB64(parts[2]!);
  const candidate = toB64(await pbkdf2(password, salt, iterations));
  return safeEqual(candidate, parts[3]!);
}

/** SHA-256 hex digest of an arbitrary string. */
export async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer
  );
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex digest of a device's one-time pairing nonce. */
export const hashNonce = sha256hex;

/** A high-entropy opaque token (32 random bytes, hex-encoded). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
