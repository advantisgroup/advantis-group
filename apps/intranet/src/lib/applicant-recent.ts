const KEY = "advantis:applicants:recentlyViewed:v1";
const MAX_ENTRIES = 8;

export interface RecentApplicant {
  id: string;
  name: string;
  viewedAt: number;
}

/** Browser-local (no Convex table) history of recently opened applicants,
 * newest first — mirrors `tour-storage.ts`'s try/catch localStorage convention. */
export function getRecentlyViewed(): RecentApplicant[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RecentApplicant[]) : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(id: string, name: string): void {
  try {
    const rest = getRecentlyViewed().filter((r) => r.id !== id);
    const next = [{ id, name, viewedAt: Date.now() }, ...rest].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private browsing etc.) — fail silently.
  }
}
