import type { Lang } from "./locales/types";

/**
 * Mirrors the integration poll cadence in `packages/convex/convex/crons.ts`
 * (`pollAll` — Genesys + Clockodo) so the dashboard can show "next sync in …"
 * without a round-trip. Pure client-side computation; keep in sync by hand if
 * the cron schedule changes (same pattern as the other convex/intranet state
 * duplication in this codebase — see `EMPLOYEE_STATES`).
 *
 * Daytime: every 2 minutes, 05:00–18:59 UTC, every day.
 * Off-hours: every 10 minutes, 19:00–04:59 UTC, every day.
 * The two windows are contiguous (no gap at the 05:00/19:00 boundaries), so
 * the wait for the next poll is always at most 10 minutes.
 */
export function nextPollAt(now: number): number {
  let t = Math.floor(now / 60_000) * 60_000 + 60_000; // next minute boundary after `now`
  for (let i = 0; i < 120; i++) {
    const d = new Date(t);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const daytime = h >= 5 && h <= 18 && m % 2 === 0;
    const offHours = (h >= 19 || h <= 4) && m % 10 === 0;
    if (daytime || offHours) return t;
    t += 60_000;
  }
  return t;
}

/** "3 Min. 12 Sek." / "3m 12s" — a live-ticking countdown, seconds included so
 * the badge visibly counts down rather than just jumping every minute. */
export function formatCountdown(ms: number, lang: Lang): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const u = lang === "de" ? { m: "Min.", s: "Sek." } : { m: "m", s: "s" };
  return m > 0 ? `${m} ${u.m} ${r} ${u.s}` : `${r} ${u.s}`;
}
