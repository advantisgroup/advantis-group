import { type DriveQuota, type OneDriveListing } from "@advantis/types";

/**
 * Per-tab cache for OneDrive listings/quota/configured status. Backed by an
 * in-memory `Map` for synchronous reads (render-blocking use can't await
 * storage), mirrored into `sessionStorage` so a reload doesn't lose a warm
 * cache and re-run the status → list/quota waterfall from scratch. Cleared
 * on tab close (sessionStorage) or explicitly after any write, which is fine
 * since a write already means the cached data is stale.
 */

const LISTING_TTL_MS = 120_000;
const QUOTA_TTL_MS = 5 * 60_000;

const CONFIGURED_KEY = "onedrive:configured:v1";
const LISTING_STORAGE_KEY = "onedrive:listings:v1";
const QUOTA_STORAGE_KEY = "onedrive:quota:v1";

interface Entry<T> {
  data: T;
  timestamp: number;
}

// This module is imported from a "use client" component, but its top-level
// code still runs once during server-side rendering — guard every
// sessionStorage touch so that doesn't throw in Node.
const hasSessionStorage = typeof window !== "undefined";

function readSessionStorage<T>(key: string): T | undefined {
  if (!hasSessionStorage) return undefined;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSessionStorage(key: string, value: unknown): void {
  if (!hasSessionStorage) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing quota, etc.) — in-memory cache
    // still works for the rest of this session.
  }
}

const listingCache = new Map<string, Entry<OneDriveListing>>(
  Object.entries(
    readSessionStorage<Record<string, Entry<OneDriveListing>>>(LISTING_STORAGE_KEY) ?? {},
  ),
);
let quotaCache: Entry<DriveQuota> | null =
  readSessionStorage<Entry<DriveQuota>>(QUOTA_STORAGE_KEY) ?? null;

function persistListings(): void {
  writeSessionStorage(LISTING_STORAGE_KEY, Object.fromEntries(listingCache));
}

function keyFor(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function getCachedListing(path: string): OneDriveListing | undefined {
  return listingCache.get(keyFor(path))?.data;
}

export function isListingFresh(path: string): boolean {
  const entry = listingCache.get(keyFor(path));
  return Boolean(entry && Date.now() - entry.timestamp < LISTING_TTL_MS);
}

export function setCachedListing(requestedPath: string, data: OneDriveListing): void {
  const entry: Entry<OneDriveListing> = { data, timestamp: Date.now() };
  listingCache.set(keyFor(requestedPath), entry);
  // The server may resolve the path differently (e.g. trailing slash) — key
  // the resolved path too so a subsequent visit still hits the cache.
  listingCache.set(keyFor(data.path), entry);
  persistListings();
}

/** Drop every cached folder. Called after any write (upload/delete/rename/…). */
export function invalidateListingCache(): void {
  listingCache.clear();
  persistListings();
}

export function getCachedQuota(): DriveQuota | undefined {
  return quotaCache?.data;
}

export function isQuotaFresh(): boolean {
  return Boolean(quotaCache && Date.now() - quotaCache.timestamp < QUOTA_TTL_MS);
}

export function setCachedQuota(data: DriveQuota): void {
  quotaCache = { data, timestamp: Date.now() };
  writeSessionStorage(QUOTA_STORAGE_KEY, quotaCache);
}

/**
 * `configured` (whether OneDrive is set up for this tenant) essentially never
 * changes mid-session — cache it so subsequent mounts can fire list/quota
 * optimistically instead of waiting on a fresh status() round trip first.
 */
export function getCachedConfigured(): boolean | undefined {
  try {
    const v = sessionStorage.getItem(CONFIGURED_KEY);
    return v === null ? undefined : v === "1";
  } catch {
    return undefined;
  }
}

export function setCachedConfigured(configured: boolean): void {
  try {
    sessionStorage.setItem(CONFIGURED_KEY, configured ? "1" : "0");
  } catch {
    // Storage unavailable — fine, just means no cross-mount shortcut this session.
  }
}
