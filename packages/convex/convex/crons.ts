import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs. ActivityTrack polls Genesys + Clockodo and folds the results
 * into the fused employee state, plus daily retention pruning. Convex crons run
 * on the free tier and can fire frequently. Adjust the schedule to your team's
 * hours / timezone.
 */
const crons = cronJobs();

// Reconcile Clockodo absences into the intranet mirror (absences tab +
// calendar). The apps/api webhook is the fast path; this hourly pass catches
// missed webhooks, deletions, and employees who got linked after the fact.
crons.hourly(
  "absences: sync Clockodo mirror",
  { minuteUTC: 35 },
  internal.absenceSync.syncClockodoAbsences,
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

crons.daily(
  "clockodo: prune old webhook delivery log",
  { hourUTC: 3, minuteUTC: 45 },
  internal.clockodoWebhookLog.pruneOldWebhookLogs,
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
