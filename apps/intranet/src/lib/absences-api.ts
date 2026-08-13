"use client";

import { useCallback } from "react";

import { unwrapApiResult, useIntranetApiClient } from "@/lib/api-client";
import { type EdenApiClient } from "@/lib/eden";
import { type ApiQuery, useApiQuery } from "@/hooks/use-api-query";

/**
 * Live Clockodo absence reads via apps/api — no Convex mirror, no
 * reactivity. Absences change rarely and don't need to be reactive (unlike
 * ActivityTrack's working/break/clocked-out signal), so every call here goes
 * through apps/api's short-lived Clockodo cache instead of a synced copy.
 */

export type AbsenceType = "vacation" | "sick" | "personal" | "other";
export type AbsenceStatus = "pending" | "approved" | "denied" | "cancelled";

export interface MyAbsence {
  id: string;
  clockodoType: number;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  reason: string | null;
  status: AbsenceStatus;
}

export interface CalendarAbsence {
  id: string;
  userId: string;
  userName: string;
  userDepartment: string | null;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
}

/** A pending absence in the manager/canManageTeam approval queue — unlike
 * `CalendarAbsence`, this carries the full detail (reason included) since
 * it's the approver's own action surface, not the shared org calendar. */
export interface PendingApproval extends MyAbsence {
  userId: string;
  userName: string;
  userDepartment: string | null;
}

/** The signed-in user's own absences — any status/type, private to them. */
export function useMyAbsences(): ApiQuery<MyAbsence[]> & { absences: MyAbsence[] | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden.clockodo.absences.me.get());
      return data.absences;
    }, [api]),
    { source: "clockodo.absences.me" },
  );
  return { ...query, absences: query.data };
}

/**
 * Approved absences visible on the org calendar for `[start, end]`
 * (inclusive ISO dates). Privacy-filtered server-side: colleagues only see
 * vacation-type entries, not why someone else is out.
 */
export function useAbsencesCalendar(
  start: string,
  end: string,
  enabled = true,
): CalendarAbsence[] | undefined {
  return useAbsencesCalendarQuery(start, end, enabled).data;
}

export function useAbsencesCalendarQuery(
  start: string,
  end: string,
  enabled = true,
): ApiQuery<CalendarAbsence[]> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(
        api.eden.clockodo.absences.calendar.get({ query: { start, end } }),
      );
      return data.absences;
    }, [api, start, end]),
    { enabled, source: "clockodo.absences.calendar" },
  );
}

/** Manager-only: count of org-wide pending absence requests (admin dashboard stat). */
export function usePendingAbsenceCount(enabled: boolean): number | undefined {
  return usePendingAbsenceCountQuery(enabled).data;
}

export function usePendingAbsenceCountQuery(enabled: boolean): ApiQuery<number> {
  const api = useIntranetApiClient();
  return useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden.clockodo.absences["pending-count"].get());
      return data.count;
    }, [api]),
    { enabled, source: "clockodo.absences.pending-count" },
  );
}

/** canManageTeam-only: the full org-wide pending-approval queue. */
export function usePendingApprovals(
  enabled: boolean,
): ApiQuery<PendingApproval[]> & { approvals: PendingApproval[] | undefined } {
  const api = useIntranetApiClient();
  const query = useApiQuery(
    useCallback(async () => {
      const data = await api.unwrap(api.eden.clockodo.absences.pending.get());
      return data.absences;
    }, [api]),
    { enabled, source: "clockodo.absences.pending" },
  );
  return { ...query, approvals: query.data };
}

/** Approve or deny a pending absence — a plain async helper (not a hook)
 * since it's called from an event handler, not on render. */
export async function setAbsenceApprovalStatus(
  eden: EdenApiClient,
  id: string,
  status: "approved" | "denied",
): Promise<void> {
  await unwrapApiResult(eden.clockodo.absences({ id }).status.put({ status }));
}
