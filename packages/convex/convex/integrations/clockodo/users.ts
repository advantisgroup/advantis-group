"use node";

import { v } from "convex/values";

import { action } from "../../_generated/server";
import { requireManagerAction } from "../lib/auth";
import { clockodoFetch } from "./client";

/** Wire shape of `/api/v2/users` (snake_case, per Clockodo's REST API). */
interface ClockodoUserWire {
  id: number;
  name: string;
  number?: string;
  email: string;
  active?: boolean;
  role?: number;
}

export interface ClockodoUser {
  id: number;
  name: string;
  number?: string;
  email: string;
  active?: boolean;
  role?: number;
}

function toClockodoUser(u: ClockodoUserWire): ClockodoUser {
  return {
    id: u.id,
    name: u.name,
    number: u.number,
    email: u.email,
    active: u.active,
    role: u.role,
  };
}

/**
 * Target-hours history row (Sollstunden). Clockodo models this as a dated
 * history, not a flat field — creating/editing adds a new period rather than
 * overwriting a single number. The per-weekday breakdown fields (beyond
 * `hours_total`) are unverified against a live account; this client only
 * uses the weekly total, which the SDK docs confirm exists.
 */
interface ClockodoTargetHourWire {
  id: number;
  users_id: number;
  type: number;
  date_since: string;
  date_until?: string | null;
  hours_total?: number;
  compensation_monthly?: number;
}

export interface ClockodoTargetHour {
  id: number;
  clockodoUserId: number;
  dateSince: string;
  dateUntil: string | null;
  weeklyHours: number | null;
}

function toTargetHour(row: ClockodoTargetHourWire): ClockodoTargetHour {
  return {
    id: row.id,
    clockodoUserId: row.users_id,
    dateSince: row.date_since,
    dateUntil: row.date_until ?? null,
    weeklyHours: row.hours_total ?? null,
  };
}

/** Holidays-quota row (Urlaubsanspruch) — also a dated history, one row per
 * entitlement year. */
interface ClockodoHolidaysQuotaWire {
  id: number;
  users_id: number;
  year_since: number;
  count: number;
  note?: string;
}

export interface ClockodoHolidaysQuota {
  id: number;
  clockodoUserId: number;
  yearSince: number;
  daysPerYear: number;
  note?: string;
}

function toHolidaysQuota(
  row: ClockodoHolidaysQuotaWire
): ClockodoHolidaysQuota {
  return {
    id: row.id,
    clockodoUserId: row.users_id,
    yearSince: row.year_since,
    daysPerYear: row.count,
    note: row.note,
  };
}

/** All Clockodo users. Manager+. */
export const listClockodoUsers = action({
  args: {},
  handler: async (ctx): Promise<ClockodoUser[]> => {
    await requireManagerAction(ctx);
    const body = await clockodoFetch<{ users?: ClockodoUserWire[] }>(
      "/api/v2/users"
    );
    return (body.users ?? []).map(toClockodoUser);
  },
});

/** One Clockodo user plus their target-hours and holidays-quota history. Manager+. */
export const getClockodoUserDetail = action({
  args: { clockodoUserId: v.number() },
  handler: async (
    ctx,
    { clockodoUserId }
  ): Promise<{
    user: ClockodoUser;
    targetHours: ClockodoTargetHour[];
    holidaysQuota: ClockodoHolidaysQuota[];
  }> => {
    await requireManagerAction(ctx);
    const userBody = await clockodoFetch<{ user: ClockodoUserWire }>(
      `/api/v2/users/${clockodoUserId}`
    );

    // Target-hours/holidays-quota are supplementary — the account's actual
    // endpoint shape for these two is unverified (see `client.ts`), so a
    // wrong path here must not take down the whole user list. Each degrades
    // to an empty history (rendered as "not set" in the UI) instead of
    // failing the row.
    const [targetHours, holidaysQuota] = await Promise.all([
      clockodoFetch<{ targethours?: ClockodoTargetHourWire[] }>(
        `/api/targethours?users_id=${clockodoUserId}`
      )
        .then(body => (body.targethours ?? []).map(toTargetHour))
        .catch(err => {
          console.error(
            `[clockodo] target-hours fetch failed for user ${clockodoUserId}:`,
            err
          );
          return [];
        }),
      clockodoFetch<{ holidaysquota?: ClockodoHolidaysQuotaWire[] }>(
        `/api/holidaysquota?users_id=${clockodoUserId}`
      )
        .then(body => (body.holidaysquota ?? []).map(toHolidaysQuota))
        .catch(err => {
          console.error(
            `[clockodo] holidays-quota fetch failed for user ${clockodoUserId}:`,
            err
          );
          return [];
        }),
    ]);

    return {
      user: toClockodoUser(userBody.user),
      targetHours,
      holidaysQuota,
    };
  },
});

/**
 * Create a Clockodo user, optionally seeding their initial target hours and
 * vacation entitlement in the same flow (both are separate dated-history
 * writes in Clockodo, done right after creation so a manager gets the full
 * "create + configure" flow in one form submit).
 */
export const createClockodoUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    number: v.optional(v.string()),
    weeklyHours: v.optional(v.number()),
    vacationDaysPerYear: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { name, email, number, weeklyHours, vacationDaysPerYear }
  ): Promise<{ clockodoUserId: number }> => {
    await requireManagerAction(ctx);
    const created = await clockodoFetch<{ user: ClockodoUserWire }>(
      "/api/v2/users",
      { method: "POST", body: { name, email, number } }
    );
    const clockodoUserId = created.user.id;
    const today = new Date().toISOString().slice(0, 10);

    if (weeklyHours !== undefined) {
      await clockodoFetch("/api/targethour", {
        method: "POST",
        body: {
          users_id: clockodoUserId,
          type: 1,
          date_since: today,
          hours_total: weeklyHours,
        },
      });
    }
    if (vacationDaysPerYear !== undefined) {
      await clockodoFetch("/api/holidaysquota", {
        method: "POST",
        body: {
          users_id: clockodoUserId,
          year_since: new Date().getFullYear(),
          count: vacationDaysPerYear,
        },
      });
    }

    return { clockodoUserId };
  },
});

/** Edit a Clockodo user's core profile fields. Manager+. */
export const updateClockodoUser = action({
  args: {
    clockodoUserId: v.number(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    number: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { clockodoUserId, ...patch }): Promise<void> => {
    await requireManagerAction(ctx);
    await clockodoFetch(`/api/v2/users/${clockodoUserId}`, {
      method: "PUT",
      body: patch,
    });
  },
});

/** Start a new target-hours (Sollstunden) period for a user. Manager+. */
export const setTargetHours = action({
  args: {
    clockodoUserId: v.number(),
    weeklyHours: v.number(),
    dateSince: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { clockodoUserId, weeklyHours, dateSince }
  ): Promise<void> => {
    await requireManagerAction(ctx);
    await clockodoFetch("/api/targethour", {
      method: "POST",
      body: {
        users_id: clockodoUserId,
        type: 1,
        date_since: dateSince ?? new Date().toISOString().slice(0, 10),
        hours_total: weeklyHours,
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
  handler: async (
    ctx,
    { clockodoUserId, daysPerYear, yearSince }
  ): Promise<void> => {
    await requireManagerAction(ctx);
    await clockodoFetch("/api/holidaysquota", {
      method: "POST",
      body: {
        users_id: clockodoUserId,
        year_since: yearSince ?? new Date().getFullYear(),
        count: daysPerYear,
      },
    });
  },
});
