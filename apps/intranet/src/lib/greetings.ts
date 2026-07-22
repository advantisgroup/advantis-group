/**
 * The overview's greeting is randomized per load from a pool keyed by time of
 * day, with Friday/Monday/weekend pools taking priority over the plain time
 * bucket when they apply — see `Dashboard.json`'s `greetings` namespace for
 * the actual copy (kept there, not here, so it stays translatable).
 */

type TimeBucket =
  | "lateNight"
  | "earlyMorning"
  | "lateMorning"
  | "afternoon"
  | "evening"
  | "night";

type DayPool = "friday" | "monday" | "weekend";

type GreetingPool = TimeBucket | DayPool;

/** Variant count per pool — must match the arrays in Dashboard.json. */
const POOL_SIZE: Record<GreetingPool, number> = {
  lateNight: 4,
  earlyMorning: 4,
  lateMorning: 4,
  afternoon: 4,
  evening: 4,
  night: 4,
  friday: 3,
  monday: 3,
  weekend: 3,
};

function timeBucket(hour: number): TimeBucket {
  if (hour < 5) return "lateNight";
  if (hour < 9) return "earlyMorning";
  if (hour < 12) return "lateMorning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function greetingPool(date: Date): GreetingPool {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = date.getHours();
  if (day === 0 || day === 6) return "weekend";
  if (day === 5 && hour >= 12) return "friday";
  if (day === 1 && hour < 12) return "monday";
  return timeBucket(hour);
}

export interface Greeting {
  titleKey: string;
  subtitleKey: string;
}

/** Pick a random title/subtitle pair for `date`, as Dashboard.json keys. */
export function pickGreeting(date: Date): Greeting {
  const pool = greetingPool(date);
  const index = Math.floor(Math.random() * POOL_SIZE[pool]);
  return {
    titleKey: `greetings.${pool}.${index}.title`,
    subtitleKey: `greetings.${pool}.${index}.subtitle`,
  };
}
