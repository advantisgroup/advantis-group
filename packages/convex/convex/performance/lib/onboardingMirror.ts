/**
 * "Kunden-Spiegel" of the Onboarding dashboard: where the customers won in a
 * month stand today, which customers a month's actions were for, where the
 * open cases hang, why cases dropped out, and how fast customers are
 * activated after Close Won (calendar days). Pure functions only.
 */
import { type CockpitEvent, contactOf } from "./onboardingKpis";

export interface MirrorCase {
  id: string;
  /** Close Won date from the report, "YYYY-MM-DD". */
  closeDate: string | null;
  status: string;
  closed: boolean;
  archived: boolean;
  milestones: ReadonlySet<string>;
  contactAttempts: number;
  itOpen: boolean;
  /** When the case was closed (closed states), epoch ms. */
  closedAt: number | null;
  /** Milestone timestamps on the case, epoch ms. */
  cardsAt: number | null;
  fuelAt: number | null;
  twoMonthAt: number | null;
}

/** A log entry with its exact time. */
export interface TimedEvent extends CockpitEvent {
  at: number;
}

const DROP_OUT = ["winback", "refused", "unreachable", "fakeData", "tollOnly"] as const;

export function ymOf(date: string | null | undefined): string | null {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
}

function prevYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Funnel of one month's customers: how far each got so far. */
export function cohortFunnel(cases: readonly MirrorCase[], log: Map<string, TimedEvent[]>) {
  const out = {
    total: 0,
    contacted: 0,
    reached: 0,
    cards: 0,
    fuel: 0,
    twoMonth: 0,
    done: 0,
    dropped: 0,
  };
  for (const c of cases) {
    out.total++;
    const kinds = new Set((log.get(c.id) ?? []).map(contactOf));
    const cards = c.milestones.has("cards");
    const reached = kinds.has("reached") || cards;
    if (reached || c.contactAttempts > 0 || kinds.has("not_reached") || kinds.has("email")) {
      out.contacted++;
    }
    if (reached) out.reached++;
    if (cards) out.cards++;
    if (c.milestones.has("fuel")) out.fuel++;
    if (c.milestones.has("twoMonth")) out.twoMonth++;
    if (c.status === "done") out.done++;
    else if ((DROP_OUT as readonly string[]).includes(c.status)) out.dropped++;
  }
  return out;
}

export const ACTION_ROWS = ["attempts", "reached", "cards", "fuel", "twoMonth", "closed"] as const;
export type ActionRow = (typeof ACTION_ROWS)[number];
export type CustomerBucket = "same" | "prev" | "older" | "unknown";

/** A month's actions by the month the customer was won in. */
export function actionsByCustomerMonth(
  events: readonly CockpitEvent[],
  closeYmOf: (caseId: string) => string | null,
  ym: string,
): Record<ActionRow, Record<CustomerBucket, number>> {
  const out = Object.fromEntries(
    ACTION_ROWS.map((r) => [r, { same: 0, prev: 0, older: 0, unknown: 0 }]),
  ) as Record<ActionRow, Record<CustomerBucket, number>>;
  const prev = prevYm(ym);
  for (const e of events) {
    let row: ActionRow | null = null;
    const contact = contactOf(e);
    if (contact) row = contact === "reached" ? "reached" : "attempts";
    else if (e.kind === "milestone" && e.toValue !== "0") {
      row =
        e.fromValue === "cards"
          ? "cards"
          : e.fromValue === "fuel"
            ? "fuel"
            : e.fromValue === "twoMonth"
              ? "twoMonth"
              : null;
    } else if (e.kind === "status" && e.toValue && CLOSED_NAMES.has(e.toValue)) row = "closed";
    if (!row) continue;
    const cy = closeYmOf(e.caseId);
    const bucket: CustomerBucket =
      !cy || cy > ym ? "unknown" : cy === ym ? "same" : cy === prev ? "prev" : "older";
    out[row][bucket]++;
    // Reached is also an attempt.
    if (row === "reached") out.attempts[bucket]++;
  }
  return out;
}

const CLOSED_NAMES = new Set([
  "Abgeschlossen",
  "done",
  "Winback",
  "winback",
  "Nicht gesprächsbereit",
  "refused",
  "Nicht erreichbar",
  "unreachable",
  "Fake Data",
  "fakeData",
  "Nur Mautboxen",
  "tollOnly",
]);

/** Where the open cases hang. */
export function openStages(cases: readonly MirrorCase[]) {
  const out = { notContacted: 0, noCard: 0, cardNoFuel: 0, fuelNoCheck: 0, itOpen: 0, total: 0 };
  for (const c of cases) {
    if (c.closed || c.archived) continue;
    out.total++;
    if (c.itOpen) out.itOpen++;
    if (c.milestones.has("fuel")) out.fuelNoCheck++;
    else if (c.milestones.has("cards")) out.cardNoFuel++;
    else if (c.contactAttempts > 0) out.noCard++;
    else out.notContacted++;
  }
  return out;
}

/** Closed cases by state. */
export function closedReasons(cases: readonly MirrorCase[]) {
  const out = { done: 0, winback: 0, refused: 0, unreachable: 0, fakeData: 0, tollOnly: 0 };
  for (const c of cases) {
    if (c.status in out) out[c.status as keyof typeof out]++;
  }
  return out;
}

export const TEMPO_STEPS = ["contact", "reached", "cards", "fuel", "twoMonth"] as const;
export type TempoStep = (typeof TEMPO_STEPS)[number];

const DAY = 86_400_000;

function daysBetween(closeDate: string, at: number, berlinDate: (at: number) => string): number {
  const a = Date.parse(`${closeDate}T00:00:00Z`);
  const b = Date.parse(`${berlinDate(at)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

export const CONTACT_BUCKETS = ["0", "1-2", "3-5", "6-10", "11+"] as const;

/**
 * Calendar days from Close Won to the first contact, first reach and each
 * milestone — median per step over the given customers, plus how fast the
 * first contact came.
 */
export function tempo(
  cases: readonly MirrorCase[],
  log: Map<string, TimedEvent[]>,
  berlinDate: (at: number) => string,
) {
  const days: Record<TempoStep, number[]> = {
    contact: [],
    reached: [],
    cards: [],
    fuel: [],
    twoMonth: [],
  };
  for (const c of cases) {
    if (!c.closeDate) continue;
    const events = (log.get(c.id) ?? []).slice().sort((a, b) => a.at - b.at);
    const first = (pred: (e: TimedEvent) => boolean) => events.find(pred)?.at ?? null;
    const contact = first((e) => contactOf(e) !== null);
    const reached = first((e) => contactOf(e) === "reached");
    const tick = (m: string, own: number | null) => {
      const logged = first((e) => e.kind === "milestone" && e.fromValue === m && e.toValue !== "0");
      if (own === null) return logged;
      return logged === null ? own : Math.min(own, logged);
    };
    const at: Record<TempoStep, number | null> = {
      contact,
      reached,
      cards: c.milestones.has("cards") ? tick("cards", c.cardsAt) : null,
      fuel: c.milestones.has("fuel") ? tick("fuel", c.fuelAt) : null,
      twoMonth: c.milestones.has("twoMonth") ? tick("twoMonth", c.twoMonthAt) : null,
    };
    for (const s of TEMPO_STEPS) {
      const t = at[s];
      if (t !== null) days[s].push(daysBetween(c.closeDate, t, berlinDate));
    }
  }
  const buckets = Object.fromEntries(CONTACT_BUCKETS.map((b) => [b, 0])) as Record<
    (typeof CONTACT_BUCKETS)[number],
    number
  >;
  for (const d of days.contact) {
    if (d === 0) buckets["0"]++;
    else if (d <= 2) buckets["1-2"]++;
    else if (d <= 5) buckets["3-5"]++;
    else if (d <= 10) buckets["6-10"]++;
    else buckets["11+"]++;
  }
  const within2 = days.contact.filter((d) => d <= 2).length;
  return {
    customers: cases.length,
    steps: Object.fromEntries(
      TEMPO_STEPS.map((s) => [s, { median: median(days[s]), n: days[s].length }]),
    ) as Record<TempoStep, { median: number | null; n: number }>,
    contactBuckets: buckets,
    within2Share: days.contact.length ? Math.round((within2 / days.contact.length) * 100) : null,
  };
}
