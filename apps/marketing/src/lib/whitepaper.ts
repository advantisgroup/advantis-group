import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The document lives outside `public/` on purpose — the request form is what
 * gates it, and a copy under `public/` would be a URL anyone could pass
 * around. `next.config.ts` traces `private/` into the server bundle so the
 * file is still readable at runtime.
 */
const WHITEPAPER_PATH = path.join(process.cwd(), "private", "whitepaper.pdf");

/** Attachment name the recipient sees — not the on-disk name. */
export const WHITEPAPER_FILENAME = "Advantis-Group-Whitepaper-KI-im-Vertrieb.pdf";

/**
 * Bump when the consent wording on the request form changes. Stored on every
 * lead so an opt-in can be traced back to the exact text that was agreed to.
 */
export const WHITEPAPER_CONSENT_VERSION = "2026-09-v1";

/** How long a confirmation link stays redeemable. */
export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Whether the document has been added to the repo yet. The page renders a
 * "coming soon" notice instead of the form while this is false, so the form
 * can never take an address it has nothing to send to.
 */
export function whitepaperExists(): boolean {
  return existsSync(WHITEPAPER_PATH);
}

export async function readWhitepaper(): Promise<Buffer> {
  return readFile(WHITEPAPER_PATH);
}
