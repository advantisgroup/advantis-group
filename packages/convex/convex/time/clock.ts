import { userMutation, userQuery } from "../functions";
import { assertTimeAccess, assertTimeClock } from "./lib/mode";
import { berlinDate } from "./lib/berlin";
import {
  assertDatesOpen,
  invalidateTotals,
  isTrackingDisabled,
  openEntries,
  timeError,
  writeAudit,
} from "./lib/store";

/**
 * Clocking in the browser: one open work segment while you work, an open
 * break segment inside it while you pause. Always for yourself.
 */

/** Your clock right now. `status` is what the header pill shows. */
export const state = userQuery({
  args: {},
  handler: async (ctx) => {
    assertTimeAccess(ctx);
    const open = await openEntries(ctx, ctx.caller.id);
    const work = open.find((row) => row.kind === "work") ?? null;
    const pause = open.find((row) => row.kind === "break") ?? null;
    return {
      status: work ? (pause ? ("break" as const) : ("working" as const)) : ("out" as const),
      workStart: work?.start ?? null,
      breakStart: pause?.start ?? null,
    };
  },
});

export const clockIn = userMutation({
  args: {},
  handler: async (ctx) => {
    assertTimeClock(ctx);
    if (await isTrackingDisabled(ctx, ctx.caller.id)) {
      throw timeError("conflict", "tracking_disabled", "Time tracking is off for this person");
    }
    const open = await openEntries(ctx, ctx.caller.id);
    if (open.some((row) => row.kind === "work")) {
      throw timeError("conflict", "already_clocked_in", "Already clocked in");
    }
    const now = Date.now();
    await assertDatesOpen(ctx, [berlinDate(now)]);
    const row = {
      userId: ctx.caller.id,
      kind: "work" as const,
      start: now,
      source: "clock" as const,
      status: "active" as const,
      createdBy: ctx.caller.id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeEntries", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: ctx.caller.id,
      entity: "entry",
      entityId: id,
      action: "clockIn",
      after: row,
    });
    return id;
  },
});

export const startBreak = userMutation({
  args: {},
  handler: async (ctx) => {
    assertTimeClock(ctx);
    const open = await openEntries(ctx, ctx.caller.id);
    if (!open.some((row) => row.kind === "work")) {
      throw timeError("conflict", "not_clocked_in", "Not clocked in");
    }
    if (open.some((row) => row.kind === "break")) {
      throw timeError("conflict", "already_on_break", "Already on a break");
    }
    const now = Date.now();
    const row = {
      userId: ctx.caller.id,
      kind: "break" as const,
      start: now,
      source: "clock" as const,
      status: "active" as const,
      createdBy: ctx.caller.id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("timeEntries", row);
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: ctx.caller.id,
      entity: "entry",
      entityId: id,
      action: "breakStart",
      after: row,
    });
    return id;
  },
});

export const endBreak = userMutation({
  args: {},
  handler: async (ctx) => {
    assertTimeClock(ctx);
    const open = await openEntries(ctx, ctx.caller.id);
    const pause = open.find((row) => row.kind === "break");
    if (!pause) throw timeError("conflict", "not_on_break", "Not on a break");
    const now = Date.now();
    await ctx.db.patch(pause._id, { end: now, updatedAt: now });
    await writeAudit(ctx, {
      actorId: ctx.caller.id,
      subjectUserId: ctx.caller.id,
      entity: "entry",
      entityId: pause._id,
      action: "breakEnd",
      before: pause,
      after: { ...pause, end: now, updatedAt: now },
    });
    await invalidateTotals(ctx, ctx.caller.id, [berlinDate(pause.start)]);
  },
});

/** Ends a running break along with the work segment. */
export const clockOut = userMutation({
  args: {},
  handler: async (ctx) => {
    assertTimeClock(ctx);
    const open = await openEntries(ctx, ctx.caller.id);
    const work = open.find((row) => row.kind === "work");
    if (!work) throw timeError("conflict", "not_clocked_in", "Not clocked in");
    const now = Date.now();
    await assertDatesOpen(ctx, [berlinDate(work.start)]);
    for (const row of open) {
      await ctx.db.patch(row._id, { end: now, updatedAt: now });
      await writeAudit(ctx, {
        actorId: ctx.caller.id,
        subjectUserId: ctx.caller.id,
        entity: "entry",
        entityId: row._id,
        action: row.kind === "work" ? "clockOut" : "breakEnd",
        before: row,
        after: { ...row, end: now, updatedAt: now },
      });
    }
    await invalidateTotals(ctx, ctx.caller.id, [berlinDate(work.start)]);
  },
});
