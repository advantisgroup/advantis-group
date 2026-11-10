/**
 * Onboarding KPIs of the Performance dashboard, counted from the
 * Onboarding-Cockpit's log (`onboardingContacts`): who reached whom, ticked
 * which milestone and closed which case, per person and period. Plus the
 * Genesys call figures the dashboard already has. Pure functions only.
 */
import { type Snapshot } from "./kpi";

/** The cockpit's figures, in display order. */
export const COCKPIT_KEYS = [
  "attempts",
  "reached",
  "notReached",
  "emails",
  "reachRate",
  "casesWorked",
  "cards",
  "fuel",
  "twoMonth",
  "done",
  "winback",
  "refused",
  "unreachable",
  "fakeData",
  "tollOnly",
] as const;
export type CockpitKey = (typeof COCKPIT_KEYS)[number];

/** Call figures from the Genesys reports, in display order. */
export const CALL_KEYS = [
  "calls",
  "callsPerDay",
  "callsAnswered",
  "callsOutbound",
  "talkTotalSec",
  "talkAvgSec",
  "loginSec",
] as const;
export type CallKey = (typeof CALL_KEYS)[number];

export type OnboardingKey = CockpitKey | CallKey;
export type OnboardingValues = Record<OnboardingKey, number | null>;

/** The log entries the counts need. */
export interface CockpitEvent {
  caseId: string;
  kind: string;
  fromValue?: string;
  toValue?: string;
  /** "outcome" entries: kind of the situation's top entry ("reached",
   * "notReached", "case" … or "other" = no contact). */
  outcomeKind?: string;
  byUserId: string;
  /** Berlin day of the entry, "YYYY-MM-DD". */
  day: string;
}

/** Closed states as the log names them (`performance/onboarding.ts`
 * `STATUS_NAMES`) — the log stores the display name, older entries the id. */
const CLOSED_BY_NAME: Record<string, CockpitKey> = {
  Abgeschlossen: "done",
  done: "done",
  Winback: "winback",
  winback: "winback",
  "Nicht gesprächsbereit": "refused",
  refused: "refused",
  "Nicht erreichbar": "unreachable",
  unreachable: "unreachable",
  "Fake Data": "fakeData",
  fakeData: "fakeData",
  "Nur Mautboxen": "tollOnly",
  tollOnly: "tollOnly",
};

const MILESTONE_KEY: Record<string, CockpitKey> = {
  cards: "cards",
  fuel: "fuel",
  twoMonth: "twoMonth",
};

function emptyCockpit(): Record<CockpitKey, number> {
  return Object.fromEntries(COCKPIT_KEYS.map((k) => [k, 0])) as Record<CockpitKey, number>;
}

/** What contact an entry is, if any. The cockpit logs a contact as its
 * situation ("outcome": channel in `fromValue`); the first version logged
 * reached / not reached / e-mail. */
export function contactOf(e: CockpitEvent): "reached" | "not_reached" | "email" | null {
  if (e.kind === "outcome") {
    if (!e.outcomeKind || e.outcomeKind === "other") return null;
    if (e.fromValue === "email") return "email";
    return e.outcomeKind === "notReached" ? "not_reached" : "reached";
  }
  return e.kind === "reached" || e.kind === "not_reached" || e.kind === "email" ? e.kind : null;
}

export interface ContactDay {
  date: string;
  reached: number;
  notReached: number;
  emails: number;
}

/** Contacts per day `from`–`to` of the given users (every day listed). */
export function contactDays(
  events: readonly CockpitEvent[],
  from: string,
  to: string,
  users: ReadonlySet<string>,
): ContactDay[] {
  const byDay = new Map<string, ContactDay>();
  for (let d = from; d <= to; d = nextDay(d)) {
    byDay.set(d, { date: d, reached: 0, notReached: 0, emails: 0 });
  }
  for (const e of events) {
    const day = byDay.get(e.day);
    if (!day || !users.has(e.byUserId)) continue;
    const c = contactOf(e);
    if (c === "reached") day.reached++;
    else if (c === "not_reached") day.notReached++;
    else if (c === "email") day.emails++;
  }
  return [...byDay.values()];
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cockpit counts per user for the days `from`–`to` (inclusive):
 * - attempts = reached + not reached + e-mails; reachRate = reached ÷
 *   (reached + not reached), in %
 * - casesWorked = distinct cases with an attempt
 * - milestones ticked (an untick in the period takes one off)
 * - cases moved into a closed state
 */
export function cockpitCounts(
  events: readonly CockpitEvent[],
  from: string,
  to: string,
): Map<string, Record<CockpitKey, number>> {
  const out = new Map<string, Record<CockpitKey, number>>();
  const worked = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.day < from || e.day > to) continue;
    const c = out.get(e.byUserId) ?? emptyCockpit();
    out.set(e.byUserId, c);
    const contact = contactOf(e);
    if (contact) {
      c.attempts++;
      if (contact === "reached") c.reached++;
      else if (contact === "not_reached") c.notReached++;
      else c.emails++;
      const set = worked.get(e.byUserId) ?? new Set<string>();
      set.add(e.caseId);
      worked.set(e.byUserId, set);
    } else if (e.kind === "milestone" && e.fromValue && MILESTONE_KEY[e.fromValue]) {
      c[MILESTONE_KEY[e.fromValue]] += e.toValue === "0" ? -1 : 1;
    } else if (e.kind === "status" && e.toValue && CLOSED_BY_NAME[e.toValue]) {
      c[CLOSED_BY_NAME[e.toValue]]++;
    }
  }
  for (const [user, c] of out) {
    c.casesWorked = worked.get(user)?.size ?? 0;
    for (const k of ["cards", "fuel", "twoMonth"] as const) c[k] = Math.max(0, c[k]);
    c.reachRate = 0; // filled by `withRates`
  }
  return out;
}

/** Sums several people's cockpit counts (the team row). */
export function sumCockpit(
  list: readonly Record<CockpitKey, number>[],
): Record<CockpitKey, number> {
  const total = emptyCockpit();
  for (const c of list) for (const k of COCKPIT_KEYS) total[k] += c[k];
  return total;
}

/** One row of values: cockpit counts (or none) plus the call figures of a
 * Genesys snapshot. `hasCockpit` false = no cockpit data at all for the
 * period (e.g. a month before the cockpit) → nulls, not zeros. */
export function onboardingValues(
  cockpit: Record<CockpitKey, number> | undefined,
  hasCockpit: boolean,
  calls: Snapshot | undefined,
): OnboardingValues {
  const c = cockpit ?? emptyCockpit();
  const values = {} as OnboardingValues;
  for (const k of COCKPIT_KEYS) values[k] = hasCockpit ? c[k] : null;
  const dialled = c.reached + c.notReached;
  values.reachRate =
    hasCockpit && dialled > 0 ? Math.round((c.reached / dialled) * 1000) / 10 : null;

  const n = (v: number | undefined) => (v === undefined ? null : v);
  values.calls = n(calls?.callsToday);
  values.callsAnswered = n(calls?.callsAnswered);
  values.callsOutbound = n(calls?.callsOutbound);
  values.talkTotalSec = n(calls?.talkTotalSec);
  values.loginSec = n(calls?.loginSec);
  values.talkAvgSec =
    calls?.talkTotalSec !== undefined && calls.callsToday
      ? Math.round(calls.talkTotalSec / calls.callsToday)
      : n(calls?.talkAvgSec);
  values.callsPerDay =
    calls?.callsToday !== undefined && calls.callDays
      ? Math.round((calls.callsToday / calls.callDays) * 10) / 10
      : null;
  return values;
}
