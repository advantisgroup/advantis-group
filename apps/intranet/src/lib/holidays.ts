/**
 * German public holidays: the nationwide ones plus each state's own. Dates
 * are ISO `YYYY-MM-DD` strings, computed with UTC arithmetic so a day never
 * shifts across a DST change. Mariä Himmelfahrt in Bavaria and Fronleichnam
 * in Saxony and Thuringia only apply in some municipalities, so they're left
 * out there. For Bavaria the list is Nürnberg's, where the company sits:
 * 15.08. is a normal workday (Vahan, 09.10.2026).
 */

export type HolidayRegion =
  | "BW"
  | "BY"
  | "BE"
  | "BB"
  | "HB"
  | "HH"
  | "HE"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SL"
  | "SN"
  | "ST"
  | "SH"
  | "TH";

export const HOLIDAY_REGIONS: HolidayRegion[] = [
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
];

export interface Holiday {
  date: string;
  name: { de: string; en: string };
}

const DAY = 86_400_000;

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Easter Sunday (anonymous Gregorian algorithm), as UTC ms. */
function easter(year: number): number {
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
  return Date.UTC(year, month - 1, day);
}

/** Buß- und Bettag: the Wednesday before 23 November. */
function repentanceDay(year: number): number {
  const nov23 = Date.UTC(year, 10, 23);
  const weekday = new Date(nov23).getUTCDay(); // 0 = Sunday
  const back = (weekday - 3 + 7) % 7 || 7;
  return nov23 - back * DAY;
}

type Def = [ms: number, de: string, en: string];

const cache = new Map<string, Holiday[]>();

/** Public holidays of `year` for `region` (nationwide only when null). */
export function publicHolidays(year: number, region: HolidayRegion | null): Holiday[] {
  const key = `${year}:${region ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const e = easter(year);
  const fixed = (month: number, day: number) => Date.UTC(year, month - 1, day);
  const defs: Def[] = [
    [fixed(1, 1), "Neujahr", "New Year's Day"],
    [e - 2 * DAY, "Karfreitag", "Good Friday"],
    [e + DAY, "Ostermontag", "Easter Monday"],
    [fixed(5, 1), "Tag der Arbeit", "Labour Day"],
    [e + 39 * DAY, "Christi Himmelfahrt", "Ascension Day"],
    [e + 50 * DAY, "Pfingstmontag", "Whit Monday"],
    [fixed(10, 3), "Tag der Deutschen Einheit", "German Unity Day"],
    [fixed(12, 25), "1. Weihnachtstag", "Christmas Day"],
    [fixed(12, 26), "2. Weihnachtstag", "Boxing Day"],
  ];

  const epiphany: Def = [fixed(1, 6), "Heilige Drei Könige", "Epiphany"];
  const corpusChristi: Def = [e + 60 * DAY, "Fronleichnam", "Corpus Christi"];
  const assumption: Def = [fixed(8, 15), "Mariä Himmelfahrt", "Assumption Day"];
  const reformation: Def = [fixed(10, 31), "Reformationstag", "Reformation Day"];
  const allSaints: Def = [fixed(11, 1), "Allerheiligen", "All Saints' Day"];
  const womensDay: Def = [fixed(3, 8), "Internationaler Frauentag", "International Women's Day"];
  const childrensDay: Def = [fixed(9, 20), "Weltkindertag", "World Children's Day"];
  const easterSunday: Def = [e, "Ostersonntag", "Easter Sunday"];
  const whitSunday: Def = [e + 49 * DAY, "Pfingstsonntag", "Whit Sunday"];
  const repentance: Def = [repentanceDay(year), "Buß- und Bettag", "Day of Repentance"];

  const regional: Record<HolidayRegion, Def[]> = {
    BW: [epiphany, corpusChristi, allSaints],
    BY: [epiphany, corpusChristi, allSaints],
    BE: [womensDay],
    BB: [easterSunday, whitSunday, reformation],
    HB: [reformation],
    HH: [reformation],
    HE: [corpusChristi],
    MV: [womensDay, reformation],
    NI: [reformation],
    NW: [corpusChristi, allSaints],
    RP: [corpusChristi, allSaints],
    SL: [corpusChristi, assumption, allSaints],
    SN: [reformation, repentance],
    ST: [epiphany, reformation],
    SH: [reformation],
    TH: [childrensDay, reformation],
  };
  if (region) defs.push(...regional[region]);

  const list = defs
    .map(([ms, de, en]) => ({ date: iso(ms), name: { de, en } }))
    .sort((a, b) => a.date.localeCompare(b.date));
  cache.set(key, list);
  return list;
}

/** Holidays between two ISO dates, inclusive. */
export function holidaysBetween(
  start: string,
  end: string,
  region: HolidayRegion | null,
): Holiday[] {
  const out: Holiday[] = [];
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    for (const h of publicHolidays(y, region)) if (h.date >= start && h.date <= end) out.push(h);
  }
  return out;
}
