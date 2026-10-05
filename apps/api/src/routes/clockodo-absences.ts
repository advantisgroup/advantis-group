import { api } from "@advantis/convex/api";
import { Elysia, t } from "elysia";

import {
  clockodo,
  type CoarseAbsenceType,
  mapAbsenceStatus,
  mapAbsenceType,
  toClockodoTimestamp,
} from "../lib/clockodo.js";
import { resolveClockodoCaller } from "../lib/clockodo-caller.js";
import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { Errors } from "../lib/errors.js";
import { authed } from "../lib/middleware.js";

/**
 * Live Clockodo absence reads — no Convex mirror. Absences change rarely and
 * don't need to be reactive, so these read Clockodo through the short shared
 * cache instead of syncing a stored copy via webhook + hourly cron. See
 * AGENTS.md's Clockodo section for the fuller rationale.
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

/** A pending absence plus who it belongs to, for the approvals queue —
 * unlike `/calendar` (privacy-filtered for everyone but the person
 * themselves), this is the manager's own action surface, so it carries the
 * full `AbsenceDTO` including `reason`. */
interface PendingApprovalDTO extends AbsenceDTO {
  userId: string;
  userName: string;
  userDepartment: string | null;
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
  context: { absenceId: number; field: string; raw: unknown },
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    console.error(
      `[clockodo] absence ${context.absenceId} has a bad ${context.field}; full record:`,
      JSON.stringify(context.raw),
    );
    return "";
  }
  return candidate.slice(0, 10);
}

function toDto(a: Awaited<ReturnType<typeof clockodo.listCurrentAbsences>>[number]): AbsenceDTO {
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

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

async function requireOwnAbsence(id: number, clockodoUserId: number) {
  const absence = await clockodo.getAbsence(id);
  if (absence.users_id !== clockodoUserId) throw Errors.forbidden();
  return absence;
}

/** Clockodo's time_since/time_until params reject the fractional seconds
 * Date#toISOString() includes ("Wrong format") — they need exactly
 * YYYY-MM-DDTHH:MM:SSZ. */
function recentWindow() {
  const now = new Date();
  return {
    timeSince: toClockodoTimestamp(new Date(now.getTime() - 18 * 60 * 60 * 1000)),
    timeUntil: toClockodoTimestamp(now),
  };
}

export const clockodoAbsencesRoute = new Elysia()
  .use(authed)
  .get("/clockodo/clock/me", async ({ request }) => {
    const me = await resolveClockodoCaller(request);
    const [{ timeSince, timeUntil }, account] = [
      recentWindow(),
      await clockodo.getUser(me.clockodoUserId),
    ];
    const entries = await clockodo.listEntries({
      userId: me.clockodoUserId,
      timeSince,
      timeUntil,
    });
    const running = entries.find((entry) => entry.time_until === null);
    if (running?.time_since) {
      return {
        accountName: account?.name ?? me.name,
        status: "working" as const,
        since: running.time_since,
        entryId: running.id,
      };
    }

    const lastEnd = entries
      .map((entry) => (entry.time_until ? Date.parse(entry.time_until) : Number.NaN))
      .filter(Number.isFinite)
      .reduce((latest, end) => Math.max(latest, end), 0);
    const onBreak = lastEnd > 0 && Date.now() - lastEnd <= 60 * 60 * 1000;
    return {
      accountName: account?.name ?? me.name,
      status: onBreak ? ("break" as const) : ("clockedOut" as const),
      since: lastEnd ? new Date(lastEnd).toISOString() : null,
      entryId: null,
    };
  })
  .get("/clockodo/clock/options", async ({ request }) => {
    const me = await resolveClockodoCaller(request);
    const [customers, services, rights] = await Promise.all([
      clockodo.listCustomers(),
      clockodo.listServices(),
      clockodo.getClockOptionsRights(me.clockodoUserId),
    ]);
    const canUse = (value: boolean | Record<string, unknown>, id: number) =>
      value === true || (typeof value === "object" && value !== null && String(id) in value);
    return {
      customers: customers.filter((customer) => canUse(rights.customers, customer.id)),
      services: services.filter((service) => canUse(rights.services, service.id)),
    };
  })
  .post(
    "/clockodo/clock/me",
    async ({ request, body }) => {
      const me = await resolveClockodoCaller(request);
      const rights = await clockodo.getClockOptionsRights(me.clockodoUserId);
      const canUse = (value: boolean | Record<string, unknown>, id: number) =>
        value === true || (typeof value === "object" && value !== null && String(id) in value);
      if (!canUse(rights.customers, body.customerId) || !canUse(rights.services, body.serviceId)) {
        throw Errors.forbidden();
      }
      const running = await clockodo.getRunningClock(me.clockodoUserId);
      if (running?.users_id === me.clockodoUserId) {
        throw Errors.badRequest("Clockodo timer is already running");
      }
      const entry = await clockodo.startClock({
        userId: me.clockodoUserId,
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
    },
  )
  .delete(
    "/clockodo/clock/me/:entryId",
    async ({ request, params }) => {
      const me = await resolveClockodoCaller(request);
      const entryId = Number(params.entryId);
      if (!Number.isSafeInteger(entryId)) throw Errors.badRequest("Invalid Clockodo entry id");
      const running = await clockodo.getRunningClock(me.clockodoUserId);
      if (!running || running.id !== entryId || running.users_id !== me.clockodoUserId) {
        throw Errors.forbidden();
      }
      await clockodo.stopClock(entryId, me.clockodoUserId);
      return { ok: true };
    },
    { params: t.Object({ entryId: t.String() }) },
  )
  .get(
    "/clockodo/absences/me",
    async ({ caller }) => {
      const me = await caller.convex.query(api.integrations.clockodoAbsences.resolveCaller, {});
      if (me.status !== "linked") return { absences: [] };

      const all = await clockodo.listCurrentAbsences();
      const mine = all
        .filter((a) => String(a.users_id) === me.clockodoUserId)
        .map(toDto)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      return { absences: mine };
    },
    { signedIn: true },
  )
  .get(
    "/clockodo/absences/calendar",
    async ({ caller, query }) => {
      const [me, roster] = await Promise.all([
        caller.convex.query(api.integrations.clockodoAbsences.resolveCaller, {}),
        getConvex().query(api.integrations.clockodoAbsences.roster, {
          serverKey: getConvexServerKey(),
        }),
      ]);
      const rosterByClockodoId = new Map(
        roster.filter((r) => r.linked).map((r) => [r.clockodoUserId, r]),
      );

      const all = await clockodo.listCurrentAbsences();
      const approved = all.filter((a) => mapAbsenceStatus(a.status) === "approved");
      const overlapping = approved
        .map(toDto)
        .filter((a) => rangesOverlap(a.startDate, a.endDate, query.start, query.end));

      const visible = overlapping
        .map((a) => {
          const person = rosterByClockodoId.get(a.clockodoUserId);
          if (!person) return null;
          const isSelf = me.status === "linked" && me.clockodoUserId === a.clockodoUserId;
          const canViewTeam = me.status !== "no_account" && me.canViewTeam;
          // Privacy: colleagues only see that someone is on vacation, not why
          // — sick/personal/other absences stay visible to that person alone
          // and to view_clockodo_team holders/managers, never the note/reason
          // itself (this DTO never includes `reason` to begin with) — their
          // own "my absences" list still shows everything, via
          // /clockodo/absences/me.
          if (!isSelf && !canViewTeam && a.type !== "vacation") return null;
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
      signedIn: true,
      query: t.Object({ start: t.String(), end: t.String() }),
    },
  )
  /** Admin dashboard quick stat — count only, no identities. */
  .get(
    "/clockodo/absences/pending-count",
    async ({ caller }) => {
      const me = await caller.convex.query(api.integrations.clockodoAbsences.resolveCaller, {});
      if (me.status === "no_account" || !me.canViewTeam) throw Errors.forbidden();

      const all = await clockodo.listCurrentAbsences();
      const count = all.filter((a) => mapAbsenceStatus(a.status) === "pending").length;
      return { count };
    },
    { signedIn: true },
  )
  /** Manager+/canManageTeam-only queue of pending requests to approve or
   *  deny — org-wide, unlike /me. */
  .get(
    "/clockodo/absences/pending",
    async ({ caller }) => {
      const [me, roster] = await Promise.all([
        caller.convex.query(api.integrations.clockodoAbsences.resolveCaller, {}),
        getConvex().query(api.integrations.clockodoAbsences.roster, {
          serverKey: getConvexServerKey(),
        }),
      ]);
      if (me.status === "no_account" || !me.canManageTeam) {
        throw Errors.forbidden();
      }

      const rosterByClockodoId = new Map(
        roster.filter((r) => r.linked).map((r) => [r.clockodoUserId, r]),
      );
      const all = await clockodo.listCurrentAbsences();
      const pending = all
        .filter((a) => mapAbsenceStatus(a.status) === "pending")
        .map(toDto)
        .map((dto): PendingApprovalDTO | null => {
          const person = rosterByClockodoId.get(dto.clockodoUserId);
          if (!person) return null;
          return {
            ...dto,
            userId: String(person.userId),
            userName: person.name,
            userDepartment: person.department,
          };
        })
        .filter((a): a is PendingApprovalDTO => a !== null)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      return { absences: pending };
    },
    { signedIn: true },
  )
  .put(
    "/clockodo/absences/:id/status",
    async ({ caller, params, body }) => {
      const me = await caller.convex.query(api.integrations.clockodoAbsences.resolveCaller, {});
      if (me.status === "no_account" || !me.canManageTeam) {
        throw Errors.forbidden();
      }

      const id = Number(params.id);
      if (!Number.isSafeInteger(id)) throw Errors.badRequest("Invalid absence id");

      const absence = await clockodo.getAbsence(id);
      // Self-approval safeguard: an approver can't action their own request
      // — someone else with the permission has to.
      if (me.status === "linked" && String(absence.users_id) === me.clockodoUserId) {
        throw Errors.forbidden("Cannot approve or deny your own absence request");
      }

      const updated = await clockodo.setAbsenceStatus(id, body.status === "approved" ? 1 : 2);
      return { absence: toDto(updated) };
    },
    {
      signedIn: true,
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status: t.Union([t.Literal("approved"), t.Literal("denied")]),
      }),
    },
  )
  .post(
    "/clockodo/absences/me",
    async ({ request, body }) => {
      const me = await resolveClockodoCaller(request);
      const absence = await clockodo.createAbsence({
        users_id: me.clockodoUserId,
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
    },
  )
  .put(
    "/clockodo/absences/me/:id",
    async ({ request, params, body }) => {
      const me = await resolveClockodoCaller(request);
      const id = Number(params.id);
      if (!Number.isSafeInteger(id)) throw Errors.badRequest("Invalid absence id");
      await requireOwnAbsence(id, me.clockodoUserId);
      const absence = await clockodo.updateAbsence(id, {
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
    },
  );
