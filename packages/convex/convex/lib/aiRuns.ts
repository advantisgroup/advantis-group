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
);

export const aiRunPhase = v.union(v.literal("reading"), v.literal("writing"), v.literal("finishing"));

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
