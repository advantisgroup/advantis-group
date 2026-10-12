"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { useIsAdmin } from "@/components/providers/current-user";
import { addDaysIso } from "@/lib/absences";

/**
 * Absence reads for the dashboard, calendar, directory, profile and approval
 * pages — straight from the own Zeiterfassung (`time.absences.*`,
 * `time.admin.approvals`). The shapes are the coarse app-wide ones those
 * pages already render; the Zeiterfassung itself works with the full rows.
 * Privacy stays server-side: `time.absences.calendar` only returns other
 * people's approved vacation.
 */

export type AbsenceType = "vacation" | "sick" | "personal" | "other";
export type AbsenceStatus = "pending" | "approved" | "denied" | "cancelled";

type TimeType = "vacation" | "sick" | "special" | "overtime" | "other";
type TimeStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface MyAbsence {
  id: string;
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

/** A pending absence in the admin approval queue. */
export interface PendingApproval extends MyAbsence {
  userId: string;
  userName: string;
  userDepartment: string | null;
}

/** Special leave reads as "personal"; overtime reduction as "other". */
function coarseType(type: TimeType): AbsenceType {
  if (type === "special") return "personal";
  if (type === "overtime") return "other";
  return type;
}

function coarseStatus(status: TimeStatus): AbsenceStatus {
  return status === "rejected" ? "denied" : status;
}

function useCanUseTime(): boolean {
  return useQuery(api.time.mode.status)?.canUse === true;
}

/** The signed-in user's own absences — any status/type, private to them. */
export function useMyAbsences(): { absences: MyAbsence[] | undefined } {
  const canUse = useCanUseTime();
  const rows = useQuery(api.time.absences.list, canUse ? {} : "skip");
  const absences = useMemo(
    () =>
      rows?.map((row) => ({
        id: row._id,
        type: coarseType(row.type),
        startDate: row.startDate,
        endDate: row.endDate,
        halfDay: row.halfDayStart || row.halfDayEnd,
        reason: row.note ?? null,
        status: coarseStatus(row.status),
      })),
    [rows],
  );
  return { absences };
}

/**
 * Approved absences on the team calendar for `[start, end]` (inclusive ISO
 * dates, at most 92 days — longer ranges are cut). Colleagues only see
 * vacation; your own absences show with their real type.
 */
export function useAbsencesCalendar(
  start: string,
  end: string,
  enabled = true,
): CalendarAbsence[] | undefined {
  const canUse = useCanUseTime();
  const to = end < start ? start : end > addDaysIso(start, 92) ? addDaysIso(start, 92) : end;
  const data = useQuery(
    api.time.absences.calendar,
    canUse && enabled ? { from: start, to } : "skip",
  );
  return useMemo(
    () =>
      data?.absences
        .filter((row) => row.status === "approved")
        .map((row) => ({
          id: row._id,
          userId: row.userId,
          userName: row.userName,
          userDepartment: row.userDepartment,
          type: coarseType(row.type),
          startDate: row.startDate,
          endDate: row.endDate,
          halfDay: row.halfDayStart || row.halfDayEnd,
        })),
    [data],
  );
}

/** Admin-only: the pending absence requests (`enabled` and admin). */
export function usePendingApprovals(enabled: boolean): {
  approvals: PendingApproval[] | undefined;
} {
  const isAdmin = useIsAdmin();
  const canUse = useCanUseTime();
  const data = useQuery(api.time.admin.approvals, enabled && isAdmin && canUse ? {} : "skip");
  const approvals = useMemo(
    () =>
      data?.absences.map((row) => ({
        id: row._id,
        type: coarseType(row.type),
        startDate: row.startDate,
        endDate: row.endDate,
        halfDay: row.halfDayStart || row.halfDayEnd,
        reason: row.note ?? null,
        status: coarseStatus(row.status),
        userId: row.userId,
        userName: row.person?.name ?? "",
        userDepartment: null,
      })),
    [data],
  );
  return { approvals };
}

/** Admin-only: open Zeiterfassung approvals (absences and corrections). */
export function usePendingAbsenceCount(enabled: boolean): number | undefined {
  const isAdmin = useIsAdmin();
  const canUse = useCanUseTime();
  const data = useQuery(api.time.admin.approvals, enabled && isAdmin && canUse ? {} : "skip");
  return data ? data.absences.length + data.corrections.length : undefined;
}
