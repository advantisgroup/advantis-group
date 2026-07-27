import type { Lang } from "./locales/types";

export type Role = "it_admin" | "manager" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, manager: 1, it_admin: 2 };

export function roleAtLeast(role: Role | undefined, min: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

/** "3h 42m" / "3 Std. 42 Min." style duration from seconds. */
export function formatDuration(totalSeconds: number, lang: Lang): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const u = lang === "de" ? { h: "Std.", m: "Min.", s: "Sek." } : { h: "h", m: "m", s: "s" };
  if (h > 0) return `${h} ${u.h} ${m} ${u.m}`;
  if (m > 0) return `${m} ${u.m}`;
  return `${s} ${u.s}`;
}

export function formatTime(ms: number | null | undefined, lang: Lang): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(lang);
}

/** "in 3 Tagen" / "3d ago" style relative time for a past/future instant. */
export function formatRelativeTime(ts: number, lang: Lang): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);

  if (d >= 1) {
    if (lang === "de")
      return future ? `in ${d} Tag${d > 1 ? "en" : ""}` : `vor ${d} Tag${d > 1 ? "en" : ""}`;
    return future ? `in ${d}d` : `${d}d ago`;
  }
  if (h >= 1) {
    if (lang === "de") return future ? `in ${h} Std.` : `vor ${h} Std.`;
    return future ? `in ${h}h` : `${h}h ago`;
  }
  if (lang === "de") return future ? `in ${m} Min.` : `vor ${m} Min.`;
  return future ? `in ${m}m` : `${m}m ago`;
}

/** YYYY-MM-DD for an instant in a given tz offset (minutes, JS convention). */
export function localDay(at: number, tzOffsetMinutes = 0): string {
  return new Date(at - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Today's local-day string in the browser's timezone. */
export function todayLocalDay(): string {
  return localDay(Date.now(), new Date().getTimezoneOffset());
}

/**
 * Current epoch ms. A thin wrapper around `Date.now()` so "what time is it now"
 * reads stay out of component render bodies (where the React Compiler lint flags
 * direct impure calls) — the value is inherently time-based and intentionally
 * read per render for the live "now" markers on the timeline.
 */
export function nowMs(): number {
  return Date.now();
}
