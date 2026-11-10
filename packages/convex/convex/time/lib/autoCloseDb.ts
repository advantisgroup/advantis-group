import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { autoCloseCutoff, autoCloseEnd } from "./autoClose";
import { berlinDate, monthOf } from "./berlin";
import { measureDay } from "./days";
import { regularMinutesOn } from "./schedule";
import {
  invalidateTotals,
  isActive,
  loadEntries,
  loadSchedules,
  monthLocked,
  writeAudit,
} from "./store";

const MINUTE = 60_000;

/**
 * The end the 18:00 rule books for `work` with the person's *current*
 * schedules and the day's other entries — shared by the job that closes the
 * entry and by the recalculation after a schedule change.
 */
export async function autoCloseEndFor(
  ctx: QueryCtx,
  work: Doc<"timeEntries">,
  cutoff: number,
): Promise<number> {
  const date = berlinDate(work.start);
  const [dayEntries, schedules] = await Promise.all([
    loadEntries(ctx, work.userId, date, date),
    loadSchedules(ctx, work.userId),
  ]);
  const active = dayEntries.filter(isActive);
  const earlier = active.filter((row) => row.end !== undefined && row.start < work.start);
  const earlierWorkedMinutes = Math.round(measureDay(earlier, 0).workedMs / MINUTE);
  const breakMinutesInside = Math.round(
    active
      .filter(
        (row) =>
          row.kind === "break" &&
          row.end !== undefined &&
          row.start >= work.start &&
          (work.end === undefined || row.start < work.end),
      )
      .reduce((sum, row) => sum + (row.end! - row.start), 0) / MINUTE,
  );
  return autoCloseEnd({
    start: work.start,
    cutoff,
    regularMinutes: regularMinutesOn(schedules, date),
    earlierWorkedMinutes,
    breakMinutesInside,
  });
}

/**
 * Re-books the end of every still-untouched 18:00-rule entry of one person
 * from `fromDate` on, so a schedule entered or changed afterwards (e.g. back-
 * dated) applies to those days too. Corrected entries are no longer
 * `auto18` and stay as they are; locked months and days whose break was also
 * closed by the rule are skipped. The entry keeps its id, so a pending
 * correction for it stays valid. Returns how many entries changed.
 */
export async function recalcAutoClosed(
  ctx: MutationCtx,
  userId: Id<"users">,
  fromDate: string,
  actorId?: Id<"users">,
): Promise<number> {
  const rows = await ctx.db
    .query("timeEntries")
    .withIndex("by_user_start", (q) => q.eq("userId", userId))
    .collect();
  const candidates = rows.filter(
    (row) =>
      row.source === "auto18" &&
      row.kind === "work" &&
      row.status === "active" &&
      row.end !== undefined &&
      berlinDate(row.start) >= fromDate,
  );
  let changed = 0;
  for (const work of candidates) {
    const date = berlinDate(work.start);
    if (await monthLocked(ctx, monthOf(date))) continue;
    const autoBreak = rows.some(
      (row) =>
        row.kind === "break" && row.autoClosed && isActive(row) && berlinDate(row.start) === date,
    );
    if (autoBreak) continue;
    const end = await autoCloseEndFor(ctx, work, autoCloseCutoff(work.start));
    if (end === work.end) continue;
    const patch = { end, updatedAt: Date.now() };
    await ctx.db.patch(work._id, patch);
    await writeAudit(ctx, {
      actorId,
      subjectUserId: work.userId,
      entity: "entry",
      entityId: work._id,
      action: "autoCloseRecalc",
      before: work,
      after: { ...work, ...patch },
      reason: "Arbeitszeitmodell geändert",
    });
    await invalidateTotals(ctx, work.userId, [date]);
    changed += 1;
  }
  return changed;
}
