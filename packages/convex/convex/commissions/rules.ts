/**
 * Provisionsregeln der Chefin (Stand 16.11.2026). Pure functions only — the
 * query in `commissions/month.ts` gathers the figures, this file prices them.
 *
 * - Staffel je Closed Won im Monat: 1.–24. Abschluss im Gehalt drin,
 *   25.–30. je 10 €, 31.–40. je 20 €, ab dem 41. je 25 € (40 Abschlüsse =
 *   260 €, so von der Chefin vorgegeben).
 * - 50 € je Kalenderwoche (Mo–So) mit mindestens 15 Closed Won. Eine Woche
 *   zählt zu dem Monat, in dem ihr Donnerstag liegt (ISO-Regel), damit
 *   Wochen über den Monatswechsel nicht doppelt bezahlt werden.
 * - 50 €, wenn im Monat mehr als 60 Closed Won.
 * - 50 €, wenn die Monats-Hitrate mindestens 25 % beträgt.
 * - 100 € Gesund-Bonus nach 3 Monaten ohne Krankmeldung. Die Seite zeigt
 *   ihn als fällig, ausgezahlt wird er per Häkchen der Chefin; mit der
 *   Auszahlung beginnen die 3 Monate von vorn.
 */

export const TIERS: readonly { from: number; to: number | null; perDeal: number }[] = [
  { from: 1, to: 24, perDeal: 0 },
  { from: 25, to: 30, perDeal: 10 },
  { from: 31, to: 40, perDeal: 20 },
  { from: 41, to: null, perDeal: 25 },
];
export const WEEK_MIN_WON = 15;
export const WEEK_BONUS = 50;
export const MONTH_MIN_WON_EXCLUSIVE = 60;
export const MONTH_BONUS = 50;
export const HITRATE_MIN = 25;
export const HITRATE_BONUS = 50;
export const HEALTHY_MONTHS = 3;
export const HEALTHY_BONUS = 100;

export interface TierLine {
  from: number;
  to: number | null;
  perDeal: number;
  deals: number;
  amount: number;
}

/** Staffel: how many deals fall into each tier and what they pay. */
export function tierLines(won: number): TierLine[] {
  return TIERS.map((tier) => {
    const upper = tier.to ?? Number.POSITIVE_INFINITY;
    const deals = Math.max(0, Math.min(won, upper) - tier.from + 1);
    return { ...tier, deals, amount: deals * tier.perDeal };
  });
}

export function tierAmount(won: number): number {
  return tierLines(won).reduce((sum, line) => sum + line.amount, 0);
}

export function weekBonus(won: number): number {
  return won >= WEEK_MIN_WON ? WEEK_BONUS : 0;
}

export function monthBonus(won: number): number {
  return won > MONTH_MIN_WON_EXCLUSIVE ? MONTH_BONUS : 0;
}

export function hitrateBonus(hitrate: number | null): number {
  return hitrate !== null && hitrate >= HITRATE_MIN ? HITRATE_BONUS : 0;
}

/** `streak` = sick-free months in a row ending with the month *before*
 * the one in question, counted since the last payout. */
export function healthyDue(streak: number): boolean {
  return streak >= HEALTHY_MONTHS;
}

// ------------------------------------------------------------------- dates

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  return iso(new Date(parse(day).getTime() + n * 86_400_000));
}

export function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(d).slice(0, 7);
}

export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: iso(new Date(Date.UTC(y, m - 1, 1))), end: iso(new Date(Date.UTC(y, m, 0))) };
}

export interface Week {
  /** ISO calendar week number. */
  kw: number;
  monday: string;
  sunday: string;
}

/** The ISO weeks (Mo–So) whose Thursday lies in `ym`. */
export function weeksOfMonth(ym: string): Week[] {
  const { start, end } = monthRange(ym);
  const weeks: Week[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (parse(day).getUTCDay() !== 4) continue;
    weeks.push({ kw: isoWeek(day), monday: addDays(day, -3), sunday: addDays(day, 3) });
  }
  return weeks;
}

export function isoWeek(day: string): number {
  const d = parse(day);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86_400_000);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}

/** Whether a sick note [start, end] touches month `ym`. */
export function touchesMonth(startDate: string, endDate: string, ym: string): boolean {
  const { start, end } = monthRange(ym);
  return startDate <= end && endDate >= start;
}
