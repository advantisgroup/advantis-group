/**
 * Aggregation helpers for the ActivityTrack reports, ported from
 * ActivityTrack's `lib/activity.ts` and trimmed to what the intranet pages use.
 */

export interface DeviceDaily {
  day: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface DeviceReportRow {
  deviceId: string;
  hostname: string;
  personName: string | null;
  daily: DeviceDaily[];
}

/** YYYY-MM-DD list spanning [start, end] inclusive. */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Per-day totals (hours) across every device, for the trend chart. */
export function aggregateDailyTotals(
  rows: DeviceReportRow[],
  days: string[]
): { day: string; activeHours: number; idleHours: number }[] {
  const byDay = new Map<string, { active: number; idle: number }>();
  for (const day of days) byDay.set(day, { active: 0, idle: 0 });
  for (const row of rows) {
    for (const d of row.daily) {
      const acc = byDay.get(d.day);
      if (!acc) continue;
      acc.active += d.activeSeconds;
      acc.idle += d.idleSeconds;
    }
  }
  return days.map(day => {
    const acc = byDay.get(day)!;
    return {
      day,
      activeHours: +(acc.active / 3600).toFixed(2),
      idleHours: +(acc.idle / 3600).toFixed(2),
    };
  });
}

/** Per-device totals over the whole window, sorted by active time desc. */
export function aggregatePerDevice(rows: DeviceReportRow[]): {
  deviceId: string;
  hostname: string;
  personName: string | null;
  activeSeconds: number;
  idleSeconds: number;
}[] {
  return rows
    .map(row => ({
      deviceId: row.deviceId,
      hostname: row.hostname,
      personName: row.personName,
      activeSeconds: row.daily.reduce((s, d) => s + d.activeSeconds, 0),
      idleSeconds: row.daily.reduce((s, d) => s + d.idleSeconds, 0),
    }))
    .sort((a, b) => b.activeSeconds - a.activeSeconds);
}
