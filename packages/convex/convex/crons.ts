import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs. ActivityTrack polls Genesys + Clockodo and folds the results
 * into the fused employee state, plus daily retention pruning. Convex crons run
 * on the free tier and can fire frequently. Adjust the schedule to your team's
 * hours / timezone.
 */
const crons = cronJobs();

// Poll integrations during business hours on weekdays (UTC). Clockodo clock-ins
// still arrive via webhook outside this window.
crons.cron(
  "activity: poll integrations",
  "*/2 5-18 * * 1-5",
  internal.activity.integrations.pollAll,
  {}
);

crons.daily(
  "activity: prune old raw samples",
  { hourUTC: 3, minuteUTC: 0 },
  internal.activity.maintenance.pruneOldSamples,
  {}
);

crons.daily(
  "activity: prune old state history",
  { hourUTC: 3, minuteUTC: 15 },
  internal.activity.maintenance.pruneOldStateSamples,
  {}
);

crons.daily(
  "activity: prune old resolved events",
  { hourUTC: 3, minuteUTC: 30 },
  internal.activity.events.purgeOldEvents,
  {}
);

export default crons;
