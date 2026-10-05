import type { api } from "@advantis/convex/api";

import { ONLINE_WINDOW_MS } from "@/components/profile/UserProfile";

import type { FunctionReturnType } from "convex/server";

export type Person = FunctionReturnType<typeof api.people.users.directoryList>[number];

export type PersonStatus =
  | { kind: "out"; until: string }
  | { kind: "inOffice" }
  | { kind: "online" }
  | { kind: "away" };

/**
 * The one place "what is this person's availability" is decided, so the table
 * and the card can't drift apart on it.
 *
 * Precedence is deliberate: a booked absence outranks any live signal (someone
 * on holiday who opens the intranet from a beach is still away), and being
 * clocked in with Zeiterfassung (not on a break) outranks the "has a tab open"
 * heuristic. Not clocked in falls back to that heuristic rather than reading
 * as away — not everyone clocks yet.
 */
export function personStatus(
  person: Person,
  now: number,
  outUntil: string | undefined,
  inOffice = false,
): PersonStatus {
  if (outUntil) return { kind: "out", until: outUntil };
  if (inOffice) return { kind: "inOffice" };
  const online = person.lastActiveAt != null && now - person.lastActiveAt < ONLINE_WINDOW_MS;
  return online ? { kind: "online" } : { kind: "away" };
}

/**
 * `directoryList` falls back to the email address when a person has no
 * first/last name on file, so for those rows `name` *is* the email. Showing it
 * twice — once as the identity, once as the contact line — reads like a
 * rendering bug, so the contact line drops it.
 */
export function hasRealName(person: Person): boolean {
  return person.name !== person.email;
}
