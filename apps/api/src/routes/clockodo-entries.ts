import { Elysia, t } from "elysia";

import { resolveClockodoCaller } from "../lib/clockodo-caller.js";
import { deleteEntry, listEntries, type ClockodoEntry } from "../lib/clockodo.js";
import { Errors } from "../lib/errors.js";

/**
 * Real clocked time entries (start/stop records), as opposed to
 * clockodo-absences.ts's absence/vacation data — this is what actually
 * populates the Timetable ("what did I work, and when"). Deliberately no
 * caching (see clockodo-cache.ts): this changes second-to-second.
 */

interface EntryDTO {
  id: string;
  startTime: string;
  endTime: string | null;
  customerName: string | null;
  serviceName: string | null;
}

function toDto(entry: ClockodoEntry): EntryDTO {
  return {
    id: String(entry.id),
    startTime: entry.time_since ?? "",
    endTime: entry.time_until ?? null,
    customerName: entry.customers_name ?? null,
    serviceName: entry.services_name ?? null,
  };
}

/** Clockodo's time_since/time_until params reject the fractional seconds
 * Date#toISOString() includes ("Wrong format") — mirrors the same fix in
 * clockodo-absences.ts's toClockodoTimestamp. */
function toClockodoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const clockodoEntriesRoute = new Elysia().get(
  "/clockodo/entries",
  async ({ request, query }) => {
    const caller = await resolveClockodoCaller(request);
    const since = new Date(`${query.start}T00:00:00Z`);
    const until = new Date(`${query.end}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 1);
    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
      throw Errors.badRequest("Invalid date range");
    }
    const entries = await listEntries({
      userId: caller.clockodoUserId,
      timeSince: toClockodoTimestamp(since),
      timeUntil: toClockodoTimestamp(until),
    });
    return {
      entries: entries
        .map(toDto)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    };
  },
  { query: t.Object({ start: t.String(), end: t.String() }) }
).delete(
  "/clockodo/entries/:id",
  async ({ request, params, query }) => {
    const caller = await resolveClockodoCaller(request);
    const id = Number(params.id);
    if (!Number.isSafeInteger(id)) throw Errors.badRequest("Invalid entry id");

    // Ownership check: Clockodo's entries API doesn't expose a get-by-id, so
    // confirm the entry belongs to the caller by re-fetching the day it's on
    // (a narrow, cheap window) rather than trusting the client-supplied id
    // blindly against the delete endpoint.
    const day = new Date(`${query.date}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) throw Errors.badRequest("Invalid date");
    const dayEnd = new Date(day);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const entries = await listEntries({
      userId: caller.clockodoUserId,
      timeSince: toClockodoTimestamp(day),
      timeUntil: toClockodoTimestamp(dayEnd),
    });
    const owned = entries.some(
      entry => entry.id === id && entry.users_id === caller.clockodoUserId
    );
    if (!owned) throw Errors.forbidden();

    await deleteEntry(id, caller.clockodoUserId);
    return { ok: true };
  },
  { params: t.Object({ id: t.String() }), query: t.Object({ date: t.String() }) }
);
