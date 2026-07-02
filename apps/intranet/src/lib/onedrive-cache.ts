import { type DriveQuota, type OneDriveListing } from "@advantis/types";

/**
 * In-memory, per-tab cache for OneDrive listings/quota. Navigating between
 * folders (including back/forward) is extremely unlikely to coincide with a
 * drive change, so a short freshness window lets repeat visits skip the
 * network round trip entirely instead of re-fetching + re-rendering a
 * skeleton every time. Cleared on full page reload, which is fine since a
 * fresh load is the one case where re-fetching is actually desirable.
 */

const LISTING_TTL_MS = 45_000;
const QUOTA_TTL_MS = 2 * 60_000;

interface Entry<T> {
  data: T;
  timestamp: number;
}

const listingCache = new Map<string, Entry<OneDriveListing>>();
let quotaCache: Entry<DriveQuota> | null = null;

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

export function setCachedListing(
  requestedPath: string,
  data: OneDriveListing
): void {
  const entry: Entry<OneDriveListing> = { data, timestamp: Date.now() };
  listingCache.set(keyFor(requestedPath), entry);
  // The server may resolve the path differently (e.g. trailing slash) — key
  // the resolved path too so a subsequent visit still hits the cache.
  listingCache.set(keyFor(data.path), entry);
}

/** Drop every cached folder. Called after any write (upload/delete/rename/…). */
export function invalidateListingCache(): void {
  listingCache.clear();
}

export function getCachedQuota(): DriveQuota | undefined {
  return quotaCache?.data;
}

export function isQuotaFresh(): boolean {
  return Boolean(quotaCache && Date.now() - quotaCache.timestamp < QUOTA_TTL_MS);
}

export function setCachedQuota(data: DriveQuota): void {
  quotaCache = { data, timestamp: Date.now() };
}
