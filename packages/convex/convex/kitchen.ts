import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { userMutation, userQuery } from "./functions";
import { canDoKitchen, type KitchenPerson, proposeKitchenPlan } from "./lib/kitchenPlan";
import { createNotification } from "./lib/notify";
import { addDays, berlinDate, berlinInstant, datesBetween, isIsoDate } from "./time/lib/berlin";
import { bavarianHolidays } from "./time/lib/holidays";
import { displayName, loadAbsences, loadHolidays, loadSchedules } from "./time/lib/store";

/**
 * Küchendienst: one person per working day cleans the kitchen before closing
 * time. Admins plan it, everyone sees it in the calendar, and a duty only
 * changes hands once the colleague has accepted.
 */

const LINK = "/calendar";
const TYPE = "kitchen_duty";
const MAX_PLAN_DAYS = 92;
const ROTATION_MEMORY_DAYS = 183;

type UserId = Id<"users">;

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const dayLabel = (date: string) => dayFormat.format(berlinInstant(date, 12 * 60));
const today = () => berlinDate(Date.now());

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** Andrea Reichl, Jörg Endres and Kaleb Daniel log in from other domains and
 *  stay out of the rotation until an admin says otherwise. */
const inDefaultRotation = (user: Doc<"users">) =>
  user.email.toLowerCase().endsWith("@advantisgroup.de");

async function activeUsers(ctx: QueryCtx) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((user) => user.status === "active")
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "de"));
}

async function rotation(ctx: QueryCtx) {
  const [users, settings] = await Promise.all([
    activeUsers(ctx),
    ctx.db.query("kitchenSettings").first(),
  ]);
  const members = settings
    ? users.filter((user) => settings.memberIds.includes(user._id))
    : users.filter(inDefaultRotation);
  return { users, members };
}

async function loadPeople(ctx: QueryCtx, ids: UserId[]): Promise<KitchenPerson<UserId>[]> {
  return Promise.all(
    ids.map(async (userId) => {
      const [schedules, absences] = await Promise.all([
        loadSchedules(ctx, userId),
        loadAbsences(ctx, userId),
      ]);
      return {
        userId,
        schedules,
        absences: absences.filter((row) => row.status === "approved" || row.status === "pending"),
      };
    }),
  );
}

async function loadDaysOff(ctx: QueryCtx, from: string, to: string) {
  const [holidays, closures] = await Promise.all([
    loadHolidays(ctx, from, to),
    ctx.db
      .query("officeClosures")
      .withIndex("by_endDate", (q) => q.gte("endDate", from))
      .collect(),
  ]);
  const off = new Set(holidays.filter((row) => row.fraction > 0).map((row) => row.date));
  // A year's holidays are only seeded on 1 December before it starts, and a
  // plan can reach further ahead than that.
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const seeded = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`))
      .first();
    if (seeded) continue;
    for (const seed of bavarianHolidays(year)) {
      if (seed.date >= from && seed.date <= to) off.add(seed.date);
    }
  }
  for (const closure of closures) {
    if (closure.startDate > to) continue;
    const start = closure.startDate < from ? from : closure.startDate;
    const end = closure.endDate > to ? to : closure.endDate;
    for (const date of datesBetween(start, end)) off.add(date);
  }
  return off;
}

async function canDo(ctx: QueryCtx, userId: UserId, date: string) {
  const [[person], off] = await Promise.all([
    loadPeople(ctx, [userId]),
    loadDaysOff(ctx, date, date),
  ]);
  return canDoKitchen(person, date, off.has(date));
}

function dutiesBetween(ctx: QueryCtx, from: string, to: string) {
  return ctx.db
    .query("kitchenDuties")
    .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
    .collect();
}

function dutyOn(ctx: QueryCtx, date: string) {
  return ctx.db
    .query("kitchenDuties")
    .withIndex("by_date", (q) => q.eq("date", date))
    .first();
}

function openSwaps(ctx: QueryCtx) {
  return ctx.db
    .query("kitchenSwaps")
    .withIndex("by_status", (q) => q.eq("status", "requested"))
    .collect();
}

const touches = (swap: Doc<"kitchenSwaps">, date: string) =>
  swap.date === date || swap.otherDate === date;

function checkRange(from: string, to: string) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) fail("bad_request", "Invalid period");
  if (from < today()) fail("bad_request", "The period has already started");
  if (datesBetween(from, to).length > MAX_PLAN_DAYS) fail("bad_request", "At most 92 days");
}

async function chosenMembers(ctx: QueryCtx, memberIds: UserId[]) {
  const wanted = new Set(memberIds);
  return (await activeUsers(ctx)).filter((user) => wanted.has(user._id));
}

/** A duty that moved makes any open request on that day pointless. */
async function cancelOpenSwaps(ctx: MutationCtx, dates: ReadonlySet<string>) {
  if (dates.size === 0) return;
  for (const swap of await openSwaps(ctx)) {
    if (![...dates].some((date) => touches(swap, date))) continue;
    await ctx.db.patch(swap._id, { status: "cancelled", decidedAt: Date.now() });
    const body = dayLabel(swap.date);
    for (const userId of [swap.fromUserId, swap.toUserId]) {
      await createNotification(ctx, {
        userId,
        type: TYPE,
        title: "Küchendienst-Tausch hinfällig – der Plan hat sich geändert",
        body,
        link: LINK,
      });
    }
  }
}

type Change = { date: string; before: UserId | null; after: UserId | null };

async function announceChanges(ctx: MutationCtx, changes: Change[]) {
  const collect = (pick: (change: Change) => UserId | null) => {
    const byUser = new Map<UserId, string[]>();
    for (const change of changes) {
      const userId = pick(change);
      if (userId) byUser.set(userId, [...(byUser.get(userId) ?? []), dayLabel(change.date)]);
    }
    return byUser;
  };
  const send = async (byUser: Map<UserId, string[]>, title: string) => {
    for (const [userId, days] of byUser) {
      await createNotification(ctx, {
        userId,
        type: TYPE,
        title,
        body: days.join(", "),
        link: LINK,
      });
    }
  };
  await send(
    collect((change) => change.after),
    "Du bist für den Küchendienst eingeteilt",
  );
  await send(
    collect((change) => change.before),
    "Küchendienst entfällt für dich",
  );
}

/** Whether the caller has the kitchen on this Berlin date. */
export const myDay = userQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => (await dutyOn(ctx, date))?.userId === ctx.caller.id,
});

/** The duties of a period, as the calendar shows them. */
export const forRange = userQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const me = ctx.caller.id;
    const [rows, open] = await Promise.all([dutiesBetween(ctx, from, to), openSwaps(ctx)]);
    const ids = [...new Set(rows.map((row) => row.userId))];
    const users = new Map(
      (await Promise.all(ids.map((id) => ctx.db.get(id))))
        .filter((user): user is Doc<"users"> => user !== null)
        .map((user) => [user._id, user]),
    );
    // Admins only: for anyone else this would reveal who is off sick.
    const people = ctx.caller.isAdmin
      ? new Map((await loadPeople(ctx, ids)).map((person) => [person.userId, person]))
      : null;
    const off = people ? await loadDaysOff(ctx, from, to) : null;
    const now = today();
    return rows.map((row) => {
      const person = people?.get(row.userId);
      return {
        _id: row._id,
        date: row.date,
        userId: row.userId,
        name: displayName(users.get(row.userId) ?? null),
        isMine: row.userId === me,
        past: row.date < now,
        swapPending: open.some((swap) => touches(swap, row.date)),
        cannotDo:
          !!person && row.date >= now && !canDoKitchen(person, row.date, off!.has(row.date)),
      };
    });
  },
});

/** Everyone who can be chosen for the rotation, and who currently is in it. */
export const planOptions = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const { users, members } = await rotation(ctx);
    const inRotation = new Set(members.map((user) => user._id));
    return users.map((user) => ({
      userId: user._id,
      name: displayName(user),
      selected: inRotation.has(user._id),
    }));
  },
});

/** The rotation's proposal for a period, before anything is saved. */
export const preview = userQuery({
  role: "admin",
  args: { from: v.string(), to: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { from, to, memberIds }) => {
    checkRange(from, to);
    const members = await chosenMembers(ctx, memberIds);
    const [people, daysOff, existing, earlier] = await Promise.all([
      loadPeople(
        ctx,
        members.map((user) => user._id),
      ),
      loadDaysOff(ctx, from, to),
      dutiesBetween(ctx, from, to),
      dutiesBetween(ctx, addDays(from, -ROTATION_MEMORY_DAYS), addDays(from, -1)),
    ]);
    return proposeKitchenPlan<UserId>({
      dates: datesBetween(from, to),
      people,
      daysOff,
      existing: new Map(existing.map((row) => [row.date, row.userId])),
      lastDuty: new Map(earlier.map((row) => [row.userId, row.date])),
    });
  },
});

/** Writes a period as reviewed by the admin; days left out are cleared. */
export const savePlan = userMutation({
  role: "admin",
  args: {
    from: v.string(),
    to: v.string(),
    memberIds: v.array(v.id("users")),
    days: v.array(v.object({ date: v.string(), userId: v.id("users") })),
  },
  handler: async (ctx, { from, to, memberIds, days }) => {
    checkRange(from, to);
    const members = await chosenMembers(ctx, memberIds);
    if (members.length === 0) fail("bad_request", "Choose who is in the rotation");
    const allowed = new Set(members.map((user) => user._id));
    const wanted = new Map(days.map((day) => [day.date, day.userId]));
    for (const day of days) {
      if (day.date < from || day.date > to) fail("bad_request", "Day outside the period");
      if (!allowed.has(day.userId)) fail("bad_request", "Person is not in the rotation");
    }

    const now = Date.now();
    const assignedBy = ctx.caller.id;
    const existing = new Map((await dutiesBetween(ctx, from, to)).map((row) => [row.date, row]));
    const changes: Change[] = [];
    for (const [date, row] of existing) {
      const userId = wanted.get(date);
      if (userId === row.userId) continue;
      if (userId) await ctx.db.patch(row._id, { userId, assignedBy, updatedAt: now });
      else await ctx.db.delete(row._id);
      changes.push({ date, before: row.userId, after: userId ?? null });
    }
    for (const [date, userId] of wanted) {
      if (existing.has(date)) continue;
      await ctx.db.insert("kitchenDuties", { date, userId, assignedBy, updatedAt: now });
      changes.push({ date, before: null, after: userId });
    }

    const settings = await ctx.db.query("kitchenSettings").first();
    const saved = { memberIds: [...allowed], updatedBy: assignedBy, updatedAt: now };
    if (settings) await ctx.db.patch(settings._id, saved);
    else await ctx.db.insert("kitchenSettings", saved);

    await cancelOpenSwaps(ctx, new Set(changes.map((change) => change.date)));
    await announceChanges(ctx, changes);
    return { changed: changes.length };
  },
});

/** An admin hands one day to someone else, or clears it. */
export const setDay = userMutation({
  role: "admin",
  args: { date: v.string(), userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, { date, userId }) => {
    if (!isIsoDate(date) || date < today()) fail("bad_request", "That day has passed");
    const row = await dutyOn(ctx, date);
    const before = row?.userId ?? null;
    if (before === userId) return;
    if (userId) {
      const user = await ctx.db.get(userId);
      if (user?.status !== "active") fail("bad_request", "Person is not active");
    }
    const assignedBy = ctx.caller.id;
    const updatedAt = Date.now();
    if (row && userId) await ctx.db.patch(row._id, { userId, assignedBy, updatedAt });
    else if (row) await ctx.db.delete(row._id);
    else if (userId) await ctx.db.insert("kitchenDuties", { date, userId, assignedBy, updatedAt });
    await cancelOpenSwaps(ctx, new Set([date]));
    await announceChanges(ctx, [{ date, before, after: userId }]);
  },
});

/** Who the caller could hand this day to, and which of their days fit in return. */
export const swapOptions = userQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const me = ctx.caller.id;
    const now = today();
    const horizon = addDays(now, MAX_PLAN_DAYS);
    const duty = await dutyOn(ctx, date);
    if (duty?.userId !== me || date < now) return [];
    const [{ members }, upcoming, open, offToday] = await Promise.all([
      rotation(ctx),
      dutiesBetween(ctx, now, horizon),
      openSwaps(ctx),
      loadDaysOff(ctx, date, date),
    ]);
    if (offToday.has(date)) return [];
    const colleagues = members.filter((user) => user._id !== me);
    const [people, [mine], off] = await Promise.all([
      loadPeople(
        ctx,
        colleagues.map((user) => user._id),
      ),
      loadPeople(ctx, [me]),
      loadDaysOff(ctx, now, horizon),
    ]);
    return colleagues.flatMap((user, index) => {
      if (!canDoKitchen(people[index], date, false)) return [];
      const days = upcoming
        .filter(
          (row) =>
            row.userId === user._id &&
            !open.some((swap) => touches(swap, row.date)) &&
            canDoKitchen(mine, row.date, off.has(row.date)),
        )
        .map((row) => row.date);
      return [{ userId: user._id, name: displayName(user), days }];
    });
  },
});

/** Ask a colleague to take over a day, optionally for one of theirs. */
export const requestSwap = userMutation({
  args: { date: v.string(), toUserId: v.id("users"), otherDate: v.optional(v.string()) },
  handler: async (ctx, { date, toUserId, otherDate }) => {
    const me = ctx.caller.id;
    const now = today();
    if (date < now || (otherDate && otherDate < now)) fail("bad_request", "That day has passed");
    if (toUserId === me) fail("bad_request", "Choose a colleague");
    if ((await dutyOn(ctx, date))?.userId !== me) fail("forbidden", "Not your duty");
    if (otherDate && (await dutyOn(ctx, otherDate))?.userId !== toUserId) {
      fail("conflict", "The colleague no longer has that day");
    }
    if (!(await canDo(ctx, toUserId, date))) fail("conflict", "The colleague can't do that day");
    if (otherDate && !(await canDo(ctx, me, otherDate))) {
      fail("conflict", "You can't do that day");
    }
    const open = await openSwaps(ctx);
    if (open.some((swap) => touches(swap, date) || (!!otherDate && touches(swap, otherDate)))) {
      fail("conflict", "A request for that day is already open");
    }
    const id = await ctx.db.insert("kitchenSwaps", {
      date,
      fromUserId: me,
      toUserId,
      otherDate,
      status: "requested",
      createdAt: Date.now(),
    });
    await createNotification(ctx, {
      userId: toUserId,
      type: TYPE,
      title: `${displayName(ctx.caller.user)} fragt wegen Küchendienst`,
      body: otherDate
        ? `Tausch: du ${dayLabel(date)}, dafür ${displayName(ctx.caller.user)} ${dayLabel(otherDate)}`
        : `Übernimmst du ${dayLabel(date)}?`,
      link: LINK,
    });
    return id;
  },
});

/** Requests waiting for the caller's answer, and the caller's own open ones. */
export const inbox = userQuery({
  args: {},
  handler: async (ctx) => {
    const me = ctx.caller.id;
    const open = await openSwaps(ctx);
    const shape = async (swap: Doc<"kitchenSwaps">) => ({
      _id: swap._id,
      date: swap.date,
      otherDate: swap.otherDate ?? null,
      fromName: displayName(await ctx.db.get(swap.fromUserId)),
      toName: displayName(await ctx.db.get(swap.toUserId)),
    });
    const byDate = (a: Doc<"kitchenSwaps">, b: Doc<"kitchenSwaps">) => a.date.localeCompare(b.date);
    return {
      toAnswer: await Promise.all(
        open
          .filter((swap) => swap.toUserId === me)
          .sort(byDate)
          .map(shape),
      ),
      mine: await Promise.all(
        open
          .filter((swap) => swap.fromUserId === me)
          .sort(byDate)
          .map(shape),
      ),
    };
  },
});

/** The asked colleague accepts or declines; only an acceptance moves a duty. */
export const answerSwap = userMutation({
  args: { id: v.id("kitchenSwaps"), accept: v.boolean() },
  handler: async (ctx, { id, accept }) => {
    const swap = await ctx.db.get(id);
    if (!swap || swap.status !== "requested") fail("conflict", "Not waiting for an answer");
    if (swap.toUserId !== ctx.caller.id) fail("forbidden", "Only the person asked can answer");
    const decidedAt = Date.now();
    const who = displayName(ctx.caller.user);
    if (!accept) {
      await ctx.db.patch(id, { status: "declined", decidedAt });
      await createNotification(ctx, {
        userId: swap.fromUserId,
        type: TYPE,
        title: `${who} kann den Küchendienst nicht übernehmen`,
        body: dayLabel(swap.date),
        link: LINK,
      });
      return;
    }

    const duty = await dutyOn(ctx, swap.date);
    const other = swap.otherDate ? await dutyOn(ctx, swap.otherDate) : null;
    if (
      duty?.userId !== swap.fromUserId ||
      (swap.otherDate && other?.userId !== swap.toUserId) ||
      !(await canDo(ctx, swap.toUserId, swap.date)) ||
      (swap.otherDate && !(await canDo(ctx, swap.fromUserId, swap.otherDate)))
    ) {
      fail("conflict", "The plan has changed");
    }

    await ctx.db.patch(id, { status: "accepted", decidedAt });
    await ctx.db.patch(duty._id, { userId: swap.toUserId, updatedAt: decidedAt });
    if (other) await ctx.db.patch(other._id, { userId: swap.fromUserId, updatedAt: decidedAt });
    await cancelOpenSwaps(ctx, new Set(swap.otherDate ? [swap.date, swap.otherDate] : [swap.date]));
    await createNotification(ctx, {
      userId: swap.fromUserId,
      type: TYPE,
      title: `${who} hat den Küchendienst übernommen`,
      body: swap.otherDate
        ? `${dayLabel(swap.date)} ist weg, dafür hast du ${dayLabel(swap.otherDate)}`
        : dayLabel(swap.date),
      link: LINK,
    });
  },
});

export const cancelSwap = userMutation({
  args: { id: v.id("kitchenSwaps") },
  handler: async (ctx, { id }) => {
    const swap = await ctx.db.get(id);
    if (!swap || swap.status !== "requested") fail("conflict", "Not open any more");
    if (swap.fromUserId !== ctx.caller.id) fail("forbidden", "Not your request");
    await ctx.db.patch(id, { status: "cancelled", decidedAt: Date.now() });
    await createNotification(ctx, {
      userId: swap.toUserId,
      type: TYPE,
      title: "Küchendienst-Anfrage zurückgezogen",
      body: dayLabel(swap.date),
      link: LINK,
    });
  },
});
