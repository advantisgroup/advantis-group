import { v } from "convex/values";

export const aiRunKind = v.union(
  v.literal("wikiChat"),
  v.literal("wikiFormat"),
  v.literal("wikiMeta"),
  v.literal("coachReport"),
  v.literal("coachEod"),
  v.literal("coachWikiExtract"),
  v.literal("cvExtract"),
  v.literal("cvRescan"),
  v.literal("ask"),
  v.literal("dailyBrief"),
  v.literal("navigate"),
);

/** Records you can ask a question about in place. Each one has an access rule
 * of its own in `aiRuns.askContext`, checked before any text is assembled. */
export const askSubjectType = v.union(
  v.literal("itTicket"),
  v.literal("applicant"),
  v.literal("announcement"),
  v.literal("errorReport"),
  v.literal("suggestion"),
);

export const aiRunPhase = v.union(
  v.literal("reading"),
  v.literal("writing"),
  v.literal("finishing"),
);

export const aiRunStatus = v.union(
  v.literal("running"),
  v.literal("done"),
  v.literal("error"),
  v.literal("cancelled"),
);

/** The API pushes at least every 5s while a run is alive. A few missed beats
 * means the function running it is gone (timeout, crash, redeploy), and the
 * run is reported as interrupted instead of spinning forever. The browser
 * applies the same threshold on its own clock. */
export const AI_RUN_STALE_MS = 20_000;

/** AI requests an employee may start in any 24 hours, unless the workspace
 * or one of their roles says otherwise. */
export const DEFAULT_DAILY_RUN_LIMIT = 60;
export const MAX_DAILY_RUN_LIMIT = 1000;

export function isValidDailyRunLimit(limit: number) {
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_DAILY_RUN_LIMIT;
}
