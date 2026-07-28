import { api } from "@advantis/convex/api";
import { Elysia, t } from "elysia";

import {
  type CoarseAbsenceType,
  listCurrentAbsences,
  mapAbsenceStatus,
  mapAbsenceType,
} from "../lib/clockodo.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { Errors } from "../lib/errors.js";
import { requireAuth } from "../lib/middleware.js";

/**
 * Live Clockodo absence reads — no Convex mirror. Absences change rarely and
 * don't need to be reactive (unlike ActivityTrack's working/break/clocked-out
 * signal), so these fetch straight from Clockodo on every request instead of
 * syncing a stored copy via webhook + hourly cron. See AGENTS.md's Clockodo
 * section for the fuller rationale.
 */

interface AbsenceDTO {
  id: string;
  clockodoUserId: string;
  clockodoType: number;
  type: CoarseAbsenceType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  reason: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
}

function toDto(a: Awaited<ReturnType<typeof listCurrentAbsences>>[number]): AbsenceDTO {
  return {
    id: String(a.id),
    clockodoUserId: String(a.users_id),
    clockodoType: a.type,
    type: mapAbsenceType(a.type),
    startDate: a.date_since.slice(0, 10),
    endDate: a.date_until.slice(0, 10),
    halfDay: a.count_days === 0.5,
    reason: a.note,
    status: mapAbsenceStatus(a.status),
  };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const clockodoAbsencesRoute = new Elysia()
  .get("/clockodo/absences/me", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const caller = await getConvex().query(api.integrations.clockodoAbsences.resolveCaller, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
    if (!caller?.clockodoUserId) return { absences: [] };

    const all = await listCurrentAbsences();
    const mine = all
      .filter((a) => String(a.users_id) === caller.clockodoUserId)
      .map(toDto)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { absences: mine };
  })
  .get(
    "/clockodo/absences/calendar",
    async ({ request, query }) => {
      const { clerkUserId } = await requireAuth(request);
      const [caller, roster] = await Promise.all([
        getConvex().query(api.integrations.clockodoAbsences.resolveCaller, {
          serverKey: getConvexServerKey(),
          clerkUserId,
        }),
        getConvex().query(api.integrations.clockodoAbsences.roster, {
          serverKey: getConvexServerKey(),
        }),
      ]);
      const rosterByClockodoId = new Map(roster.map((r) => [r.clockodoUserId, r]));

      const all = await listCurrentAbsences();
      const approved = all.filter((a) => mapAbsenceStatus(a.status) === "approved");
      const overlapping = approved
        .map(toDto)
        .filter((a) => rangesOverlap(a.startDate, a.endDate, query.start, query.end));

      const visible = overlapping
        .map((a) => {
          const person = rosterByClockodoId.get(a.clockodoUserId);
          if (!person) return null;
          const isSelf = caller?.clockodoUserId === a.clockodoUserId;
          // Privacy: colleagues only see that someone is on vacation, not why
          // — sick/personal/other absences stay visible to that person alone
          // on the shared org calendar (their own "my absences" list still
          // shows everything, via /clockodo/absences/me).
          if (!isSelf && a.type !== "vacation") return null;
          return {
            id: a.id,
            userId: person.userId,
            userName: person.name,
            userDepartment: person.department,
            type: a.type,
            startDate: a.startDate,
            endDate: a.endDate,
            halfDay: a.halfDay,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      return { absences: visible };
    },
    {
      query: t.Object({ start: t.String(), end: t.String() }),
    },
  )
  /** Admin dashboard quick stat — count only, no identities. */
  .get("/clockodo/absences/pending-count", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const caller = await getConvex().query(api.integrations.clockodoAbsences.resolveCaller, {
      serverKey: getConvexServerKey(),
      clerkUserId,
    });
    if (!caller?.isManager) throw Errors.forbidden();

    const all = await listCurrentAbsences();
    const count = all.filter((a) => mapAbsenceStatus(a.status) === "pending").length;
    return { count };
  });
