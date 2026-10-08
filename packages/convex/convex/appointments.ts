import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { userMutation, userQuery } from "./functions";
import { type Caller } from "./lib/caller";
import { createNotification, notifyUsers } from "./lib/notify";

/**
 * Appointments between leads and employees, shown in the calendar.
 *
 * - Admins and team leads (role "manager" or the lead of a team) book an
 *   appointment with people they lead — admins with anyone. It is confirmed
 *   at once; an attendee who can't make it declines with a reason.
 * - Everyone can ask their own team lead or an admin for an appointment. It
 *   waits until that person accepts (maybe at another time) or declines.
 *
 * Only the people involved ever see an appointment, admins included.
 */

const LINK = "/calendar";
const TYPE = "appointment";
const MAX_LENGTH_MS = 12 * 60 * 60 * 1000;

type Scope = {
  isLead: boolean;
  /** People the caller may book an appointment with. */
  attendees: Doc<"users">[];
  /** People the caller may ask for an appointment. */
  recipients: Doc<"users">[];
};

function nameOf(user: Pick<Doc<"users">, "firstName" | "lastName" | "email"> | null) {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Di., 13.10. · 10:00–10:30" for notifications. */
export function formatWhen(start: number, end: number) {
  return `${dayFormat.format(start)} · ${timeFormat.format(start)}–${timeFormat.format(end)}`;
}

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

async function scopeOf(ctx: QueryCtx, caller: Caller): Promise<Scope> {
  const [users, teams, links] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("teams").collect(),
    ctx.db.query("userTeams").collect(),
  ]);
  const active = users.filter((user) => user.status === "active" && user._id !== caller.id);
  const liveTeams = teams.filter((team) => !team.archivedAt);
  const led = new Set(
    liveTeams.filter((team) => team.reportsToUserId === caller.id).map((team) => team._id),
  );
  const isLead = caller.isManager || led.size > 0;

  let attendees: Doc<"users">[] = [];
  if (caller.isAdmin) {
    attendees = active;
  } else if (led.size > 0) {
    const members = new Set(links.filter((link) => led.has(link.teamId)).map((l) => l.userId));
    attendees = active.filter((user) => members.has(user._id));
  } else if (caller.isManager) {
    attendees = active;
  }

  const myTeams = new Set(
    links.filter((link) => link.userId === caller.id).map((link) => link.teamId),
  );
  const myLeads = new Set(
    liveTeams
      .filter((team) => myTeams.has(team._id) && team.reportsToUserId)
      .map((team) => team.reportsToUserId!),
  );
  const recipients = active.filter((user) => user.role === "admin" || myLeads.has(user._id));

  const byName = (a: Doc<"users">, b: Doc<"users">) => nameOf(a).localeCompare(nameOf(b), "de");
  return { isLead, attendees: attendees.sort(byName), recipients: recipients.sort(byName) };
}

function checkTimes(start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    fail("bad_request", "End must be after start");
  }
  if (end - start > MAX_LENGTH_MS) fail("bad_request", "At most 12 hours");
}

function cleanTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) fail("bad_request", "Title required");
  return trimmed.slice(0, 200);
}

const optionalText = (value: string | undefined) => value?.trim() || undefined;

function involved(row: Doc<"appointments">, userId: Id<"users">) {
  return (
    row.organizerId === userId || row.attendeeIds.includes(userId) || row.requestedBy === userId
  );
}

async function shape(ctx: QueryCtx, row: Doc<"appointments">, me: Id<"users">) {
  const ids = [...new Set([row.organizerId, ...row.attendeeIds])];
  const users = new Map(
    (await Promise.all(ids.map((id) => ctx.db.get(id))))
      .filter((user): user is Doc<"users"> => user !== null)
      .map((user) => [user._id, user]),
  );
  const declines = new Map((row.declines ?? []).map((d) => [d.userId, d.reason]));
  return {
    _id: row._id,
    title: row.title,
    note: row.note ?? null,
    location: row.location ?? null,
    start: row.start,
    end: row.end,
    status: row.status,
    decisionNote: row.decisionNote ?? null,
    organizer: { userId: row.organizerId, name: nameOf(users.get(row.organizerId) ?? null) },
    attendees: row.attendeeIds.map((userId) => ({
      userId,
      name: nameOf(users.get(userId) ?? null),
      declined: declines.get(userId) ?? null,
    })),
    requestedBy: row.requestedBy ?? null,
    isOrganizer: row.organizerId === me,
    isAttendee: row.attendeeIds.includes(me),
  };
}

export type AppointmentView = Awaited<ReturnType<typeof shape>>;

/** Who the caller can book with and who they can ask. */
export const contacts = userQuery({
  args: {},
  handler: async (ctx) => {
    const scope = await scopeOf(ctx, ctx.caller);
    const person = (user: Doc<"users">) => ({
      userId: user._id,
      name: nameOf(user),
      avatarUrl: user.avatarUrl ?? null,
    });
    return {
      isLead: scope.isLead,
      attendees: scope.attendees.map(person),
      recipients: scope.recipients.map(person),
    };
  },
});

/** The caller's appointments and open requests overlapping [start, end]. */
export const listForRange = userQuery({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, { start, end }) => {
    const me = ctx.caller.id;
    const rows = await ctx.db
      .query("appointments")
      .withIndex("by_start", (q) => q.lte("start", end))
      .collect();
    const mine = rows.filter(
      (row) =>
        row.end >= start &&
        (row.status === "confirmed" || row.status === "requested") &&
        involved(row, me),
    );
    return Promise.all(mine.map((row) => shape(ctx, row, me)));
  },
});

/** Requests waiting for the caller's answer, and the caller's own open ones. */
export const inbox = userQuery({
  args: {},
  handler: async (ctx) => {
    const me = ctx.caller.id;
    const [toAnswer, asked] = await Promise.all([
      ctx.db
        .query("appointments")
        .withIndex("by_organizer_status", (q) => q.eq("organizerId", me).eq("status", "requested"))
        .collect(),
      ctx.db
        .query("appointments")
        .withIndex("by_requester", (q) => q.eq("requestedBy", me))
        .collect(),
    ]);
    const open = asked.filter((row) => row.status === "requested");
    return {
      toAnswer: await Promise.all(
        toAnswer.sort((a, b) => a.start - b.start).map((row) => shape(ctx, row, me)),
      ),
      mine: await Promise.all(
        open.sort((a, b) => a.start - b.start).map((row) => shape(ctx, row, me)),
      ),
    };
  },
});

/** A lead or admin books an appointment; it is confirmed straight away. */
export const create = userMutation({
  args: {
    attendeeIds: v.array(v.id("users")),
    title: v.string(),
    note: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await scopeOf(ctx, ctx.caller);
    if (!scope.isLead) fail("forbidden", "Only team leads and admins book appointments");
    const attendeeIds = [...new Set(args.attendeeIds)];
    if (attendeeIds.length === 0 || attendeeIds.length > 20) {
      fail("bad_request", "Choose who the appointment is with");
    }
    const allowed = new Set(scope.attendees.map((user) => user._id));
    if (attendeeIds.some((id) => !allowed.has(id))) {
      fail("forbidden", "You can only book appointments with people you lead");
    }
    checkTimes(args.start, args.end);
    const now = Date.now();
    const title = cleanTitle(args.title);
    const id = await ctx.db.insert("appointments", {
      title,
      note: optionalText(args.note),
      location: optionalText(args.location),
      start: args.start,
      end: args.end,
      organizerId: ctx.caller.id,
      attendeeIds,
      status: "confirmed",
      createdBy: ctx.caller.id,
      createdAt: now,
      updatedAt: now,
    });
    await notifyUsers(ctx, attendeeIds, {
      type: TYPE,
      title: `Neuer Termin: ${title}`,
      body: `${formatWhen(args.start, args.end)} · mit ${nameOf(ctx.caller.user)}`,
      link: LINK,
    });
    return id;
  },
});

/** Anyone asks their team lead or an admin for an appointment. */
export const request = userMutation({
  args: {
    organizerId: v.id("users"),
    title: v.string(),
    note: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await scopeOf(ctx, ctx.caller);
    if (!scope.recipients.some((user) => user._id === args.organizerId)) {
      fail("forbidden", "You can ask your team lead or an admin");
    }
    checkTimes(args.start, args.end);
    if (args.start < Date.now() - 60 * 60 * 1000) fail("bad_request", "That time has passed");
    const now = Date.now();
    const title = cleanTitle(args.title);
    const id = await ctx.db.insert("appointments", {
      title,
      note: optionalText(args.note),
      start: args.start,
      end: args.end,
      organizerId: args.organizerId,
      attendeeIds: [ctx.caller.id],
      status: "requested",
      requestedBy: ctx.caller.id,
      createdBy: ctx.caller.id,
      createdAt: now,
      updatedAt: now,
    });
    await createNotification(ctx, {
      userId: args.organizerId,
      type: TYPE,
      title: `Terminanfrage: ${title}`,
      body: `${nameOf(ctx.caller.user)} · ${formatWhen(args.start, args.end)}`,
      link: LINK,
    });
    return id;
  },
});

/** The asked person accepts (optionally at another time) or declines. */
export const respond = userMutation({
  args: {
    id: v.id("appointments"),
    accept: v.boolean(),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    location: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "requested") fail("conflict", "Not waiting for an answer");
    if (row.organizerId !== ctx.caller.id && !ctx.caller.isAdmin) {
      fail("forbidden", "Only the person asked can answer");
    }
    const note = optionalText(args.note);
    const now = Date.now();
    if (args.accept) {
      const start = args.start ?? row.start;
      const end = args.end ?? row.end;
      checkTimes(start, end);
      const moved = start !== row.start || end !== row.end;
      await ctx.db.patch(row._id, {
        status: "confirmed",
        start,
        end,
        location: optionalText(args.location) ?? row.location,
        decisionNote: note,
        updatedAt: now,
      });
      await notifyUsers(ctx, row.attendeeIds, {
        type: TYPE,
        title: moved
          ? `Termin bestätigt – neue Zeit: ${row.title}`
          : `Termin bestätigt: ${row.title}`,
        body: [formatWhen(start, end), note].filter(Boolean).join(" · "),
        link: LINK,
      });
    } else {
      if (!note) fail("bad_request", "Please give a reason");
      await ctx.db.patch(row._id, { status: "declined", decisionNote: note, updatedAt: now });
      await notifyUsers(ctx, row.attendeeIds, {
        type: TYPE,
        title: `Terminanfrage abgelehnt: ${row.title}`,
        body: note,
        link: LINK,
      });
    }
  },
});

/** An attendee can't make a confirmed appointment and says why. */
export const decline = userMutation({
  args: { id: v.id("appointments"), reason: v.string() },
  handler: async (ctx, { id, reason }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "confirmed") fail("conflict", "Appointment not found");
    if (!row.attendeeIds.includes(ctx.caller.id)) fail("forbidden", "Not your appointment");
    const text = reason.trim();
    if (!text) fail("bad_request", "Please give a reason");
    const declines = [
      ...(row.declines ?? []).filter((d) => d.userId !== ctx.caller.id),
      { userId: ctx.caller.id, reason: text.slice(0, 500), at: Date.now() },
    ];
    await ctx.db.patch(row._id, { declines, updatedAt: Date.now() });
    await createNotification(ctx, {
      userId: row.organizerId,
      type: TYPE,
      title: `Absage: ${row.title}`,
      body: `${nameOf(ctx.caller.user)} · ${formatWhen(row.start, row.end)} · ${text}`,
      link: LINK,
    });
  },
});

/** The organizer (or an admin) changes a confirmed appointment. */
export const update = userMutation({
  args: {
    id: v.id("appointments"),
    title: v.string(),
    note: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
    attendeeIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "confirmed") fail("conflict", "Appointment not found");
    if (row.organizerId !== ctx.caller.id && !ctx.caller.isAdmin) {
      fail("forbidden", "Only the organizer can change it");
    }
    checkTimes(args.start, args.end);
    const attendeeIds = [...new Set(args.attendeeIds)];
    if (attendeeIds.length === 0 || attendeeIds.length > 20) {
      fail("bad_request", "Choose who the appointment is with");
    }
    const added = attendeeIds.filter((id) => !row.attendeeIds.includes(id));
    if (added.length > 0) {
      const scope = await scopeOf(ctx, ctx.caller);
      const allowed = new Set(scope.attendees.map((user) => user._id));
      if (added.some((id) => !allowed.has(id))) {
        fail("forbidden", "You can only book appointments with people you lead");
      }
    }
    const moved = args.start !== row.start || args.end !== row.end;
    const title = cleanTitle(args.title);
    await ctx.db.patch(row._id, {
      title,
      note: optionalText(args.note),
      location: optionalText(args.location),
      start: args.start,
      end: args.end,
      attendeeIds,
      // A new time asks everyone again.
      declines: moved
        ? undefined
        : (row.declines ?? []).filter((d) => attendeeIds.includes(d.userId)),
      updatedAt: Date.now(),
    });
    const removed = row.attendeeIds.filter((id) => !attendeeIds.includes(id));
    const kept = attendeeIds.filter((id) => row.attendeeIds.includes(id));
    const when = formatWhen(args.start, args.end);
    await notifyUsers(ctx, added, {
      type: TYPE,
      title: `Neuer Termin: ${title}`,
      body: `${when} · mit ${nameOf(ctx.caller.user)}`,
      link: LINK,
    });
    await notifyUsers(
      ctx,
      kept.filter((id) => id !== ctx.caller.id),
      {
        type: TYPE,
        title: `Termin geändert: ${title}`,
        body: when,
        link: LINK,
      },
    );
    await notifyUsers(ctx, removed, {
      type: TYPE,
      title: `Termin abgesagt: ${row.title}`,
      body: formatWhen(row.start, row.end),
      link: LINK,
    });
  },
});

/**
 * Call an appointment off: the organizer or an admin cancels it; the person
 * who asked withdraws an unanswered request.
 */
export const cancel = userMutation({
  args: { id: v.id("appointments"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const row = await ctx.db.get(id);
    if (!row || (row.status !== "confirmed" && row.status !== "requested")) {
      fail("conflict", "Appointment not found");
    }
    const me = ctx.caller.id;
    const withdrawing = row.status === "requested" && row.requestedBy === me;
    if (!withdrawing && row.organizerId !== me && !ctx.caller.isAdmin) {
      fail("forbidden", "Only the organizer can cancel it");
    }
    const note = optionalText(reason);
    await ctx.db.patch(row._id, { status: "cancelled", decisionNote: note, updatedAt: Date.now() });
    const told = withdrawing
      ? [row.organizerId]
      : [...row.attendeeIds, row.organizerId].filter((userId) => userId !== me);
    await notifyUsers(ctx, [...new Set(told)], {
      type: TYPE,
      title: withdrawing
        ? `Terminanfrage zurückgezogen: ${row.title}`
        : `Termin abgesagt: ${row.title}`,
      body: [formatWhen(row.start, row.end), note].filter(Boolean).join(" · "),
      link: LINK,
    });
  },
});
