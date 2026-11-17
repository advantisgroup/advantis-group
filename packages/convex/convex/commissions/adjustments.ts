import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";

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

    const existing = await findRow(ctx, args);

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
      extras: existing?.extras,
    };
    return await writeRow(ctx, args, existing, next);
  },
});

type Key = {
  companyId: Id<"companies">;
  ym: string;
  employeeId: Id<"performanceEmployees">;
};
type Fields = Pick<
  Doc<"commissionAdjustments">,
  "wonOverride" | "hitrateOverride" | "healthyPaid" | "note" | "extras"
>;

async function checkKey(ctx: MutationCtx, key: Key) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key.ym)) {
    throw new ConvexError({ code: "invalid", message: "Monat im Format JJJJ-MM angeben." });
  }
  const employee = await ctx.db.get(key.employeeId);
  if (!employee || employee.companyId !== key.companyId) {
    throw new ConvexError({ code: "not_found", message: "Mitarbeiter nicht gefunden." });
  }
}

async function findRow(ctx: MutationCtx, key: Key) {
  return (
    await ctx.db
      .query("commissionAdjustments")
      .withIndex("by_employee_ym", (q) => q.eq("employeeId", key.employeeId).eq("ym", key.ym))
      .collect()
  ).find((row) => row.companyId === key.companyId);
}

/** Saves the row, or removes it once nothing is left in it. */
async function writeRow(
  ctx: MutationCtx & { caller: { user: Doc<"users"> } },
  key: Key,
  existing: Doc<"commissionAdjustments"> | undefined,
  next: Fields,
) {
  const extras = next.extras?.length ? next.extras : undefined;
  const empty =
    next.wonOverride === undefined &&
    next.hitrateOverride === undefined &&
    !next.healthyPaid &&
    next.note === undefined &&
    extras === undefined;
  if (empty) {
    if (existing) await ctx.db.delete(existing._id);
    return null;
  }
  const fields = { ...next, extras, updatedBy: ctx.caller.user._id, updatedAt: Date.now() };
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
    companyId: key.companyId,
    ym: key.ym,
    employeeId: key.employeeId,
    ...fields,
  });
}

function keep(row: Doc<"commissionAdjustments"> | undefined): Fields {
  return {
    wonOverride: row?.wonOverride,
    hitrateOverride: row?.hitrateOverride,
    healthyPaid: row?.healthyPaid,
    note: row?.note,
    extras: row?.extras,
  };
}

const keyArgs = {
  companyId: v.id("companies"),
  ym: v.string(),
  employeeId: v.id("performanceEmployees"),
};

/** Sonderbetrag hinzufügen, z. B. 500 € „besondere Vereinbarung“. Negative
 * amounts are allowed (Abzug). */
export const addExtra = userMutation({
  role: "admin",
  args: { ...keyArgs, amount: v.number(), label: v.string() },
  handler: async (ctx, { amount, label, ...key }) => {
    await checkKey(ctx, key);
    const cents = Math.round(amount * 100) / 100;
    if (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > 100_000) {
      throw new ConvexError({ code: "invalid", message: "Betrag in Euro angeben (nicht 0)." });
    }
    const text = label.trim().slice(0, 200);
    if (!text) {
      throw new ConvexError({ code: "invalid", message: "Bitte einen Grund angeben." });
    }
    const existing = await findRow(ctx, key);
    const extra = {
      id: crypto.randomUUID(),
      amount: cents,
      label: text,
      addedBy: ctx.caller.user._id,
      addedAt: Date.now(),
    };
    return await writeRow(ctx, key, existing, {
      ...keep(existing),
      extras: [...(existing?.extras ?? []), extra],
    });
  },
});

export const removeExtra = userMutation({
  role: "admin",
  args: { ...keyArgs, id: v.string() },
  handler: async (ctx, { id, ...key }) => {
    await checkKey(ctx, key);
    const existing = await findRow(ctx, key);
    if (!existing?.extras?.some((e) => e.id === id)) {
      throw new ConvexError({ code: "not_found", message: "Betrag nicht gefunden." });
    }
    return await writeRow(ctx, key, existing, {
      ...keep(existing),
      extras: existing.extras.filter((e) => e.id !== id),
    });
  },
});
