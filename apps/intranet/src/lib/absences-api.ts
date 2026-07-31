"use client";

import { useEffect, useState } from "react";

import { useEdenApi } from "@/lib/eden";

/**
 * Live Clockodo absence reads via apps/api — no Convex mirror, no
 * reactivity. Absences change rarely and don't need to be reactive (unlike
 * ActivityTrack's working/break/clocked-out signal), so every call here hits
 * Clockodo fresh through apps/api instead of a synced copy.
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
export function useMyAbsences(): { absences: MyAbsence[] | undefined; refresh: () => void } {
  const eden = useEdenApi();
  const [absences, setAbsences] = useState<MyAbsence[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await eden.clockodo.absences.me.get();
      if (!cancelled) setAbsences(data?.absences ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, reloadKey]);

  return { absences, refresh: () => setReloadKey((k) => k + 1) };
}

/**
 * Approved absences visible on the org calendar for `[start, end]`
 * (inclusive ISO dates). Privacy-filtered server-side: colleagues only see
 * vacation-type entries, not why someone else is out.
 */
export function useAbsencesCalendar(start: string, end: string): CalendarAbsence[] | undefined {
  const eden = useEdenApi();
  const [absences, setAbsences] = useState<CalendarAbsence[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setAbsences(undefined);
    void (async () => {
      const { data } = await eden.clockodo.absences.calendar.get({ query: { start, end } });
      if (!cancelled) setAbsences(data?.absences ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, start, end]);

  return absences;
}

/** Manager-only: count of org-wide pending absence requests (admin dashboard stat). */
export function usePendingAbsenceCount(enabled: boolean): number | undefined {
  const eden = useEdenApi();
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { data } = await eden.clockodo.absences["pending-count"].get();
      if (!cancelled) setCount(data?.count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, enabled]);

  return count;
}

/** canManageTeam-only: the full org-wide pending-approval queue. */
export function usePendingApprovals(enabled: boolean): {
  approvals: PendingApproval[] | undefined;
  refresh: () => void;
} {
  const eden = useEdenApi();
  const [approvals, setApprovals] = useState<PendingApproval[] | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { data } = await eden.clockodo.absences.pending.get();
      if (!cancelled) setApprovals(data?.absences ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [eden, enabled, reloadKey]);

  return { approvals, refresh: () => setReloadKey((k) => k + 1) };
}

/** Approve or deny a pending absence — a plain async helper (not a hook)
 * since it's called from an event handler, not on render. */
export async function setAbsenceApprovalStatus(
  eden: ReturnType<typeof useEdenApi>,
  id: string,
  status: "approved" | "denied",
): Promise<void> {
  const { error } = await eden.clockodo.absences({ id }).status.put({ status });
  if (error) throw error;
}
