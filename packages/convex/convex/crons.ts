import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs. ActivityTrack polls Genesys + Clockodo and folds the results
 * into the fused employee state, plus daily retention pruning. Convex crons run
 * on the free tier and can fire frequently. Adjust the schedule to your team's
 * hours / timezone.
 */
const crons = cronJobs();

// Poll integrations around the clock, every day. This is the *only* thing that
// keeps the fused state honest when the Clockodo webhook is slow, misconfigured,
// or disabled server-side (which has happened) — a webhook-only gap used to
// leave people frozen in whatever state they were last seen in (e.g. "clocked
// in and working" hours after they actually clocked out) until the next
// business-hours poll picked it up. Frequent during the day for responsiveness,
// less frequent overnight/weekends where less changes but staleness still must
// resolve eventually — this cadence is also what lets the 20:00 "assumed →
// certain clocked-out" transition (see clockodo.ts) actually fire promptly in
// the evening instead of depending on a webhook that may not be there.
crons.cron(
  "activity: poll integrations (daytime)",
  "*/2 5-18 * * *",
  internal.activity.integrations.pollAll,
  {}
);
crons.cron(
  "activity: poll integrations (off-hours fallback)",
  "*/10 19-23,0-4 * * *",
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

// Keep the OneDrive change-notification subscription fresh (renew well within
// its expiry) so the file-listing cache invalidates promptly on changes.
crons.daily(
  "onedrive: renew change subscription",
  { hourUTC: 4, minuteUTC: 0 },
  internal.onedrive.renewSubscription,
  {}
);

// Delete DMs abandoned by one side once their 48h grace window elapses without
// a rejoin. Runs hourly so the "auto-deletes in …" countdown stays honest.
crons.hourly(
  "chat: purge expired left DMs",
  { minuteUTC: 20 },
  internal.chat.purgeExpiredDms,
  {}
);

export default crons;
