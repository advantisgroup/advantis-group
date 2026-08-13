"use client";

import { useCallback } from "react";

import { unwrapApiResult, useIntranetApiClient } from "@/lib/api-client";
import { type EdenApiClient } from "@/lib/eden";
import { type ApiQuery, useApiQuery } from "@/hooks/use-api-query";

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
  const query = useClockEntriesQuery(start, end, enabled);
  return { entries: query.data, refresh: query.refresh };
}

export function useClockEntriesQuery(
  start: string,
  end: string,
  enabled = true,
): ApiQuery<ClockEntry[]> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden.clockodo.entries.get({ query: { start, end } }));
      return data.entries;
    }, [api, start, end]),
    { enabled, source: "clockodo.entries" },
  );
}

/** Deletes a finished time entry — `date` is the ISO day it falls on, used
 * server-side to scope the ownership check (see clockodo-entries.ts). */
export async function deleteClockEntry(
  eden: EdenApiClient,
  id: string,
  date: string,
): Promise<void> {
  await unwrapApiResult(eden.clockodo.entries({ id }).delete(undefined, { query: { date } }));
}
