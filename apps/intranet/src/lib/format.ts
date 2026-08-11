/**
 * Display name for a user's role badge: their `roleLabel` override if set
 * (e.g. "Geschäftsführerin" for an admin), otherwise the translated role
 * name. Cosmetic only — permission checks always use `role`, never this.
 */
export function roleLabel(
  user: { role: string; roleLabel?: string | null },
  tRoles: (role: string) => string,
): string {
  return user.roleLabel?.trim() || tRoles(user.role);
}

/** Two-letter initials for an avatar fallback. Upstream data (e.g. Clockodo's
 * API) has been observed returning non-string shapes for name/email fields
 * on some records — guard so a malformed value degrades to "?" instead of
 * crashing `.split()`. */
export function initials(name: string | null | undefined, email?: string): string {
  const source = (typeof name === "string" && name.trim()) || email || "?";
  if (typeof source !== "string") return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Locale-aware short date from an ISO date string (YYYY-MM-DD). */
export function formatIsoDate(iso: string, locale: string): string {
  if (typeof iso !== "string") return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Locale-aware date+time from epoch ms. */
export function formatDateTime(ms: number, locale: string): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(ms: number, locale: Intl.LocalesArgument): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact relative time (e.g. "3m", "2h", "5d"). */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
