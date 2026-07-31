import { api } from "@advantis/convex/api";
import { Elysia, t } from "elysia";

import {
  createAbsence,
  getRunningClock,
  getClockOptionsRights,
  getClockodoUser,
  getAbsence,
  listEntries,
  listCustomers,
  listServices,
  type CoarseAbsenceType,
  listCurrentAbsences,
  mapAbsenceStatus,
  mapAbsenceType,
  startClock,
  stopClock,
  updateAbsence,
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

/** Coerce a Clockodo date field to `YYYY-MM-DD`. The `/v4/absences` API has
 * been observed returning a non-string, missing, or blank shape for
 * date_since/date_until on some records, despite the documented contract —
 * fall back to "" rather than propagate a shape the client's string-only
 * date math (startsWith/slice) can't handle. Logs the *entire* raw record
 * (not just the one field) whenever this fires, since a wrong/missing date
 * field is also the easiest way to notice the whole record shape drifted
 * (e.g. a field getting renamed upstream). */
function toIsoDate(
  value: unknown,
  context: { absenceId: number; field: string; raw: unknown }
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    console.error(
      `[clockodo] absence ${context.absenceId} has a bad ${context.field}; full record:`,
      JSON.stringify(context.raw)
    );
    return "";
  }
  return candidate.slice(0, 10);
}

function toDto(
  a: Awaited<ReturnType<typeof listCurrentAbsences>>[number]
): AbsenceDTO {
  return {
    id: String(a.id),
    clockodoUserId: String(a.users_id),
    clockodoType: a.type,
    type: mapAbsenceType(a.type),
    startDate: toIsoDate(a.date_since, {
      absenceId: a.id,
      field: "date_since",
      raw: a,
    }),
    endDate: toIsoDate(a.date_until, {
      absenceId: a.id,
      field: "date_until",
      raw: a,
    }),
    halfDay: a.count_days === 0.5,
    reason: a.note,
    status: mapAbsenceStatus(a.status),
  };
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

async function resolveClockodoCaller(request: Request) {
  const { clerkUserId } = await requireAuth(request);
  const caller = await getConvex().query(
    api.integrations.clockodoAbsences.resolveCaller,
    {
      serverKey: getConvexServerKey(),
      clerkUserId,
    }
  );
  if (caller.status !== "linked") {
    throw Errors.forbidden("Clockodo account is not linked");
  }
  const clockodoUserId = Number(caller.clockodoUserId);
  if (!Number.isSafeInteger(clockodoUserId)) {
    throw Errors.forbidden("Clockodo account is not linked");
  }
  return { ...caller, clockodoUserId };
}

async function requireOwnAbsence(id: number, clockodoUserId: number) {
  const absence = await getAbsence(id);
  if (absence.users_id !== clockodoUserId) throw Errors.forbidden();
  return absence;
}

/** Clockodo's time_since/time_until params reject the fractional seconds
 * Date#toISOString() includes ("Wrong format") — they need exactly
 * YYYY-MM-DDTHH:MM:SSZ. */
function toClockodoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function recentWindow() {
  const now = new Date();
  return {
    timeSince: toClockodoTimestamp(
      new Date(now.getTime() - 18 * 60 * 60 * 1000)
    ),
    timeUntil: toClockodoTimestamp(now),
  };
}

export const clockodoAbsencesRoute = new Elysia()
  .get("/clockodo/clock/me", async ({ request }) => {
    const caller = await resolveClockodoCaller(request);
    const [{ timeSince, timeUntil }, account] = [
      recentWindow(),
      await getClockodoUser(caller.clockodoUserId),
    ];
    const entries = await listEntries({
      userId: caller.clockodoUserId,
      timeSince,
      timeUntil,
    });
    const running = entries.find(entry => entry.time_until === null);
    if (running?.time_since) {
      return {
        accountName: account?.name ?? caller.name,
        status: "working" as const,
        since: running.time_since,
        entryId: running.id,
      };
    }

    const lastEnd = entries
      .map(entry =>
        entry.time_until ? Date.parse(entry.time_until) : Number.NaN
      )
      .filter(Number.isFinite)
      .reduce((latest, end) => Math.max(latest, end), 0);
    const onBreak = lastEnd > 0 && Date.now() - lastEnd <= 60 * 60 * 1000;
    return {
      accountName: account?.name ?? caller.name,
      status: onBreak ? ("break" as const) : ("clockedOut" as const),
      since: lastEnd ? new Date(lastEnd).toISOString() : null,
      entryId: null,
    };
  })
  .get("/clockodo/clock/options", async ({ request }) => {
    const caller = await resolveClockodoCaller(request);
    const [customers, services, rights] = await Promise.all([
      listCustomers(),
      listServices(),
      getClockOptionsRights(caller.clockodoUserId),
    ]);
    const canUse = (value: boolean | Record<string, unknown>, id: number) =>
      value === true ||
      (typeof value === "object" && value !== null && String(id) in value);
    return {
      customers: customers.filter(customer =>
        canUse(rights.customers, customer.id)
      ),
      services: services.filter(service => canUse(rights.services, service.id)),
    };
  })
  .post(
    "/clockodo/clock/me",
    async ({ request, body }) => {
      const caller = await resolveClockodoCaller(request);
      const rights = await getClockOptionsRights(caller.clockodoUserId);
      const canUse = (value: boolean | Record<string, unknown>, id: number) =>
        value === true ||
        (typeof value === "object" && value !== null && String(id) in value);
      if (
        !canUse(rights.customers, body.customerId) ||
        !canUse(rights.services, body.serviceId)
      ) {
        throw Errors.forbidden();
      }
      const running = await getRunningClock(caller.clockodoUserId);
      if (running?.users_id === caller.clockodoUserId) {
        throw Errors.badRequest("Clockodo timer is already running");
      }
      const entry = await startClock({
        userId: caller.clockodoUserId,
        customerId: body.customerId,
        serviceId: body.serviceId,
      });
      return { entry };
    },
    {
      body: t.Object({
        customerId: t.Integer(),
        serviceId: t.Integer(),
      }),
    }
  )
  .delete(
    "/clockodo/clock/me/:entryId",
    async ({ request, params }) => {
      const caller = await resolveClockodoCaller(request);
      const entryId = Number(params.entryId);
      if (!Number.isSafeInteger(entryId))
        throw Errors.badRequest("Invalid Clockodo entry id");
      const running = await getRunningClock(caller.clockodoUserId);
      if (
        !running ||
        running.id !== entryId ||
        running.users_id !== caller.clockodoUserId
      ) {
        throw Errors.forbidden();
      }
      await stopClock(entryId, caller.clockodoUserId);
      return { ok: true };
    },
    { params: t.Object({ entryId: t.String() }) }
  )
  .get("/clockodo/absences/me", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const caller = await getConvex().query(
      api.integrations.clockodoAbsences.resolveCaller,
      {
        serverKey: getConvexServerKey(),
        clerkUserId,
      }
    );
    if (caller.status !== "linked") return { absences: [] };

    const all = await listCurrentAbsences();
    const mine = all
      .filter(a => String(a.users_id) === caller.clockodoUserId)
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
      const rosterByClockodoId = new Map(
        roster.filter(r => r.linked).map(r => [r.clockodoUserId, r])
      );

      const all = await listCurrentAbsences();
      const approved = all.filter(
        a => mapAbsenceStatus(a.status) === "approved"
      );
      const overlapping = approved
        .map(toDto)
        .filter(a =>
          rangesOverlap(a.startDate, a.endDate, query.start, query.end)
        );

      const visible = overlapping
        .map(a => {
          const person = rosterByClockodoId.get(a.clockodoUserId);
          if (!person) return null;
          const isSelf = caller.status === "linked" && caller.clockodoUserId === a.clockodoUserId;
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
    }
  )
  /** Admin dashboard quick stat — count only, no identities. */
  .get("/clockodo/absences/pending-count", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    const caller = await getConvex().query(
      api.integrations.clockodoAbsences.resolveCaller,
      {
        serverKey: getConvexServerKey(),
        clerkUserId,
      }
    );
    if (caller.status === "no_account" || !caller.isManager) throw Errors.forbidden();

    const all = await listCurrentAbsences();
    const count = all.filter(
      a => mapAbsenceStatus(a.status) === "pending"
    ).length;
    return { count };
  })
  .post(
    "/clockodo/absences/me",
    async ({ request, body }) => {
      const caller = await resolveClockodoCaller(request);
      const absence = await createAbsence({
        users_id: caller.clockodoUserId,
        date_since: body.dateSince,
        date_until: body.dateUntil,
        type: body.clockodoType,
        note: body.note || null,
        count_days: body.halfDay ? 0.5 : null,
        status: 0,
      });
      return { absence: toDto(absence) };
    },
    {
      body: t.Object({
        clockodoType: t.Integer(),
        dateSince: t.String(),
        dateUntil: t.String(),
        halfDay: t.Boolean(),
        note: t.Optional(t.String()),
      }),
    }
  )
  .put(
    "/clockodo/absences/me/:id",
    async ({ request, params, body }) => {
      const caller = await resolveClockodoCaller(request);
      const id = Number(params.id);
      if (!Number.isSafeInteger(id))
        throw Errors.badRequest("Invalid absence id");
      await requireOwnAbsence(id, caller.clockodoUserId);
      const absence = await updateAbsence(id, {
        date_since: body.dateSince,
        date_until: body.dateUntil,
        type: body.clockodoType,
        note: body.note || null,
        count_days: body.halfDay ? 0.5 : null,
      });
      return { absence: toDto(absence) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        clockodoType: t.Integer(),
        dateSince: t.String(),
        dateUntil: t.String(),
        halfDay: t.Boolean(),
        note: t.Optional(t.String()),
      }),
    }
  );
