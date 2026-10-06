import { v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { internalMutation, userMutation, userQuery } from "../functions";
import { assertTimeAccess, assertTimeWrite } from "./lib/mode";
import { isIsoDate } from "./lib/berlin";
import { bavarianHolidays, HOLIDAY_REGION } from "./lib/holidays";
import {
  assertDatesOpen,
  invalidateTotals,
  loadHolidays,
  timeError,
  writeAudit,
} from "./lib/store";

/** Holidays and company days off, seeded per year and editable by admins. */

export const list = userQuery({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    assertTimeAccess(ctx);
    const rows = await loadHolidays(ctx, `${year}-01-01`, `${year}-12-31`);
    return rows.map(({ _id, date, name, fraction, region }) => ({
      _id,
      date,
      name,
      fraction,
      region,
    }));
  },
});

const fractionValidator = v.union(v.literal(1), v.literal(0.5));

export const save = userMutation({
  role: "admin",
  args: {
    id: v.optional(v.id("holidays")),
    date: v.string(),
    name: v.string(),
    fraction: fractionValidator,
  },
  handler: async (ctx, args) => {
    await assertTimeWrite(ctx);
    const name = args.name.trim();
    if (!isIsoDate(args.date) || !name) {
      throw timeError("bad_request", "invalid_range", "A date and a name are required");
    }
    const existing = args.id ? await ctx.db.get(args.id) : null;
    await assertDatesOpen(ctx, [args.date, ...(existing ? [existing.date] : [])]);
    const sameDay = (await loadHolidays(ctx, args.date, args.date)).find(
      (row) => row._id !== args.id,
    );
    if (sameDay) throw timeError("conflict", "overlap", "There already is a holiday that day");
    const row = {
      date: args.date,
      name,
      fraction: args.fraction,
      region: existing?.region ?? HOLIDAY_REGION,
      updatedAt: Date.now(),
    };
    let id = existing?._id;
    if (id) await ctx.db.replace(id, row);
    else id = await ctx.db.insert("holidays", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      entity: "holiday",
      entityId: id,
      action: existing ? "update" : "create",
      before: existing ?? undefined,
      after: row,
    });
    await invalidateTotals(ctx, null, [args.date, ...(existing ? [existing.date] : [])]);
    return id;
  },
});

export const remove = userMutation({
  role: "admin",
  args: { id: v.id("holidays") },
  handler: async (ctx, { id }) => {
    await assertTimeWrite(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) return;
    await assertDatesOpen(ctx, [existing.date]);
    await ctx.db.delete(id);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      entity: "holiday",
      entityId: id,
      action: "delete",
      before: existing,
    });
    await invalidateTotals(ctx, null, [existing.date]);
  },
});

/** Add the generated holidays of `year` that aren't there yet. Idempotent:
 *  a date an admin already has (or edited) is left alone. Deliberately not
 *  stopped by the month lock — it only fills in the official calendar where
 *  nothing is set, which the first run needs for the months before go-live. */
export async function seedHolidays(
  ctx: MutationCtx,
  year: number,
  actorId?: Id<"users">,
): Promise<number> {
  const existing = new Set(
    (await loadHolidays(ctx, `${year}-01-01`, `${year}-12-31`)).map((row) => row.date),
  );
  let added = 0;
  for (const holiday of bavarianHolidays(year)) {
    if (existing.has(holiday.date)) continue;
    const row = { ...holiday, region: HOLIDAY_REGION, updatedAt: Date.now() };
    const id = await ctx.db.insert("holidays", row);
    await writeAudit(ctx, { actorId, entity: "holiday", entityId: id, action: "seed", after: row });
    await invalidateTotals(ctx, null, [holiday.date]);
    added += 1;
  }
  return added;
}

export const seedYear = userMutation({
  role: "admin",
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    await assertTimeWrite(ctx);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw timeError("bad_request", "invalid_range", "Bad year");
    }
    return seedHolidays(ctx, year, ctx.caller.id);
  },
});

export const seedYearInternal = internalMutation({
  args: { year: v.number() },
  handler: async (ctx, { year }) => seedHolidays(ctx, year),
});
