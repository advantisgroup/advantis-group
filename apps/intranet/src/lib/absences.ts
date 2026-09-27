/**
 * Working-day math for absence ranges. Dates are ISO `YYYY-MM-DD`, end
 * inclusive. Weekends don't count; a half-day knocks 0.5 off (bounded below at
 * 0.5 so a single half-day still shows up).
 */
export function workingDays(startDate: string, endDate: string, halfDay?: boolean): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  if (halfDay && days > 0) days -= 0.5;
  return days;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** `YYYY-MM-DD` of `date` in the viewer's own timezone — Clockodo's absence
 * dates are calendar days, and `toISOString()` would report yesterday for the
 * first hours after local midnight. */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoToday(): string {
  return localIsoDate(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before `iso`, for aligning a 7-day view to a proper
 * calendar week instead of a rolling window from an arbitrary start day. */
export function mondayOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
