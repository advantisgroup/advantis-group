import type { api } from "@advantis/convex/api";

import { ONLINE_WINDOW_MS } from "@/components/profile/UserProfile";

import type { FunctionReturnType } from "convex/server";

export type Person = FunctionReturnType<typeof api.users.directoryList>[number];

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
 * on holiday who opens the intranet from a beach is still away), and the
 * Clockodo/device-derived office signal outranks the "has a tab open"
 * heuristic. `inOffice === null` means nobody is on the ActivityTrack roster
 * for this person — not "not in office" — so it falls back to the tab
 * heuristic rather than reporting absence we can't see.
 */
export function personStatus(
  person: Person,
  now: number,
  inOfficeSignal: boolean | null | undefined,
  outUntil: string | undefined,
): PersonStatus {
  if (outUntil) return { kind: "out", until: outUntil };
  const online = person.lastActiveAt != null && now - person.lastActiveAt < ONLINE_WINDOW_MS;
  const signal = inOfficeSignal ?? null;
  if (signal === true) return { kind: "inOffice" };
  if (signal === null && online) return { kind: "online" };
  return { kind: "away" };
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
