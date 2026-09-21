import type { Lang } from "./locales/types";

// Mirrors the integration poll cadence in packages/convex/convex/crons.ts
// (pollAll — Genesys + Clockodo) so the dashboard can show "next sync in …"
// without a round-trip. Pure client-side computation; keep in sync by hand if
// the cron schedule changes (same pattern as the other convex/intranet state
// duplication in this codebase — see EMPLOYEE_STATES).
//
// Hourly on the hour, 07:00-20:00 UTC, Monday-Friday only (cron:
// "0 7-20 * * 1-5"). No polls on weekends, so the wait for the next poll can
// be as long as Friday 20:00 -> Monday 07:00.

export function nextPollAt(now: number): number {
  let t = Math.floor(now / 60_000) * 60_000 + 60_000; // next minute boundary after `now`
  for (let i = 0; i < 7 * 24 * 60; i++) {
    const d = new Date(t);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekday = day >= 1 && day <= 5;
    if (isWeekday && h >= 7 && h <= 20 && m === 0) return t;
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
