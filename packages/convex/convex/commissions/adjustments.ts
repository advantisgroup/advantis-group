import { ConvexError, v } from "convex/values";

import { userMutation } from "../functions";

/**
 * Provisionen: hand changes for one employee and month — Closed Won and
 * hitrate overrides, a note, and "Gesund-Bonus ausgezahlt". Admins only.
 * A field left out stays as it is, `null` clears it; a row with nothing left
 * in it is removed, so the month is back to the automatic figures.
 */
export const set = userMutation({
  role: "admin",
  args: {
    companyId: v.id("companies"),
    ym: v.string(),
    employeeId: v.id("performanceEmployees"),
    wonOverride: v.optional(v.union(v.number(), v.null())),
    hitrateOverride: v.optional(v.union(v.number(), v.null())),
    healthyPaid: v.optional(v.boolean()),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.ym)) {
      throw new ConvexError({ code: "invalid", message: "Monat im Format JJJJ-MM angeben." });
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.companyId !== args.companyId) {
      throw new ConvexError({ code: "not_found", message: "Mitarbeiter nicht gefunden." });
    }
    const won = args.wonOverride;
    if (typeof won === "number" && (!Number.isInteger(won) || won < 0 || won > 10_000)) {
      throw new ConvexError({
        code: "invalid",
        message: "Closed Won als ganze Zahl ab 0 angeben.",
      });
    }
    const hitrate = args.hitrateOverride;
    if (
      typeof hitrate === "number" &&
      (!Number.isFinite(hitrate) || hitrate < 0 || hitrate > 1000)
    ) {
      throw new ConvexError({ code: "invalid", message: "Hitrate in Prozent ab 0 angeben." });
    }

    const existing = (
      await ctx.db
        .query("commissionAdjustments")
        .withIndex("by_employee_ym", (q) => q.eq("employeeId", args.employeeId).eq("ym", args.ym))
        .collect()
    ).find((row) => row.companyId === args.companyId);

    const pick = <T>(next: T | null | undefined, current: T | undefined): T | undefined =>
      next === undefined ? current : next === null ? undefined : next;
    const noteArg = args.note === undefined ? undefined : args.note?.trim().slice(0, 500) || null;
    const note = pick(noteArg, existing?.note);
    const next = {
      wonOverride: pick(won, existing?.wonOverride),
      hitrateOverride: pick(
        typeof hitrate === "number" ? Math.round(hitrate * 10) / 10 : hitrate,
        existing?.hitrateOverride,
      ),
      healthyPaid:
        args.healthyPaid === undefined ? existing?.healthyPaid : args.healthyPaid || undefined,
      note,
    };
    const empty =
      next.wonOverride === undefined &&
      next.hitrateOverride === undefined &&
      !next.healthyPaid &&
      next.note === undefined;

    if (empty) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    const fields = { ...next, updatedBy: ctx.caller.user._id, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.replace(existing._id, {
        companyId: existing.companyId,
        ym: existing.ym,
        employeeId: existing.employeeId,
        ...fields,
      });
      return existing._id;
    }
    return await ctx.db.insert("commissionAdjustments", {
      companyId: args.companyId,
      ym: args.ym,
      employeeId: args.employeeId,
      ...fields,
    });
  },
});
