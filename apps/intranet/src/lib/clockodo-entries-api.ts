"use client";

import { useEffect, useState } from "react";

import { useEdenApi } from "@/lib/eden";

/**
 * Real clocked time entries (start/stop records) — what actually populates
 * the Timetable, as opposed to absences-api.ts's vacation/sick data. Not
 * cached anywhere (client or apps/api): this changes second-to-second.
 */

export interface ClockEntry {
  id: string;
  startTime: string;
  endTime: string | null;
  customerName: string | null;
  serviceName: string | null;
}

/** A day's entries, `[start, end]` inclusive ISO dates. `enabled` should be
 * `!!user.clockodoUserId` — someone with only team access and no personal
 * Clockodo link has no entries to fetch, and the request would just 403. */
export function useClockEntries(
  start: string,
  end: string,
  enabled = true,
): { entries: ClockEntry[] | undefined; refresh: () => void } {
  const eden = useEdenApi();
  const [entries, setEntries] = useState<ClockEntry[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setEntries(undefined);
      return;
    }
    let cancelled = false;
    setEntries(undefined);
    void (async () => {
      const { data } = await eden.clockodo.entries.get({ query: { start, end } });
      if (!cancelled) setEntries(data?.entries ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, start, end, enabled, reloadKey]);

  return { entries, refresh: () => setReloadKey((k) => k + 1) };
}

/** Deletes a finished time entry — `date` is the ISO day it falls on, used
 * server-side to scope the ownership check (see clockodo-entries.ts). */
export async function deleteClockEntry(
  eden: ReturnType<typeof useEdenApi>,
  id: string,
  date: string,
): Promise<void> {
  const { error } = await eden.clockodo.entries({ id }).delete(undefined, { query: { date } });
  if (error) throw error;
}
