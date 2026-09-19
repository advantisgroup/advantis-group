import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { type Doc } from "../../_generated/dataModel";
import { computeEmployeeState, type EmployeeState, type StateSignals } from "./state";
import {
  isWithinBusinessHours,
  startOfBusinessDayUtcMs,
  WORK_EVIDENCE_STATES,
} from "./businessHours";

export function signalsOf(row: Partial<Doc<"employeeStates">>): StateSignals {
  return {
    deviceIdle: row.deviceIdle,
    idleSeconds: row.idleSeconds,
    genesysRoutingStatus: row.genesysRoutingStatus,
    genesysPresence: row.genesysPresence,
    genesysWrapUp: row.genesysWrapUp,
    clockodoWorking: row.clockodoWorking,
    clockodoBreak: row.clockodoBreak,
    clockodoAbsent: row.clockodoAbsent,
    clockodoClockedOut: row.clockodoClockedOut,
  };
}

/**
 * Anchor entry into CLOCKED_OUT to Clockodo's own last-entry-end (`since`),
 * not whenever this poll happened to run. Deletes every sample from `since`
 * onward — a stray BREAK recorded before we knew the true instant, an earlier
 * CLOCKED_OUT anchored at a now-stale time, or nothing at all if a poll outage
 * meant the gap went unnoticed for hours — and replaces them with one fresh
 * CLOCKED_OUT sample at `since`. Without this, a late-running evening poll (or
 * one that missed an outage window entirely) would leave the real clock-out
 * moment showing as a multi-hour "still on break" stretch, only flipping to
 * "clocked out" at whenever the poll happened to notice.
 */
export async function collapseIntoClockedOut(
  ctx: MutationCtx,
  employeeId: string,
  since: number,
): Promise<void> {
  const stray = await ctx.db
    .query("stateSamples")
    .withIndex("by_employee_time", (q) => q.eq("employeeId", employeeId).gte("at", since))
    .take(1000);
  for (const s of stray) await ctx.db.delete(s._id);
  await ctx.db.insert("stateSamples", {
    employeeId,
    state: "CLOCKED_OUT",
    at: since,
  });
  console.info(
    `[activity:state] ${employeeId} CLOCKED_OUT anchored to ${new Date(since).toISOString()}` +
      (stray.length > 0 ? ` — collapsed ${stray.length} stale sample(s) recorded after that` : ""),
  );
}

/**
 * Withdraw the "assumed clocked out" interpretation for today: the person is
 * clocked in again (or a retro-added entry closed the gap), so every same-day
 * CLOCKED_OUT stretch was actually a break. Samples are patched in place — or
 * deleted when the preceding sample is already BREAK, so the break reads as
 * one uninterrupted stretch. Day boundary is business-timezone midnight,
 * matching the Clockodo poller's "today's entries" window; yesterday's
 * assumption is left alone (ending the day and coming back tomorrow really
 * was a clock-out).
 */
export async function reclassifyClockedOutAsBreak(
  ctx: MutationCtx,
  employeeId: string,
): Promise<void> {
  const dayStart = startOfBusinessDayUtcMs();
  const samples = await ctx.db
    .query("stateSamples")
    .withIndex("by_employee_time", (q) => q.eq("employeeId", employeeId).gte("at", dayStart))
    .order("asc")
    .take(1000);

  let prevState: string | null = null;
  let touched = 0;
  for (const s of samples) {
    if (s.state === "CLOCKED_OUT") {
      if (prevState === "BREAK") {
        await ctx.db.delete(s._id); // merge into the preceding break
      } else {
        await ctx.db.patch(s._id, { state: "BREAK" });
      }
      prevState = "BREAK";
      touched++;
      continue;
    }
    prevState = s.state;
  }
  if (touched > 0) {
    console.info(
      `[activity:state] ${employeeId} CLOCKED_OUT withdrawn — ${touched} sample(s) reclassified to BREAK (clocked back in today)`,
    );
  }
}

export interface StateSignalArgs {
  employeeId: string;
  source: "agent" | "genesys" | "clockodo";
  deviceIdle?: boolean;
  idleSeconds?: number;
  genesysRoutingStatus?: "IDLE" | "INTERACTING" | "OFF_QUEUE" | "NOT_RESPONDING";
  genesysPresence?: "AVAILABLE" | "BUSY" | "AWAY" | "OFFLINE";
  genesysWrapUp?: boolean;
  clockodoWorking?: boolean;
  clockodoBreak?: boolean;
  clockodoAbsent?: boolean;
  clockodoClockedOut?: boolean;
  clockodoClockedOutCertain?: boolean;
  clockodoClockedOutSince?: number;
}

/**
 * Apply one source's slice of signals to the cache and recompute `finalState`.
 * Only the fields a source actually provides are patched.
 *
 * Shared core behind the public `pushSignal` mutation (secret-guarded,
 * server-to-server from the Elysia API) and the raw `/ingest` HTTP action's
 * `agent` signal (device-token-guarded, called directly from within Convex —
 * see `activity/ingest.ts`). Callers other than `pushSignal` are already
 * authenticated by their own means, so this function itself trusts its input.
 *
 * Only reachable through those two callers, both gated by the
 * `activitytrack` feature flag (see `functions.ts`), so this never
 * runs while it's disabled.
 */
export async function applyStateSignal(
  ctx: MutationCtx,
  args: StateSignalArgs,
): Promise<{
  employeeId: string;
  finalState: EmployeeState;
}> {
  const now = Date.now();

  const existing = await getStateRow(ctx, args.employeeId);

  const patch: Partial<Doc<"employeeStates">> = {};
  if (args.source === "agent") {
    if (args.deviceIdle !== undefined) patch.deviceIdle = args.deviceIdle;
    if (args.idleSeconds !== undefined) patch.idleSeconds = args.idleSeconds;
    patch.agentUpdatedAt = now;
  } else if (args.source === "genesys") {
    if (args.genesysRoutingStatus !== undefined)
      patch.genesysRoutingStatus = args.genesysRoutingStatus;
    if (args.genesysPresence !== undefined) patch.genesysPresence = args.genesysPresence;
    if (args.genesysWrapUp !== undefined) patch.genesysWrapUp = args.genesysWrapUp;
    patch.genesysUpdatedAt = now;
  } else {
    if (args.clockodoWorking !== undefined) patch.clockodoWorking = args.clockodoWorking;
    if (args.clockodoBreak !== undefined) patch.clockodoBreak = args.clockodoBreak;
    if (args.clockodoAbsent !== undefined) patch.clockodoAbsent = args.clockodoAbsent;
    if (args.clockodoClockedOut !== undefined) patch.clockodoClockedOut = args.clockodoClockedOut;
    if (args.clockodoClockedOutCertain !== undefined)
      patch.clockodoClockedOutCertain = args.clockodoClockedOutCertain;
    if (args.clockodoClockedOutSince !== undefined)
      patch.clockodoClockedOutSince = args.clockodoClockedOutSince;
    patch.clockodoUpdatedAt = now;
  }

  // A Clockodo signal that ends an "assumed clocked out" stretch (they
  // clocked back in, or a retro-added entry closed the gap) withdraws the
  // assumption: today's CLOCKED_OUT history is corrected to BREAK before the
  // new state lands. Once the clock-out became *certain* (past the business
  // day-end hour) there is nothing to withdraw — a later clock-in starts a
  // new stint and the evening stays clocked out.
  if (
    args.source === "clockodo" &&
    args.clockodoClockedOut === false &&
    existing?.clockodoClockedOutCertain !== true &&
    (existing?.clockodoClockedOut === true || existing?.finalState === "CLOCKED_OUT")
  ) {
    await reclassifyClockedOutAsBreak(ctx, args.employeeId);
  }

  const merged = { ...(existing ?? {}), ...patch };
  let finalState = computeEmployeeState(signalsOf(merged));
  let stateChanged = !existing || existing.finalState !== finalState;

  // Out-of-hours quarantine: a transition into a "working" state (ACTIVE,
  // IDLE, IN_CALL, WRAP_UP, BREAK) outside business hours is not believed —
  // nobody starts working at 3 AM here, but overnight integration polls and
  // machines waking for updates do produce such signals (and the engine's
  // fall-through default is ACTIVE). The rejected transition is preserved in
  // `discardedStateSamples` for the audit UI, the raw source fields are
  // still cached, and the previous fused state stays in force. CLOCKED_OUT /
  // ABSENT transitions always land — they assert the opposite of working.
  if (stateChanged && WORK_EVIDENCE_STATES.has(finalState) && !isWithinBusinessHours(now)) {
    // One quarantine row per suppressed candidate, not one per poll: skip
    // when the same candidate state was already logged since the last real
    // state change.
    const lastDiscarded = await ctx.db
      .query("discardedStateSamples")
      .withIndex("by_employee_time", (q) => q.eq("employeeId", args.employeeId))
      .order("desc")
      .first();
    const alreadyLogged =
      lastDiscarded?.state === finalState && lastDiscarded.at >= (existing?.finalStateSince ?? 0);
    if (!alreadyLogged) {
      await ctx.db.insert("discardedStateSamples", {
        employeeId: args.employeeId,
        state: finalState,
        at: now,
        reason: "outside_business_hours",
        source: args.source,
      });
      console.info(
        `[activity:state] ${args.employeeId} ${existing?.finalState ?? "(new)"} -> ${finalState} DISCARDED (outside business hours, source=${args.source})`,
      );
    }
    // Fall back to CLOCKED_OUT for a brand-new row — out of hours, "not
    // working" is the only defensible default.
    finalState = existing?.finalState ?? "CLOCKED_OUT";
    stateChanged = !existing;
  }

  // Track when the fused state last *changed*, so the dashboard can say
  // "inactive since 13:42" instead of only "updated 2m ago".
  let finalStateSince = stateChanged
    ? now
    : (existing?.finalStateSince ?? existing?.updatedAt ?? now);

  if (stateChanged) {
    console.info(
      `[activity:state] ${args.employeeId} ${existing?.finalState ?? "(new)"} -> ${finalState} (source=${args.source})`,
    );
    // Entering CLOCKED_OUT (assumed or certain) is a *reinterpretation* of
    // the not-clocked-in gap that started at the real clock-out — so anchor
    // to Clockodo's own last-entry-end (`clockedOutSince`), not whenever
    // this poll happened to run, and collapse anything recorded in between
    // (a stray BREAK sample, or nothing at all across a poll outage) into
    // one continuous stretch. Falls back to `now` if the source didn't
    // supply an anchor (shouldn't happen on the clockodo path; defensive
    // for any other caller).
    const clockedOutSince =
      finalState === "CLOCKED_OUT"
        ? (patch.clockodoClockedOutSince ?? existing?.clockodoClockedOutSince ?? null)
        : null;
    if (finalState === "CLOCKED_OUT" && clockedOutSince != null) {
      await collapseIntoClockedOut(ctx, args.employeeId, clockedOutSince);
      finalStateSince = clockedOutSince;
    } else {
      await ctx.db.insert("stateSamples", {
        employeeId: args.employeeId,
        state: finalState,
        at: now,
      });
    }
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...patch,
      finalState,
      finalStateSince,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("employeeStates", {
      employeeId: args.employeeId,
      ...patch,
      finalState,
      finalStateSince,
      updatedAt: now,
    });
  }

  return { employeeId: args.employeeId, finalState };
}

export async function getStateRow(
  ctx: MutationCtx | QueryCtx,
  employeeId: string,
): Promise<Doc<"employeeStates"> | null> {
  return await ctx.db
    .query("employeeStates")
    .withIndex("by_employeeId", (q) => q.eq("employeeId", employeeId))
    .unique();
}
