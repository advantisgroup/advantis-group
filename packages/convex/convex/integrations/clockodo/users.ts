"use node";

import { v } from "convex/values";

import { action } from "../../_generated/server";
import { requireManagerAction } from "../lib/auth";
import { clockodoFetch } from "./client";

/**
 * Wire shape of `/api/v3/users` (snake_case). Confirmed against a live
 * account's raw responses — Clockodo's actual user object is considerably
 * larger than the public docs suggest (employment dates, reporting line,
 * absence/customer permissions, language, flextime exemption, plus
 * reference ids for teams/access-groups/work-time-regulations this client
 * doesn't yet expose since they'd need their own list endpoints to be
 * meaningful as pickers rather than raw numbers).
 */
interface ClockodoUserWire {
  id: number;
  name: string;
  number?: string | null;
  email: string;
  active?: boolean;
  role?: string;
  start_date?: string | null;
  exit_date?: string | null;
  boss?: number | null;
  language?: string;
  can_generally_see_absences?: boolean;
  can_generally_manage_absences?: boolean;
  can_add_customers?: boolean;
  exempt_from_flextime?: boolean;
}

export interface ClockodoUser {
  id: number;
  name: string;
  number?: string;
  email: string;
  active?: boolean;
  role?: string;
  startDate: string | null;
  exitDate: string | null;
  boss: number | null;
  language?: string;
  canGenerallySeeAbsences?: boolean;
  canGenerallyManageAbsences?: boolean;
  canAddCustomers?: boolean;
  exemptFromFlextime?: boolean;
}

function toClockodoUser(u: ClockodoUserWire): ClockodoUser {
  return {
    id: u.id,
    name: u.name,
    number: u.number ?? undefined,
    email: u.email,
    active: u.active,
    role: u.role,
    startDate: u.start_date ?? null,
    exitDate: u.exit_date ?? null,
    boss: u.boss ?? null,
    language: u.language,
    canGenerallySeeAbsences: u.can_generally_see_absences,
    canGenerallyManageAbsences: u.can_generally_manage_absences,
    canAddCustomers: u.can_add_customers,
    exemptFromFlextime: u.exempt_from_flextime,
  };
}

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Weekday = (typeof WEEKDAYS)[number];
type WeekHours = Record<Weekday, number>;

/**
 * Target-hours history row (Sollstunden). Clockodo models this as a dated
 * history of *per-weekday* hours — there is no flat weekly-total field on
 * the wire; the total is derived by summing the seven day fields. Creating
 * a new period doesn't edit in place — it adds a new dated row, and you
 * choose whether it takes effect immediately (today) or from a future date,
 * leaving earlier periods in the history untouched.
 */
type ClockodoTargetHourWire = {
  id: number;
  users_id: number;
  type: "weekly" | "monthly";
  date_since: string;
  date_until: string | null;
} & Partial<WeekHours>;

export interface ClockodoTargetHour {
  id: number;
  clockodoUserId: number;
  dateSince: string;
  dateUntil: string | null;
  days: WeekHours;
  weeklyTotal: number;
}

function toTargetHour(row: ClockodoTargetHourWire): ClockodoTargetHour {
  const days = Object.fromEntries(WEEKDAYS.map((day) => [day, row[day] ?? 0])) as WeekHours;
  return {
    id: row.id,
    clockodoUserId: row.users_id,
    dateSince: row.date_since,
    dateUntil: row.date_until ?? null,
    days,
    weeklyTotal: WEEKDAYS.reduce((sum, day) => sum + days[day], 0),
  };
}

/** Holidays-quota row (Urlaubsanspruch) — also a dated history, one row per
 * entitlement year. List/get responses wrap the payload in `data`. */
interface ClockodoHolidaysQuotaWire {
  id: number;
  users_id: number;
  year_since: number;
  year_until: number | null;
  count: number;
  note?: string | null;
}

export interface ClockodoHolidaysQuota {
  id: number;
  clockodoUserId: number;
  yearSince: number;
  yearUntil: number | null;
  daysPerYear: number;
  note?: string;
}

function toHolidaysQuota(row: ClockodoHolidaysQuotaWire): ClockodoHolidaysQuota {
  return {
    id: row.id,
    clockodoUserId: row.users_id,
    yearSince: row.year_since,
    yearUntil: row.year_until ?? null,
    daysPerYear: row.count,
    note: row.note ?? undefined,
  };
}

/** All Clockodo users. Manager+. */
export const listClockodoUsers = action({
  args: {},
  handler: async (ctx): Promise<ClockodoUser[]> => {
    await requireManagerAction(ctx);
    const body = await clockodoFetch<{ data?: ClockodoUserWire[] }>(
      "/api/v3/users?items_per_page=1000",
    );
    return (body.data ?? []).map(toClockodoUser);
  },
});

/** One Clockodo user plus their target-hours and holidays-quota history. Manager+. */
export const getClockodoUserDetail = action({
  args: { clockodoUserId: v.number() },
  handler: async (
    ctx,
    { clockodoUserId },
  ): Promise<{
    user: ClockodoUser;
    targetHours: ClockodoTargetHour[];
    holidaysQuota: ClockodoHolidaysQuota[];
  }> => {
    await requireManagerAction(ctx);
    const userBody = await clockodoFetch<{ data: ClockodoUserWire }>(
      `/api/v3/users/${clockodoUserId}`,
    );

    // Target-hours/holidays-quota are supplementary — a bad path here must
    // not take down the whole user list. Each degrades to an empty history
    // (rendered as "not set" in the UI) instead of failing the row.
    const [targetHours, holidaysQuota] = await Promise.all([
      clockodoFetch<{ targethours?: ClockodoTargetHourWire[] }>(
        `/api/targethours?users_id=${clockodoUserId}`,
      )
        .then((body) => (body.targethours ?? []).map(toTargetHour))
        .catch((err) => {
          console.error(`[clockodo] target-hours fetch failed for user ${clockodoUserId}:`, err);
          return [];
        }),
      clockodoFetch<{ data?: ClockodoHolidaysQuotaWire[] }>(
        `/api/v2/holidaysQuota?users_id=${clockodoUserId}`,
      )
        .then((body) => (body.data ?? []).map(toHolidaysQuota))
        .catch((err) => {
          console.error(`[clockodo] holidays-quota fetch failed for user ${clockodoUserId}:`, err);
          return [];
        }),
    ]);

    return {
      user: toClockodoUser(userBody.data),
      targetHours,
      holidaysQuota,
    };
  },
});

/**
 * Create a Clockodo user, optionally seeding an initial target-hours period
 * (per-weekday hours) and vacation entitlement in the same flow — both are
 * separate dated-history writes in Clockodo, done right after creation so a
 * manager gets the full "create + configure" flow in one form submit.
 */
export const createClockodoUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    number: v.optional(v.string()),
    targetHoursDateSince: v.optional(v.string()),
    monday: v.optional(v.number()),
    tuesday: v.optional(v.number()),
    wednesday: v.optional(v.number()),
    thursday: v.optional(v.number()),
    friday: v.optional(v.number()),
    saturday: v.optional(v.number()),
    sunday: v.optional(v.number()),
    vacationDaysPerYear: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ clockodoUserId: number }> => {
    await requireManagerAction(ctx);
    const created = await clockodoFetch<{ data: ClockodoUserWire }>("/api/v3/users", {
      method: "POST",
      body: { name: args.name, email: args.email, number: args.number },
    });
    const clockodoUserId = created.data.id;

    const hasTargetHours = WEEKDAYS.some((day) => args[day] !== undefined);
    if (hasTargetHours) {
      await clockodoFetch("/api/targethours", {
        method: "POST",
        body: {
          users_id: clockodoUserId,
          type: "weekly",
          date_since: args.targetHoursDateSince ?? new Date().toISOString().slice(0, 10),
          ...Object.fromEntries(WEEKDAYS.map((day) => [day, args[day] ?? 0])),
        },
      });
    }
    if (args.vacationDaysPerYear !== undefined) {
      await clockodoFetch("/api/v2/holidaysQuota", {
        method: "POST",
        body: {
          users_id: clockodoUserId,
          year_since: new Date().getFullYear(),
          count: args.vacationDaysPerYear,
        },
      });
    }

    return { clockodoUserId };
  },
});

/**
 * Edit a Clockodo user's profile, employment, and permission fields.
 * Manager+. Only the fields provided are sent (a PUT with a partial body),
 * so this never clobbers fields the caller didn't mean to touch.
 */
export const updateClockodoUser = action({
  args: {
    clockodoUserId: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    number: v.optional(v.string()),
    active: v.optional(v.boolean()),
    role: v.optional(v.string()),
    startDate: v.optional(v.string()),
    exitDate: v.optional(v.string()),
    boss: v.optional(v.number()),
    language: v.optional(v.string()),
    canGenerallySeeAbsences: v.optional(v.boolean()),
    canGenerallyManageAbsences: v.optional(v.boolean()),
    canAddCustomers: v.optional(v.boolean()),
    exemptFromFlextime: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireManagerAction(ctx);
    const { clockodoUserId, ...patch } = args;
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.number !== undefined) body.number = patch.number;
    if (patch.active !== undefined) body.active = patch.active;
    if (patch.role !== undefined) body.role = patch.role;
    if (patch.startDate !== undefined) body.start_date = patch.startDate;
    if (patch.exitDate !== undefined) body.exit_date = patch.exitDate;
    if (patch.boss !== undefined) body.boss = patch.boss;
    if (patch.language !== undefined) body.language = patch.language;
    if (patch.canGenerallySeeAbsences !== undefined) {
      body.can_generally_see_absences = patch.canGenerallySeeAbsences;
    }
    if (patch.canGenerallyManageAbsences !== undefined) {
      body.can_generally_manage_absences = patch.canGenerallyManageAbsences;
    }
    if (patch.canAddCustomers !== undefined) {
      body.can_add_customers = patch.canAddCustomers;
    }
    if (patch.exemptFromFlextime !== undefined) {
      body.exempt_from_flextime = patch.exemptFromFlextime;
    }
    await clockodoFetch(`/api/v3/users/${clockodoUserId}`, {
      method: "PUT",
      body,
    });
  },
});

/**
 * Start a new target-hours (Sollstunden) period for a user — per-weekday
 * hours, effective from `dateSince` (defaults to today; pass a future date
 * to schedule a change rather than apply it immediately). Earlier periods
 * stay in the history untouched.
 */
export const setTargetHours = action({
  args: {
    clockodoUserId: v.number(),
    dateSince: v.optional(v.string()),
    monday: v.number(),
    tuesday: v.number(),
    wednesday: v.number(),
    thursday: v.number(),
    friday: v.number(),
    saturday: v.number(),
    sunday: v.number(),
  },
  handler: async (ctx, { clockodoUserId, dateSince, ...days }): Promise<void> => {
    await requireManagerAction(ctx);
    await clockodoFetch("/api/targethours", {
      method: "POST",
      body: {
        users_id: clockodoUserId,
        type: "weekly",
        date_since: dateSince ?? new Date().toISOString().slice(0, 10),
        ...days,
      },
    });
  },
});

/** Start a new holidays-quota (Urlaubsanspruch) entitlement year for a user. Manager+. */
export const setVacationEntitlement = action({
  args: {
    clockodoUserId: v.number(),
    daysPerYear: v.number(),
    yearSince: v.optional(v.number()),
  },
  handler: async (ctx, { clockodoUserId, daysPerYear, yearSince }): Promise<void> => {
    await requireManagerAction(ctx);
    await clockodoFetch("/api/v2/holidaysQuota", {
      method: "POST",
      body: {
        users_id: clockodoUserId,
        year_since: yearSince ?? new Date().getFullYear(),
        count: daysPerYear,
      },
    });
  },
});
