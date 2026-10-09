import { addDays } from "./berlin";

/**
 * Days off in Nürnberg: Bavaria's public holidays plus the company's own
 * rules. Mariä Himmelfahrt (15.08.) is only a public holiday in Bavarian
 * municipalities with a Catholic majority — Nürnberg isn't one — and the
 * company doesn't give the day off either (Vahan, 09.10.2026), so it isn't
 * listed. Buß- und Bettag is school-free but not a public holiday in Bavaria.
 */

export const HOLIDAY_REGION = "BY-NUE";

export interface HolidaySeed {
  date: string;
  name: string;
  /** 1 = full day off, 0.5 = half day. */
  fraction: number;
}

/** Easter Sunday (anonymous Gregorian algorithm) as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function bavarianHolidays(year: number): HolidaySeed[] {
  const easter = easterSunday(year);
  const fixed = (monthDay: string) => `${year}-${monthDay}`;
  const list: HolidaySeed[] = [
    { date: fixed("01-01"), name: "Neujahr", fraction: 1 },
    { date: fixed("01-06"), name: "Heilige Drei Könige", fraction: 1 },
    { date: addDays(easter, -2), name: "Karfreitag", fraction: 1 },
    { date: addDays(easter, 1), name: "Ostermontag", fraction: 1 },
    { date: fixed("05-01"), name: "Tag der Arbeit", fraction: 1 },
    { date: addDays(easter, 39), name: "Christi Himmelfahrt", fraction: 1 },
    { date: addDays(easter, 50), name: "Pfingstmontag", fraction: 1 },
    { date: addDays(easter, 60), name: "Fronleichnam", fraction: 1 },
    { date: fixed("10-03"), name: "Tag der Deutschen Einheit", fraction: 1 },
    { date: fixed("11-01"), name: "Allerheiligen", fraction: 1 },
    { date: fixed("12-24"), name: "Heiligabend (halber Tag)", fraction: 0.5 },
    { date: fixed("12-25"), name: "1. Weihnachtstag", fraction: 1 },
    { date: fixed("12-26"), name: "2. Weihnachtstag", fraction: 1 },
    { date: fixed("12-31"), name: "Silvester (halber Tag)", fraction: 0.5 },
  ];
  return list.sort((x, y) => x.date.localeCompare(y.date));
}
